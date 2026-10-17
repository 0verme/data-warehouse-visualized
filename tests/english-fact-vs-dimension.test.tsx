import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FactVsDimensionLab } from '../src/components/english/FactVsDimensionLab'
import {
  DIM_ACCOUNT_ROWS,
  DIM_BRANCH_ROWS,
  FACT_DIMENSION_SCENARIOS,
  FACT_ROWS,
  ROLE_DEFINITIONS,
  aggregateBalanceByBranch,
  buildFactDimensionReference,
} from '../src/features/english-modeling/model'

const CJK = /[\u3400-\u9fff]/

describe('English fact vs dimension model', () => {
  it('keeps one fact row per account per day and stores keys, not attributes', () => {
    expect(FACT_ROWS).toHaveLength(4)
    expect(new Set(FACT_ROWS.map((row) => row.account_sk)).size).toBe(4)
    for (const row of FACT_ROWS) {
      expect(typeof row.balance).toBe('number')
      expect(row.branch_sk).toMatch(/^B\d$/)
      expect(row.product_sk).toMatch(/^P\d$/)
    }
    expect(DIM_BRANCH_ROWS.map((row) => row.branch_name)).toEqual(['Hangzhou', 'Shanghai'])
    expect(DIM_ACCOUNT_ROWS.every((row) => !('balance' in row))).toBe(true)
  })

  it('produces the correct total when the measure comes from the fact table', () => {
    const reference = buildFactDimensionReference()
    expect(reference.correctTotal).toBe(1_250_000)
    expect(reference.correctRows).toEqual([
      { branch_name: 'Hangzhou', total_balance: 750_000 },
      { branch_name: 'Shanghai', total_balance: 500_000 },
    ])
  })

  it('inflates the total when the dimension key is not unique', () => {
    const reference = buildFactDimensionReference()
    expect(reference.duplicateTotal).toBe(2_000_000)
    expect(reference.inflatedBy).toBe(750_000)
    expect(reference.duplicateRows).toEqual([
      { branch_name: 'Hangzhou', total_balance: 750_000 },
      { branch_name: 'Hangzhou (old)', total_balance: 750_000 },
      { branch_name: 'Shanghai', total_balance: 500_000 },
    ])
  })

  it('filters on a dimension attribute without changing the measured grain', () => {
    const reference = buildFactDimensionReference()
    expect(reference.eastTotal).toBe(1_250_000)
    const west = aggregateBalanceByBranch(
      DIM_BRANCH_ROWS.filter((branch) => branch.region === 'West'),
    )
    expect(west.total).toBe(0)
  })

  it('keeps four worked scenarios with an explicit rule each', () => {
    expect(FACT_DIMENSION_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'correct-measure',
      'measure-in-dimension',
      'duplicate-dimension-key',
      'dimension-filter',
    ])
    for (const scenario of FACT_DIMENSION_SCENARIOS) {
      expect(scenario.rule.length, scenario.id).toBeGreaterThan(20)
      expect(scenario.sql.length, scenario.id).toBeGreaterThan(20)
    }
    expect(ROLE_DEFINITIONS.map((role) => role.id)).toEqual(['fact', 'dimension'])
  })

  it('keeps every rendered string free of Chinese copy', () => {
    const strings = [
      ...FACT_DIMENSION_SCENARIOS.flatMap((scenario) => [
        scenario.label,
        scenario.question,
        scenario.measureSource,
        scenario.contextSource,
        scenario.joinKey,
        scenario.sql,
        scenario.rule,
      ]),
      ...ROLE_DEFINITIONS.flatMap((role) => [
        role.label,
        role.stores,
        role.key,
        role.examples,
        role.width,
      ]),
    ]
    for (const value of strings) {
      expect(CJK.test(value), value).toBe(false)
    }
  })

  it('produces a deterministic reference snapshot', () => {
    const first = buildFactDimensionReference()
    const second = buildFactDimensionReference()
    expect(first).toEqual(second)
    expect(first.accountColumnsWithoutMeasure).toEqual([
      'account_sk',
      'account_id',
      'customer_name',
      'status',
    ])
  })

  it('renders the correct-measure scenario with server-rendered result', () => {
    const markup = renderToStaticMarkup(<FactVsDimensionLab />)

    expect(markup).toContain('One question · two roles')
    expect(markup).toContain('Correct: measure from the fact table')
    expect(markup).toContain('fact_deposit_balance_daily.balance')
    expect(markup).toContain('1,250,000')
    expect(markup).toContain('Hangzhou')
    expect(markup).toContain('aria-live="polite"')
  })
})
