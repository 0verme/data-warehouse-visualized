import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GrainChooserLab } from '../src/components/english/GrainChooserLab'
import { IdempotentRerunLab } from '../src/components/english/IdempotentRerunLab'
import { JoinDuplicatesLab } from '../src/components/english/JoinDuplicatesLab'
import { LineageVsDependencyLab } from '../src/components/english/LineageVsDependencyLab'
import { ScdTimelineLab } from '../src/components/english/ScdTimelineLab'
import { createJoinDemoState } from '../src/features/english-join/model'
import { buildJoinDuplicatesSteps } from '../src/features/english-join/steps'
import {
  createEnglishGrainErrorResult,
  englishGrainOptions,
} from '../src/features/english-grain/model'
import {
  applyRerun,
  createInitialRerunState,
  getRerunMetrics,
  setPolicy,
} from '../src/features/english-etl/model'
import { scenarios } from '../src/features/english-lineage/model'
import {
  createScdView,
  createType1Versions,
  createType2Versions,
} from '../src/features/english-scd/model'
import { diffCustomerDays } from '../src/utils/customer-history'

describe('English JOIN duplicate rows · deterministic model', () => {
  it('computes 1:N fan-out and the inflated SUM from the fixture', () => {
    const state = createJoinDemoState('payments')

    expect(state.resultRows).toHaveLength(3)
    expect(state.metrics).toMatchObject({
      joinedRows: 3,
      distinctOrders: 2,
      sumOrderAmount: 1100,
      expectedOrderTotal: 800,
      overcountedAmount: 300,
    })
  })

  it('computes M:N fan-out when both child tables repeat the key', () => {
    const state = createJoinDemoState('payments-shipments')

    expect(state.resultRows).toHaveLength(5)
    expect(state.metrics.sumOrderAmount).toBe(1700)
    expect(state.metrics.overcountedAmount).toBe(900)
  })

  it('restores the order grain after pre-aggregation and after EXISTS', () => {
    for (const mode of ['aggregated', 'exists'] as const) {
      const state = createJoinDemoState(mode)
      expect(state.resultRows).toHaveLength(2)
      expect(state.metrics.sumOrderAmount).toBe(800)
      expect(state.metrics.overcountedAmount).toBe(0)
    }
  })

  it('keeps seven deterministic steps with a full snapshot each', () => {
    const first = buildJoinDuplicatesSteps()
    const second = buildJoinDuplicatesSteps()

    expect(first.map((step) => step.id)).toEqual([
      'observe-keys',
      'one-to-many-fanout',
      'many-to-many-fanout',
      'metrics-lie',
      'distinct-trap',
      'fix-preaggregate',
      'fix-exists',
    ])
    expect(first).toEqual(second)
    for (const step of first) {
      expect(step.highlight, step.id).toBeDefined()
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.description.length).toBeGreaterThan(0)
    }
  })

  it('renders the first step as source keys with no joined rows', () => {
    const markup = renderToStaticMarkup(<JoinDuplicatesLab />)

    expect(markup).toContain('Step 1 / 7')
    expect(markup).toContain('orders · parent')
    expect(markup).toContain('3 rows, order_id repeats 2× for O-1001')
    expect(markup).toContain('No rows yet: the query has not joined the tables.')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('Previous')
    expect(markup).toContain('Next step')
  })
})

describe('English grain · deterministic model', () => {
  it('defines three grains for the same loan chain', () => {
    expect(englishGrainOptions.map((option) => option.id)).toEqual([
      'contract',
      'disbursement',
      'repayment',
    ])
    expect(englishGrainOptions.map((option) => option.amountTotal)).toEqual([600000, 450000, 85000])
  })

  it('doubles the contract amount when it is summed at the wrong grain', () => {
    const result = createEnglishGrainErrorResult()

    expect(result.actualContractAmount).toBe(600000)
    expect(result.wrongTotal).toBe(1200000)
    expect(result.fixedTotal).toBe(600000)
    expect(result.wrongDifference).toBe(600000)
  })

  it('renders the disbursement grain by default with real rows', () => {
    const markup = renderToStaticMarkup(<GrainChooserLab />)

    expect(markup).toContain('one row = one actual disbursement')
    expect(markup).toContain('LN-01')
    expect(markup).toContain('$450,000')
    expect(markup).toContain('Run SUM(contract_amount)')
    expect(markup).toContain('Wrong grain · join amplification')
  })
})

