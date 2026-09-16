import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CapstoneWorkbench } from '../src/components/visualizations/CapstoneWorkbench'
import { capstoneVisualization } from '../src/features/capstone/banking'
import {
  buildBranchBusinessDaily,
  createInitialCapstoneState,
  getCapstoneLaunchReview,
  getCapstoneLaunchStatus,
  normalizeCapstoneState,
  transitionCapstoneProject,
} from '../src/utils/capstone'

function runHappyPath() {
  let state = createInitialCapstoneState()
  state = transitionCapstoneProject(state, { type: 'confirm-mission' })
  state = transitionCapstoneProject(state, {
    type: 'choose-grain',
    choice: 'business-date-branch',
  })
  state = transitionCapstoneProject(state, {
    type: 'choose-build',
    choice: 'aggregate-then-join',
  })
  state = transitionCapstoneProject(state, { type: 'confirm-operate' })
  state = transitionCapstoneProject(state, {
    type: 'handle-loan-late',
    decision: 'wait-for-loan',
  })
  state = transitionCapstoneProject(state, {
    type: 'handle-reconciliation',
    decision: 'block-and-investigate',
  })
  const candidate = capstoneVisualization.lineage.investigationEvent.rootCauseCandidates?.[0]
  if (!candidate) throw new Error('test fixture needs a root cause candidate')
  state = transitionCapstoneProject(state, {
    type: 'select-root-cause',
    candidateId: candidate.id ?? candidate.entityId,
  })
  state = transitionCapstoneProject(state, { type: 'recover-quality' })
  state = transitionCapstoneProject(state, { type: 'choose-consumer', consumer: 'report' })
  state = transitionCapstoneProject(state, {
    type: 'choose-performance',
    choice: 'partition-pruning',
  })
  state = transitionCapstoneProject(state, { type: 'measure-performance' })
  state = transitionCapstoneProject(state, { type: 'complete-launch-review' })
  return state
}

describe('Capstone branch_business_daily', () => {
  it('按 business_date × branch_id 汇总两套 Snapshot，并保留零分母状态', () => {
    expect(capstoneVisualization.facts.productRows).toHaveLength(3)
    const b01 = capstoneVisualization.facts.productRows.find((row) => row.branch_id === 'B01')
    const b03 = capstoneVisualization.facts.productRows.find((row) => row.branch_id === 'B03')

    expect(b01).toMatchObject({
      business_date: '2026-09-30',
      deposit_balance: 380_000,
      loan_balance: 210_000,
    })
    expect(b01?.loan_deposit_ratio).toBeCloseTo(210_000 / 380_000)
    expect(b03).toMatchObject({
      deposit_balance: 0,
      loan_balance: 12_000,
      loan_deposit_ratio: null,
      loan_deposit_ratio_status: 'not-calculable',
    })
  })

  it('支持最小输入集合的确定性产品计算', () => {
    const rows = buildBranchBusinessDaily(
      [
        {
          snapshotDate: '2026-09-30',
          accountId: 'A001',
          balance: 100,
          currency: 'CNY',
          updatedAt: '23:00',
          ingestedAt: '23:01',
        },
      ],
      [{ accountId: 'A001', customerId: 'C001', productId: 'P01', branchId: 'B01' }],
      [{ branchId: 'B01', branchName: '杭州分行' }],
      [
        {
          loan_id: 'L001',
          customer_id: 'C001',
          branch_id: 'B01',
          snapshot_date: '2026-09-30',
          balance: 50,
        },
      ],
      '2026-09-30',
    )
    expect(rows).toEqual([
      {
        business_date: '2026-09-30',
        branch_id: 'B01',
        deposit_balance: 100,
        loan_balance: 50,
        loan_deposit_ratio: 0.5,
        loan_deposit_ratio_status: 'calculated',
      },
    ])
  })
})

describe('Capstone Mission Workbench 状态', () => {
  it('完成 happy path 后得到 READY，并保留连续 Decision Records', () => {
    const state = runHappyPath()
    expect(state.completedCheckpointIds).toHaveLength(9)
    expect(state.launchStatus).toBe('READY')
    expect(state.missionStatus).toBe('ready')
    expect(state.decisions.length).toBeGreaterThanOrEqual(12)
    expect(state.decisions.some((record) => record.checkpointId === 'incident')).toBe(true)
  })

  it('部分结果、质量覆盖和不改变性能瓶颈都会阻断发布', () => {
    let state = createInitialCapstoneState()
    state = transitionCapstoneProject(state, { type: 'confirm-mission' })
    state = transitionCapstoneProject(state, {
      type: 'choose-grain',
      choice: 'business-date-branch',
    })
    state = transitionCapstoneProject(state, {
      type: 'choose-build',
      choice: 'aggregate-then-join',
    })
    state = transitionCapstoneProject(state, { type: 'confirm-operate' })
    state = transitionCapstoneProject(state, {
      type: 'handle-loan-late',
      decision: 'publish-deposit-only',
    })
    state = transitionCapstoneProject(state, {
      type: 'handle-reconciliation',
      decision: 'override-release',
    })

    expect(getCapstoneLaunchStatus(state)).toBe('BLOCKED')
    expect(state.missionStatus).toBe('blocked')
    expect(state.checkpointStates.incident).toBe('completed')
  })

  it('malformed progress restores to a safe checkpoint state', () => {
    const normalized = normalizeCapstoneState({
      activeCheckpointId: 'not-a-stage',
      completedCheckpointIds: ['mission-brief', 'not-a-stage', 'design'],
      grainChoice: 'not-a-grain',
      decisions: [{ checkpointId: 'design', decision: 'ok' }],
    })

    expect(normalized.activeCheckpointId).toBe('build')
    expect(normalized.completedCheckpointIds).toEqual(['mission-brief', 'design'])
    expect(normalized.grainChoice).toBeNull()
    expect(normalized.decisions).toHaveLength(1)
  })
})

describe('Capstone Launch Review SSR', () => {
  it('以固定事故、发布状态和评审入口渲染，不依赖浏览器 API', () => {
    const markup = renderToStaticMarkup(<CapstoneWorkbench visualization={capstoneVisualization} />)
    const review = getCapstoneLaunchReview(capstoneVisualization, createInitialCapstoneState())

    expect(review.status).toBe('BLOCKED')
    expect(markup).toContain('Mission Workbench')
    expect(markup).toContain('branch_business_daily')
    expect(markup).toContain('LoanBalanceSnapshot 迟到')
    expect(markup).toContain('READY WITH RISK')
    expect(markup).toContain('Launch Review')
  })
})
