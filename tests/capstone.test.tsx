import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CapstoneWorkbench } from '../src/components/visualizations/CapstoneWorkbench'
import { capstoneVisualization } from '../src/features/capstone/banking'
import {
  CAPSTONE_INCIDENT_INITIAL_CONFIG,
  CAPSTONE_REPAIR_ACTIONS,
  applyCapstoneRepair,
  evaluateCapstoneQualityRepair,
  getCapstoneIncidentRootRepairAction,
  getCapstoneRepairActionForCandidate,
  recomputeCapstoneReconciliation,
} from '../src/features/capstone/reconciliation'
import {
  buildBranchBusinessDaily,
  createInitialCapstoneState,
  getCapstoneLaunchReview,
  getCapstoneLaunchStatus,
  normalizeCapstoneState,
  transitionCapstoneProject,
} from '../src/utils/capstone'

const CORRECT_CANDIDATE = 'candidate-product-filter'
const WRONG_CANDIDATES = ['candidate-dwd-balance', 'candidate-branch-join'] as const

/** 走到 Investigate checkpoint，等待选择根因候选。 */
function advanceToInvestigation() {
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
  return state
}

/** 选择候选并执行一次「修复动作 → Rerun → 复检」。 */
function applyRepair(candidateId: string) {
  let state = advanceToInvestigation()
  state = transitionCapstoneProject(state, { type: 'select-root-cause', candidateId })
  return transitionCapstoneProject(state, { type: 'apply-quality-repair' })
}

function finishLaunchReview(state: ReturnType<typeof createInitialCapstoneState>) {
  let next = state
  next = transitionCapstoneProject(next, { type: 'choose-consumer', consumer: 'report' })
  next = transitionCapstoneProject(next, {
    type: 'choose-performance',
    choice: 'partition-pruning',
  })
  next = transitionCapstoneProject(next, { type: 'measure-performance' })
  next = transitionCapstoneProject(next, { type: 'complete-launch-review' })
  return next
}