describe('English idempotent ETL · deterministic state transitions', () => {
  it('shows an append rerun duplicating the business date', () => {
    let state = createInitialRerunState('append')
    state = applyRerun(state, 'initial')
    state = applyRerun(state, 'initial')

    expect(state.rows).toHaveLength(2)
    expect(getRerunMetrics(state)).toMatchObject({
      rowsForPartition: 2,
      balanceTotal: 2000000,
      duplicateRows: 1,
    })
  })

  it('keeps one row with overwrite and merge, and updates a corrected value', () => {
    let overwrite = createInitialRerunState('append')
    overwrite = setPolicy(overwrite, 'overwrite')
    overwrite = applyRerun(overwrite, 'initial')
    overwrite = applyRerun(overwrite, 'initial')
    expect(overwrite.rows).toHaveLength(1)
    expect(getRerunMetrics(overwrite).balanceTotal).toBe(1000000)

    let merge = createInitialRerunState('append')
    merge = setPolicy(merge, 'merge')
    merge = applyRerun(merge, 'initial')
    merge = applyRerun(merge, 'corrected')
    expect(merge.rows).toHaveLength(1)
    expect(getRerunMetrics(merge).balanceTotal).toBe(1100000)
    expect(merge.runs.at(-1)?.updatedRows).toBe(1)
  })

  it('renders an empty partition before the first run', () => {
    const markup = renderToStaticMarkup(<IdempotentRerunLab />)

    expect(markup).toContain('INSERT APPEND')
    expect(markup).toContain('Run job (first load)')
    expect(markup).toContain('No rows yet. Run the job to load the partition.')
    expect(markup).toContain('aria-live="polite"')
  })
})

describe('English lineage vs task dependency · scenario model', () => {
  it('keeps four scenarios with distinct scheduler and lineage answers', () => {
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      'baseline',
      'late-customers',
      'rerun-job-a',
      'skip-report',
    ])

    const lateCustomers = scenarios.find((scenario) => scenario.id === 'late-customers')
    expect(lateCustomers?.schedulerAffected).toEqual([])
    expect(lateCustomers?.lineageAffected).toContain('report_daily')
  })

  it('renders both graphs with the scheduler gap called out', () => {
    const markup = renderToStaticMarkup(<LineageVsDependencyLab />)

    expect(markup).toContain('Scheduler / task dependency')
    expect(markup).toContain('Data / SQL lineage')
    expect(markup).toContain('JOB_A')
    expect(markup).toContain('v_customer_orders')
    expect(markup).toContain('depends_on (declared)')
    expect(markup).toContain('no declared')
  })
})

describe('English SCD Type 2 · deterministic versions and boundaries', () => {
  it('closes the old version and inserts a current version', () => {
    const versions = createType2Versions()

    expect(versions).toHaveLength(2)
    expect(versions[0]).toMatchObject({
      customerSk: 1001,
      effectiveFrom: '2025-01-01',
      effectiveTo: '2026-03-01',
      isCurrent: false,
    })
    expect(versions[1]).toMatchObject({
      customerSk: 2002,
      level: 'Premium',
      effectiveFrom: '2026-03-01',
      effectiveTo: '9999-12-31',
      isCurrent: true,
    })
  })

  it('keeps the original effective range for an overwrite (Type 1) update', () => {
    const versions = createType1Versions()

    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      level: 'Premium',
      branch: 'Denver',
      effectiveFrom: '2025-01-01',
      isCurrent: true,
    })
  })

  it('resolves the historical loan at the 2026-03-01 boundary', () => {
    const beforeIndex = diffCustomerDays('2025-01-01', '2026-02-28')
    const boundaryIndex = diffCustomerDays('2025-01-01', '2026-03-01')

    expect(createScdView('type2', beforeIndex).view.hit?.customerSk).toBe(1001)
    expect(createScdView('type2', boundaryIndex).view.hit?.customerSk).toBe(2002)
    expect(createScdView('type2', 0).loanMatch?.customerSk).toBe(1001)
    expect(createScdView('type1', 0).loanMatch).toMatchObject({
      level: 'Premium',
      branch: 'Denver',
    })
  })

  it('renders the timeline with both versions and the historical loan', () => {
    const markup = renderToStaticMarkup(<ScdTimelineLab />)

    expect(markup).toContain('SCD Type 2')
    expect(markup).toContain('1001')
    expect(markup).toContain('Standard')
    expect(markup).toContain('LN-77')
    expect(markup).toContain('aria-valuetext="2025-11-15"')
  })
})