function runHappyPath() {
  return finishLaunchReview(applyRepair(CORRECT_CANDIDATE))
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

describe('Capstone 复检：修复动作 → recompute → reconciliation invariant', () => {
  it('固定事故未经修复时保持 BLOCKED，且选择候选本身不产生 PASS', () => {
    expect(capstoneVisualization.quality.reconciliation).toMatchObject({
      expectedDwdBalance: 12_000_000_000,
      observedDwsBalance: 11_800_000_000,
      delta: -200_000_000,
    })

    let state = advanceToInvestigation()
    state = transitionCapstoneProject(state, {
      type: 'select-root-cause',
      candidateId: CORRECT_CANDIDATE,
    })

    expect(state.qualityRepairActionId).toBeNull()
    expect(state.qualityRecheck).toBeNull()
    expect(getCapstoneLaunchStatus(state)).toBe('BLOCKED')
  })

  it('正确候选：修复动作改变数据、重算后 PASS，Release 可以继续到 READY', () => {
    const repair = getCapstoneRepairActionForCandidate(CORRECT_CANDIDATE)
    expect(repair).not.toBeNull()

    const state = applyRepair(CORRECT_CANDIDATE)
    const recheck = state.qualityRecheck
    expect(recheck).toMatchObject({
      repairActionId: repair?.id,
      candidateVerdict: 'confirmed',
      status: 'pass',
      releaseStatus: 'released',
      expectedBalance: 12_000_000_000,
      observedBalanceBefore: 11_800_000_000,
      observedBalanceAfter: 12_000_000_000,
      delta: 0,
    })
    expect(recheck?.evidence.join(' ')).toContain('DWS 写入')
    expect(recheck?.evidence.join(' ')).toContain('delta = 0 元')
    expect(recheck?.appliedChanges.join(' ')).toContain('已修复 product-filter')
    expect(state.incidents['deposit-reconciliation'].status).toBe('recovered')

    const finished = finishLaunchReview(state)
    expect(finished.completedCheckpointIds).toHaveLength(9)
    expect(finished.launchStatus).toBe('READY')
    expect(finished.missionStatus).toBe('ready')
    expect(finished.decisions.length).toBeGreaterThanOrEqual(12)
    expect(finished.decisions.some((record) => record.checkpointId === 'incident')).toBe(true)
  })

  it.each(WRONG_CANDIDATES)('错误候选 %s：重算仍失败，Release 保持 BLOCKED', (candidateId) => {
    const repair = getCapstoneRepairActionForCandidate(candidateId)
    const state = applyRepair(candidateId)
    const recheck = state.qualityRecheck

    expect(repair).not.toBeNull()
    expect(recheck).toMatchObject({
      repairActionId: repair?.id,
      candidateVerdict: 'rejected',
      status: 'fail',
      releaseStatus: 'blocked',
      expectedBalance: 12_000_000_000,
      observedBalanceBefore: 11_800_000_000,
      observedBalanceAfter: 11_800_000_000,
      delta: -200_000_000,
    })
    expect(recheck?.evidence.join(' ')).toContain('delta = -200,000,000 元')
    expect(getCapstoneLaunchStatus(state)).toBe('BLOCKED')

    const blocked = finishLaunchReview(state)
    expect(blocked.completedCheckpointIds).toHaveLength(9)
    expect(blocked.launchStatus).toBe('BLOCKED')
    expect(blocked.missionStatus).toBe('blocked')
  })

  it('三个候选得到可区分结果（1 PASS + 2 FAIL）', () => {
    const results = CAPSTONE_REPAIR_ACTIONS.map((action) =>
      evaluateCapstoneQualityRepair(action.id),
    )
    expect(results.every((result) => result !== null)).toBe(true)
    expect(results.filter((result) => result?.releaseStatus === 'released')).toHaveLength(1)
    expect(results.filter((result) => result?.releaseStatus === 'blocked')).toHaveLength(2)

    for (const action of CAPSTONE_REPAIR_ACTIONS) {
      const candidateId = action.candidateKeys[0]
      expect(getCapstoneRepairActionForCandidate(candidateId ?? null)?.id).toBe(action.id)
      expect(applyRepair(candidateId ?? '').qualityRecheck?.repairActionId).toBe(action.id)
    }
  })

  it('错误候选之后重新选择正确候选，复检结果随之更新', () => {
    let state = applyRepair('candidate-dwd-balance')
    expect(state.qualityRecheck?.status).toBe('fail')

    state = transitionCapstoneProject(state, {
      type: 'select-root-cause',
      candidateId: CORRECT_CANDIDATE,
    })
    expect(state.qualityRecheck).toBeNull()

    state = transitionCapstoneProject(state, { type: 'apply-quality-repair' })
    expect(state.qualityRecheck).toMatchObject({ status: 'pass', releaseStatus: 'released' })
  })

  it('每个 root cause candidate 都有对应的可执行修复动作', () => {
    const candidates = capstoneVisualization.lineage.investigationEvent.rootCauseCandidates ?? []
    expect(candidates).toHaveLength(3)

    for (const candidate of candidates) {
      const key = candidate.id ?? candidate.entityId
      expect(getCapstoneRepairActionForCandidate(key)).not.toBeNull()
    }
  })
})

describe('Capstone reconciliation 领域重算', () => {
  it('正确修复消除真实缺陷，错误修复不改变聚合结果', () => {
    const rootRepair = getCapstoneIncidentRootRepairAction()
    expect(rootRepair.target).toBe('product-filter')

    const initial = recomputeCapstoneReconciliation(CAPSTONE_INCIDENT_INITIAL_CONFIG)
    expect(initial).toMatchObject({
      dwdReaggregated: 12_000_000_000,
      dwsWritten: 11_800_000_000,
      delta: -200_000_000,
    })

    const repaired = applyCapstoneRepair(CAPSTONE_INCIDENT_INITIAL_CONFIG, rootRepair)
    expect(recomputeCapstoneReconciliation(repaired.config).dwsWritten).toBe(12_000_000_000)

    for (const wrong of CAPSTONE_REPAIR_ACTIONS.filter((action) => action.id !== rootRepair.id)) {
      const applied = applyCapstoneRepair(CAPSTONE_INCIDENT_INITIAL_CONFIG, wrong)
      expect(recomputeCapstoneReconciliation(applied.config).dwsWritten).toBe(11_800_000_000)
    }
  })

  it('branch-join 缺陷是真实维度：构造该缺陷会丢弃无法关联机构的分组', () => {
    const joinDefect = recomputeCapstoneReconciliation({ defects: ['branch-join-loss'] })
    expect(joinDefect.dwsWritten).toBe(11_800_000_000)
    expect(joinDefect.groups.find((group) => group.groupId === 'demand-hz')).toMatchObject({
      includedInDws: false,
      excludedReason: 'Branch JOIN 只使用参考表，找不到机构 B9999',
    })
  })

  it('复检计算是确定性的，并且复用既有质量引擎的阈值与状态', () => {
    const first = evaluateCapstoneQualityRepair('repair-product-filter-scope')
    const second = evaluateCapstoneQualityRepair('repair-product-filter-scope')
    expect(first).toEqual(second)
    expect(first?.ruleId).toBe('dq.dws.deposit-balance.reconciliation.v1')
    expect(first?.threshold).toEqual({
      operator: 'at-most',
      value: 0,
      unit: 'currency',
      warningRange: 100_000_000,
    })
    expect(evaluateCapstoneQualityRepair('unknown-repair')).toBeNull()
  })

  it('Governance 参考复检与正确修复的复检结果一致', () => {
    const correct = evaluateCapstoneQualityRepair(getCapstoneIncidentRootRepairAction().id)
    const referenceCheck = capstoneVisualization.quality.recoveryReference.checks.find(
      (check) => check.ruleId === correct?.ruleId,
    )

    expect(correct?.releaseStatus).toBe('released')
    expect(referenceCheck?.status).toBe('pass')
    expect(referenceCheck?.observedValue).toBe(correct?.delta)
    expect(capstoneVisualization.quality.recoveryReference.releaseDecision.status).toBe('released')
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

  it('错误修复不会写入虚假 PASS 的 Decision Record', () => {
    const state = applyRepair('candidate-branch-join')
    const repairRecord = [...state.decisions]
      .reverse()
      .find((record) => record.checkpointId === 'investigate')

    expect(repairRecord?.decision).toContain('未通过复检')
    expect(repairRecord?.decision).toContain('不能解除 Release 阻断')
    expect(repairRecord?.decision).not.toContain('Release 解除阻断')
    expect(repairRecord?.consequence).toContain('BLOCKED')
    expect(repairRecord?.evidence.join(' ')).toContain('Release = blocked')
    expect(state.incidents['deposit-reconciliation'].status).toBe('handled')
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

  it('reset 回到确定性初始状态', () => {
    const repaired = applyRepair(CORRECT_CANDIDATE)
    const reset = transitionCapstoneProject(repaired, { type: 'reset' })
    expect(reset).toEqual(createInitialCapstoneState())
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

  it('stale qualityRecovered 状态位不再产生 PASS', () => {
    const normalized = normalizeCapstoneState({
      completedCheckpointIds: [
        'mission-brief',
        'design',
        'build',
        'operate',
        'incident',
        'investigate',
      ],
      reconciliationDecision: 'block-and-investigate',
      investigationCandidateId: CORRECT_CANDIDATE,
      qualityRecovered: true,
    })

    expect(normalized.qualityRepairActionId).toBeNull()
    expect(normalized.qualityRecheck).toBeNull()
    expect(getCapstoneLaunchStatus(normalized)).toBe('BLOCKED')
  })

  it('恢复合法修复动作时重新计算复检结果', () => {
    const applied = applyRepair(CORRECT_CANDIDATE)
    const normalized = normalizeCapstoneState(JSON.parse(JSON.stringify(applied)))

    expect(normalized.qualityRepairActionId).toBe(applied.qualityRepairActionId)
    expect(normalized.qualityRecheck).toEqual(applied.qualityRecheck)
    expect(normalized.qualityRecheck?.releaseStatus).toBe('released')
  })

  it('候选与修复动作不一致时恢复为未修复', () => {
    const correctRepair = getCapstoneRepairActionForCandidate(CORRECT_CANDIDATE)
    const normalized = normalizeCapstoneState({
      completedCheckpointIds: [
        'mission-brief',
        'design',
        'build',
        'operate',
        'incident',
        'investigate',
      ],
      reconciliationDecision: 'block-and-investigate',
      investigationCandidateId: 'candidate-branch-join',
      qualityRepairActionId: correctRepair?.id,
    })

    expect(normalized.qualityRepairActionId).toBeNull()
    expect(normalized.qualityRecheck).toBeNull()
  })
})

describe('Capstone Launch Review SSR', () => {
  it('以固定事故、发布状态和评审入口渲染，不依赖浏览器 API', () => {
    const markup = renderToStaticMarkup(<CapstoneWorkbench visualization={capstoneVisualization} />)
    const review = getCapstoneLaunchReview(capstoneVisualization, createInitialCapstoneState())

    expect(review.status).toBe('BLOCKED')
    expect(review.quality.recheck).toBeNull()
    expect(markup).toContain('Mission Workbench')
    expect(markup).toContain('branch_business_daily')
    expect(markup).toContain('LoanBalanceSnapshot 迟到')
    expect(markup).toContain('READY WITH RISK')
    expect(markup).toContain('Launch Review')
  })

  it('Launch Review 显示复检证据与命令式结论', () => {
    const state = applyRepair(CORRECT_CANDIDATE)
    const review = getCapstoneLaunchReview(capstoneVisualization, state)

    expect(review.quality.recheck?.releaseStatus).toBe('released')
    expect(review.quality.effectiveStatus).toBe('released')
    expect(review.quality.effectiveBlocked).toBe(false)
    expect(review.remainingRisks.join(' ')).toContain('根因候选已由复检确认')
  })
})
