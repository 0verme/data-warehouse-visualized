import {
  getDataServiceConsumerLabel,
  getDataServiceFileState,
} from '../features/data-service/banking'
import type { GovernanceQualityEvidence, LineageNode } from '../types'
import {
  CAPSTONE_INCIDENT_IDS,
  CAPSTONE_STAGE_IDS,
  type BranchBusinessDaily,
  type CapstoneAction,
  type CapstoneCheckpointStatus,
  type CapstoneDecisionRecord,
  type CapstoneIncidentState,
  type CapstoneLaunchReview,
  type CapstoneLaunchStatus,
  type CapstoneMissionStatus,
  type CapstoneProjectState,
  type CapstoneStageId,
  type CapstoneVisualization,
  type LoanBalanceSnapshot,
} from '../features/capstone/types'
import type { Account, AccountBalanceSnapshot, Branch } from '../features/sql-transformation/types'
import { deduplicateBalanceSnapshots } from './sql-transformation'
import { analyzeLineageInvestigation, getLineageEntityType } from './lineage'
import { getGovernanceLineageImpact, getGovernanceRecommendation } from './governance'
import { getScanSnapshot } from './performance'

export const CAPSTONE_FINAL_GRAIN = 'business_date × branch_id'
export const CAPSTONE_RATIO_FORMULA = 'loan_balance ÷ deposit_balance'
export const CAPSTONE_DEFAULT_MISSION_ID = 'branch-business-daily-mission'
export const CAPSTONE_DEFAULT_BUSINESS_DATE = '2026-09-30'

const CAPSTONE_STAGE_INDEX = new Map(CAPSTONE_STAGE_IDS.map((stageId, index) => [stageId, index]))

const CAPSTONE_GRAIN_CHOICES = new Set([
  'business-date-branch',
  'branch-only',
  'account-business-date-branch',
])
const CAPSTONE_BUILD_CHOICES = new Set(['aggregate-then-join', 'join-raw-facts'])
const CAPSTONE_LOAN_DECISIONS = new Set([
  'wait-for-loan',
  'rerun-original-business-date',
  'publish-deposit-only',
])
const CAPSTONE_RECONCILIATION_DECISIONS = new Set(['block-and-investigate', 'override-release'])
const CAPSTONE_CONSUMERS = new Set(['report', 'file', 'api'])
const CAPSTONE_PERFORMANCE_CHOICES = new Set(['partition-pruning', 'add-resources', 'no-change'])

function getStageIndex(stageId: CapstoneStageId): number {
  return CAPSTONE_STAGE_INDEX.get(stageId) ?? 0
}

function isValidStageId(value: unknown): value is CapstoneStageId {
  return typeof value === 'string' && CAPSTONE_STAGE_INDEX.has(value as CapstoneStageId)
}

function getKnownBranchIds(branches: readonly Branch[]): Set<string> {
  return new Set(branches.map((branch) => branch.branchId))
}

function addBalance(totals: Map<string, number>, branchId: string, balance: number): void {
  totals.set(branchId, (totals.get(branchId) ?? 0) + balance)
}

/** Calculate the teaching formula without turning a zero denominator into a fake zero ratio. */
export function calculateLoanDepositRatio(
  loanBalance: number,
  depositBalance: number,
): number | null {
  return depositBalance === 0 ? null : loanBalance / depositBalance
}

/**
 * Build the only Capstone product. Source snapshots keep their source Grain; this function emits
 * one row per business_date × branch_id and uses Branch as the shared public dimension.
 */
export function buildBranchBusinessDaily(
  depositSnapshots: readonly AccountBalanceSnapshot[],
  accounts: readonly Account[],
  branches: readonly Branch[],
  loanSnapshots: readonly LoanBalanceSnapshot[],
  businessDate: string,
): BranchBusinessDaily[] {
  const knownBranchIds = getKnownBranchIds(branches)
  const accountsById = new Map(accounts.map((account) => [account.accountId, account]))
  const depositTotals = new Map<string, number>()
  const loanTotals = new Map<string, number>()

  for (const snapshot of deduplicateBalanceSnapshots(depositSnapshots)) {
    if (snapshot.snapshotDate !== businessDate) {
      continue
    }

    const branchId = accountsById.get(snapshot.accountId)?.branchId
    if (branchId && knownBranchIds.has(branchId)) {
      addBalance(depositTotals, branchId, snapshot.balance)
    }
  }

  for (const snapshot of loanSnapshots) {
    if (snapshot.snapshot_date === businessDate && knownBranchIds.has(snapshot.branch_id)) {
      addBalance(loanTotals, snapshot.branch_id, snapshot.balance)
    }
  }

  return branches.map((branch) => {
    const depositBalance = depositTotals.get(branch.branchId) ?? 0
    const loanBalance = loanTotals.get(branch.branchId) ?? 0
    const loanDepositRatio = calculateLoanDepositRatio(loanBalance, depositBalance)

    return {
      business_date: businessDate,
      branch_id: branch.branchId,
      deposit_balance: depositBalance,
      loan_balance: loanBalance,
      loan_deposit_ratio: loanDepositRatio,
      loan_deposit_ratio_status: loanDepositRatio === null ? 'not-calculable' : 'calculated',
    }
  })
}

function createInitialCheckpointStates(): Readonly<
  Record<CapstoneStageId, CapstoneCheckpointStatus>
> {
  return Object.fromEntries(
    CAPSTONE_STAGE_IDS.map((stageId, index) => [stageId, index === 0 ? 'available' : 'locked']),
  ) as Record<CapstoneStageId, CapstoneCheckpointStatus>
}

function createInitialIncidents(): CapstoneProjectState['incidents'] {
  return Object.fromEntries(
    CAPSTONE_INCIDENT_IDS.map((id) => [
      id,
      {
        id,
        status: 'not-started',
        decision: null,
        consequence: null,
        recoveryPath: null,
      },
    ]),
  ) as CapstoneProjectState['incidents']
}

export function createInitialCapstoneState(
  missionId = CAPSTONE_DEFAULT_MISSION_ID,
  businessDate = CAPSTONE_DEFAULT_BUSINESS_DATE,
): CapstoneProjectState {
  return {
    missionId,
    businessDate,
    activeCheckpointId: 'mission-brief',
    checkpointStates: createInitialCheckpointStates(),
    completedCheckpointIds: [],
    grainChoice: null,
    buildChoice: null,
    operateConfirmed: false,
    loanLateDecision: null,
    reconciliationDecision: null,
    investigationCandidateId: null,
    qualityRecovered: false,
    consumerChoice: null,
    performanceChoice: null,
    performanceMeasured: false,
    launchReviewed: false,
    incidents: createInitialIncidents(),
    decisions: [],
    missionStatus: 'in-progress',
    launchStatus: 'BLOCKED',
  }
}

function orderCompletedStages(stageIds: readonly CapstoneStageId[]): CapstoneStageId[] {
  const completed = new Set(stageIds)
  const contiguous: CapstoneStageId[] = []

  for (const stageId of CAPSTONE_STAGE_IDS) {
    if (!completed.has(stageId)) break
    contiguous.push(stageId)
  }

  return contiguous
}

function deriveCheckpointStates(
  completedCheckpointIds: readonly CapstoneStageId[],
): Readonly<Record<CapstoneStageId, CapstoneCheckpointStatus>> {
  const completed = new Set(completedCheckpointIds)
  const states = {} as Record<CapstoneStageId, CapstoneCheckpointStatus>

  CAPSTONE_STAGE_IDS.forEach((stageId, index) => {
    if (completed.has(stageId)) {
      states[stageId] = 'completed'
    } else if (index === 0 || completed.has(CAPSTONE_STAGE_IDS[index - 1]!)) {
      states[stageId] = 'available'
    } else {
      states[stageId] = 'locked'
    }
  })

  return states
}

function hasBlockingSelection(state: CapstoneProjectState): boolean {
  return (
    state.grainChoice === 'branch-only' ||
    state.grainChoice === 'account-business-date-branch' ||
    state.buildChoice === 'join-raw-facts' ||
    state.loanLateDecision === 'publish-deposit-only' ||
    state.reconciliationDecision === 'override-release' ||
    (state.performanceMeasured && state.performanceChoice === 'no-change')
  )
}

export function getCapstoneLaunchStatus(state: CapstoneProjectState): CapstoneLaunchStatus {
  const requiredStages = CAPSTONE_STAGE_IDS.slice(0, -1)
  const allRequiredStagesCompleted = requiredStages.every((stageId) =>
    state.completedCheckpointIds.includes(stageId),
  )

  if (
    !allRequiredStagesCompleted ||
    state.grainChoice !== 'business-date-branch' ||
    state.buildChoice !== 'aggregate-then-join' ||
    state.operateConfirmed === false ||
    (state.loanLateDecision !== 'wait-for-loan' &&
      state.loanLateDecision !== 'rerun-original-business-date') ||
    state.reconciliationDecision !== 'block-and-investigate' ||
    state.investigationCandidateId === null ||
    !state.qualityRecovered ||
    state.consumerChoice === null ||
    !state.performanceMeasured ||
    state.performanceChoice === null ||
    state.performanceChoice === 'no-change'
  ) {
    return 'BLOCKED'
  }

  const hasKnownRisk =
    state.loanLateDecision === 'rerun-original-business-date' ||
    state.consumerChoice !== 'report' ||
    state.performanceChoice === 'add-resources'

  return hasKnownRisk ? 'READY WITH RISK' : 'READY'
}

function deriveProjectState(state: CapstoneProjectState): CapstoneProjectState {
  const completedCheckpointIds = orderCompletedStages(state.completedCheckpointIds)
  const launchStatus = getCapstoneLaunchStatus({ ...state, completedCheckpointIds })
  const allStagesCompleted = completedCheckpointIds.length === CAPSTONE_STAGE_IDS.length
  const missionStatus: CapstoneMissionStatus = allStagesCompleted
    ? launchStatus === 'READY'
      ? 'ready'
      : launchStatus === 'READY WITH RISK'
        ? 'ready-with-risk'
        : 'blocked'
    : hasBlockingSelection(state)
      ? 'blocked'
      : 'in-progress'

  return {
    ...state,
    completedCheckpointIds,
    checkpointStates: deriveCheckpointStates(completedCheckpointIds),
    missionStatus,
    launchStatus,
  }
}

function isStageWorkable(state: CapstoneProjectState, stageId: CapstoneStageId): boolean {
  const status = state.checkpointStates[stageId]
  return status === 'available' || status === 'completed'
}

function completeCheckpoint(
  state: CapstoneProjectState,
  stageId: CapstoneStageId,
): CapstoneProjectState {
  const nextStage = CAPSTONE_STAGE_IDS[getStageIndex(stageId) + 1] ?? stageId
  return deriveProjectState({
    ...state,
    completedCheckpointIds: orderCompletedStages([...state.completedCheckpointIds, stageId]),
    activeCheckpointId: nextStage,
  })
}

function emptyIncident(id: (typeof CAPSTONE_INCIDENT_IDS)[number]): CapstoneIncidentState {
  return {
    id,
    status: 'not-started',
    decision: null,
    consequence: null,
    recoveryPath: null,
  }
}

function resetDownstream(
  state: CapstoneProjectState,
  stageId: CapstoneStageId,
): CapstoneProjectState {
  const stageIndex = getStageIndex(stageId)
  const reset = (id: CapstoneStageId) => getStageIndex(id) > stageIndex

  return deriveProjectState({
    ...state,
    activeCheckpointId: stageId,
    completedCheckpointIds: state.completedCheckpointIds.filter(
      (completedId) => getStageIndex(completedId) <= stageIndex,
    ),
    grainChoice: reset('design') ? null : state.grainChoice,
    buildChoice: reset('build') ? null : state.buildChoice,
    operateConfirmed: reset('operate') ? false : state.operateConfirmed,
    loanLateDecision: reset('incident') ? null : state.loanLateDecision,
    reconciliationDecision: reset('incident') ? null : state.reconciliationDecision,
    investigationCandidateId: reset('investigate') ? null : state.investigationCandidateId,
    qualityRecovered: reset('investigate') ? false : state.qualityRecovered,
    consumerChoice: reset('deliver') ? null : state.consumerChoice,
    performanceChoice: reset('scale') ? null : state.performanceChoice,
    performanceMeasured: reset('scale') ? false : state.performanceMeasured,
    launchReviewed: reset('launch-review') ? false : state.launchReviewed,
    incidents: reset('incident')
      ? createInitialIncidents()
      : {
          ...state.incidents,
          'deposit-reconciliation': reset('investigate')
            ? {
                ...state.incidents['deposit-reconciliation'],
                status:
                  state.reconciliationDecision === 'block-and-investigate'
                    ? 'handled'
                    : state.incidents['deposit-reconciliation'].status,
              }
            : state.incidents['deposit-reconciliation'],
        },
  })
}

function recordDecision(
  state: CapstoneProjectState,
  details: Omit<CapstoneDecisionRecord, 'id' | 'recordedAt' | 'projectStatus'>,
): CapstoneProjectState {
  const provisional = deriveProjectState({
    ...state,
    decisions: [
      ...state.decisions,
      {
        ...details,
        id: `decision-${details.checkpointId}-${String(state.decisions.length + 1).padStart(2, '0')}`,
        recordedAt: '教学记录',
        projectStatus: 'in-progress',
      },
    ],
  })
  const decisions = provisional.decisions.map((decision, index) =>
    index === provisional.decisions.length - 1
      ? { ...decision, projectStatus: provisional.missionStatus }
      : decision,
  )

  return { ...provisional, decisions }
}

function completeIncidentCheckpoint(state: CapstoneProjectState): CapstoneProjectState {
  const hasBothIncidentDecisions =
    state.loanLateDecision !== null && state.reconciliationDecision !== null

  return hasBothIncidentDecisions ? completeCheckpoint(state, 'incident') : state
}

export function transitionCapstoneProject(
  state: CapstoneProjectState,
  action: CapstoneAction,
): CapstoneProjectState {
  if (action.type === 'reset') {
    return createInitialCapstoneState(state.missionId, state.businessDate)
  }

  if (action.type === 'select-checkpoint') {
    if (!isStageWorkable(state, action.checkpointId)) {
      return state
    }

    return { ...state, activeCheckpointId: action.checkpointId }
  }

  switch (action.type) {
    case 'confirm-mission': {
      if (!isStageWorkable(state, 'mission-brief')) return state
      const next = completeCheckpoint(resetDownstream(state, 'mission-brief'), 'mission-brief')
      return recordDecision(next, {
        checkpointId: 'mission-brief',
        input: '业务日期、08:00 交付约束、消费者和三个指标定义。',
        evidence: [
          '上一业务日 = 2026-09-30',
          '目标产品 = branch_business_daily',
          '主消费者 = 经营报表 / BI',
        ],
        decision: '接受跨核心系统与信贷系统的分行经营分析 Mission。',
        consequence: 'Design checkpoint 解锁，后续决策必须围绕固定 Grain 和发布前提展开。',
        recoveryPath: '可以回到 Mission Brief 重置项目，不改变课程 Lesson identity。',
      })
    }
    case 'choose-grain': {
      if (!isStageWorkable(state, 'design')) return state
      const nextBase = resetDownstream(state, 'design')
      const isCorrect = action.choice === 'business-date-branch'
      const next = isCorrect
        ? completeCheckpoint({ ...nextBase, grainChoice: action.choice }, 'design')
        : {
            ...nextBase,
            grainChoice: action.choice,
          }
      return recordDecision(next, {
        checkpointId: 'design',
        input: '两套 Snapshot 按 Branch 汇总后的目标行含义。',
        evidence: [
          'AccountBalanceSnapshot：account_id × snapshot_date',
          'LoanBalanceSnapshot：loan_id × snapshot_date',
          `目标 Grain 候选：${action.choice}`,
        ],
        decision: isCorrect
          ? '采用 business_date × branch_id。'
          : '暂时采用不成立的 Grain，后续结果保持阻断。',
        consequence: isCorrect
          ? 'Build checkpoint 解锁，可以分别聚合两套事实后汇合。'
          : '一行含义不稳定，Build 不会被解锁；需要回到 Design 修正。',
        recoveryPath:
          '回到 Design 选择 business_date × branch_id；不会删除之前的 Decision Record。',
      })
    }
    case 'choose-build': {
      if (!isStageWorkable(state, 'build')) return state
      const nextBase = resetDownstream(state, 'build')
      const isCorrect = action.choice === 'aggregate-then-join'
      const next = isCorrect
        ? completeCheckpoint({ ...nextBase, buildChoice: action.choice }, 'build')
        : { ...nextBase, buildChoice: action.choice }
      return recordDecision(next, {
        checkpointId: 'build',
        input: '两份事实具有不同业务 identity，目标只需要分行日汇总。',
        evidence: [
          '先分别按 branch_id + snapshot_date 聚合存款和贷款。',
          'Branch 是公共维度；不把 LoanContract、LoanNote 或账户明细引入主链。',
          `加工方案候选：${action.choice}`,
        ],
        decision: isCorrect
          ? '分别聚合后，以 business_date × branch_id 汇合。'
          : '先 Join 原始事实，保留为待修正方案。',
        consequence: isCorrect
          ? 'Operate checkpoint 解锁，目标产品字段可以按固定 Grain 计算。'
          : '原始事实 Join 可能放大金额，产品计算和后续质量判断保持阻断。',
        recoveryPath: '回到 Build 改为先聚合再 Join，并重新检查产品 Grain。',
      })
    }
    case 'confirm-operate': {
      if (!isStageWorkable(state, 'operate')) return state
      const next = completeCheckpoint(
        { ...resetDownstream(state, 'operate'), operateConfirmed: true },
        'operate',
      )
      return recordDecision(next, {
        checkpointId: 'operate',
        input: 'DAG、业务日期、任务依赖、运行状态和 08:00 SLA。',
        evidence: [
          '正常日批复用既有 Scheduler task contract。',
          'business_date = 2026-09-30；数据到达时间单独记录。',
          '完整产品的发布前提包含 Quality 和 Release 状态。',
        ],
        decision: '按 DAG 运行完整日批，并把输入就绪与业务日期分开观察。',
        consequence: 'Incident checkpoint 解锁；固定事故会在同一项目状态上发生。',
        recoveryPath: '发生迟到或失败时按原 business_date 做局部 Rerun / Backfill。',
      })
    }
    case 'handle-loan-late': {
      if (!isStageWorkable(state, 'incident')) return state
      const nextBase = resetDownstream(state, 'incident')
      const isPartial = action.decision === 'publish-deposit-only'
      const incident = {
        id: 'loan-late' as const,
        status: isPartial ? ('handled' as const) : ('recovered' as const),
        decision: action.decision,
        consequence: isPartial
          ? '贷款侧未到齐，部分结果不能静默命名为完整 branch_business_daily；发布保持阻断。'
          : action.decision === 'wait-for-loan'
            ? '继续等待 LoanBalanceSnapshot；07:35 到达后仍有窗口在 08:00 前完成日批。'
            : '按原 business_date 对 LoanBalanceSnapshot 及其下游做局部 Rerun，缩短剩余窗口但保持完整产品边界。',
        recoveryPath: isPartial
          ? '回到 Incident 选择等待或按原业务日期 Rerun；不能把存款-only 结果当作完整产品。'
          : '保留 business_date = 2026-09-30，必要时覆盖同一目标分区，保持幂等。',
      }
      const next = completeIncidentCheckpoint({
        ...nextBase,
        loanLateDecision: action.decision,
        incidents: { ...nextBase.incidents, 'loan-late': incident },
      })
      return recordDecision(next, {
        checkpointId: 'incident',
        input: '06:30 原计划到达、07:00 加工开始、07:35 实际到达、08:00 SLA。',
        evidence: [
          'LoanBalanceSnapshot.business_date = 2026-09-30',
          'arrived_at = 2026-10-01 07:35，不替代业务日期',
          'LoanBalanceSnapshot 是 DWS / ADS 的硬依赖；迟到前依赖状态为 waiting',
        ],
        decision:
          action.decision === 'wait-for-loan'
            ? '继续等待输入，数据到齐后运行完整产品。'
            : action.decision === 'rerun-original-business-date'
              ? '保留原业务日期，对迟到输入及其下游执行局部 Rerun。'
              : '暂存存款侧部分结果，不发布完整产品。',
        consequence: incident.consequence,
        recoveryPath: incident.recoveryPath,
      })
    }
    case 'handle-reconciliation': {
      if (!isStageWorkable(state, 'incident')) return state
      const nextBase = resetDownstream(state, 'incident')
      const incident = {
        id: 'deposit-reconciliation' as const,
        status: 'handled' as const,
        decision: action.decision,
        consequence:
          action.decision === 'block-and-investigate'
            ? 'Scheduler 可以 SUCCESS，但 Quality Event 仍为 FAIL，Release 保持 BLOCKED。'
            : '不能因为 Scheduler SUCCESS 就覆盖 Quality FAIL；Release 仍然 BLOCKED。',
        recoveryPath: '沿 Quality Event → Lineage 调查，修复后按相同 business_date 重跑并复检。',
      }
      const next = completeIncidentCheckpoint({
        ...nextBase,
        reconciliationDecision: action.decision,
        incidents: { ...nextBase.incidents, 'deposit-reconciliation': incident },
      })
      return recordDecision(next, {
        checkpointId: 'incident',
        input: 'DWD 存款余额 120 亿，DWS 存款余额 118 亿，delta = -2 亿。',
        evidence: [
          'Scheduler task status = SUCCESS',
          'Quality Event 记录 expected = 120 亿、observed = 118 亿',
          '质量规则绑定同一 business_date、指标范围、单位和聚合证据',
        ],
        decision:
          action.decision === 'block-and-investigate'
            ? '尊重 Quality FAIL，阻断发布并进入血缘调查。'
            : '尝试覆盖发布闸门，但保留为不成立的工程选择。',
        consequence: incident.consequence,
        recoveryPath: incident.recoveryPath,
      })
    }
    case 'select-root-cause': {
      if (!isStageWorkable(state, 'investigate') || !action.candidateId) return state
      const nextBase = resetDownstream(state, 'investigate')
      const next = completeCheckpoint(
        { ...nextBase, investigationCandidateId: action.candidateId },
        'investigate',
      )
      return recordDecision(next, {
        checkpointId: 'investigate',
        input: 'Quality Event 提供的目标、分区、Scheduler context 和聚合证据。',
        evidence: [
          '先检查 DWS 直接上游，再按证据向 DWD / Branch / Product / 源快照展开。',
          '血缘计算 direct downstream、transitive downstream 和 Blast Radius。',
          `Root Cause Candidate = ${action.candidateId}，验证状态仍为 pending。`,
        ],
        decision: '选择一个优先复核的根因候选，不把依赖关系当成业务根因证明。',
        consequence: 'Investigate 记录了调查入口；修复和复检动作仍是发布前提。',
        recoveryPath: '结合数据 Diff、SQL 版本、执行参数、日志或业务变更记录确认候选。',
      })
    }
    case 'recover-quality': {
      if (
        !isStageWorkable(state, 'investigate') ||
        !state.investigationCandidateId ||
        state.reconciliationDecision !== 'block-and-investigate'
      ) {
        return state
      }

      const next = deriveProjectState({
        ...state,
        qualityRecovered: true,
        incidents: {
          ...state.incidents,
          'deposit-reconciliation': {
            ...state.incidents['deposit-reconciliation'],
            status: 'recovered',
            consequence: '修复后按同一业务日期 Rerun，Quality 复检通过，Release 才能解除阻断。',
          },
        },
      })
      return recordDecision(next, {
        checkpointId: 'investigate',
        input: '选中的候选已完成数据对照和同日期恢复验证。',
        evidence: [
          '同一 business_date = 2026-09-30 重新执行目标分区',
          'DWD / DWS 同口径对账恢复为 delta = 0',
          'Quality recovery evaluation = PASS，Release = released',
        ],
        decision: '修复后 Rerun、重新质量检查，再解除 Release Block。',
        consequence: '后续 Deliver 可以读取有效发布状态；失败事件仍保留在 Decision Records。',
        recoveryPath: '若复检仍失败，继续保留 BLOCKED，回到候选和加工证据继续调查。',
      })
    }
    case 'choose-consumer': {
      if (!isStageWorkable(state, 'deliver')) return state
      const next = completeCheckpoint(
        { ...resetDownstream(state, 'deliver'), consumerChoice: action.consumer },
        'deliver',
      )
      return recordDecision(next, {
        checkpointId: 'deliver',
        input: '消费者类型、批次规模、触发方式和发布状态。',
        evidence: [
          '主消费者固定为经营报表 / BI。',
          '文件接口依赖同批次 FLAG；API 是访问方式，不承诺实时数据。',
          'Quality / Release Block 时三种交付都不能绕过闸门。',
        ],
        decision: `主交付方式选择 ${getDataServiceConsumerLabel(action.consumer)}。`,
        consequence:
          action.consumer === 'report'
            ? '与 Mission 的主消费者一致；文件和 API 作为扩展契约展示。'
            : '仍可记录为交付方式判断，但偏离主消费者，Launch Review 会保留风险。',
        recoveryPath: '回到 Deliver 选择报表 / BI，文件和 API 继续作为扩展消费者。',
      })
    }
    case 'choose-performance': {
      if (!isStageWorkable(state, 'scale')) return state
      const next = deriveProjectState({
        ...resetDownstream(state, 'scale'),
        performanceChoice: action.choice,
        performanceMeasured: false,
        incidents: {
          ...state.incidents,
          'scale-sla-risk': {
            id: 'scale-sla-risk',
            status: 'handled',
            decision: action.choice,
            consequence:
              action.choice === 'no-change'
                ? '保持现状，规模上涨后的 SLA 风险仍未解决。'
                : '已选择一次有限修改，等待 Before / After 复测确认收益。',
            recoveryPath: '完成复测并同时检查正确性、Freshness、成本和维护复杂度。',
          },
        },
      })
      return recordDecision(next, {
        checkpointId: 'scale',
        input: 'Scan / Compute / Runtime / SLA 的 Before 证据，以及第 11 章的性能方法。',
        evidence: [
          'Scan 是当前主要瓶颈，必须先看分区裁剪证据。',
          '修改后要复测 Runtime、Scan / Compute、正确性和维护代价。',
          `优化方向候选：${action.choice}`,
        ],
        decision:
          action.choice === 'partition-pruning'
            ? '选择 Partition Pruning，先缩小最近业务窗口的扫描范围。'
            : action.choice === 'add-resources'
              ? '选择直接增加资源，保留为需要额外成本说明的方案。'
              : '暂不优化，保留 SLA 风险。',
        consequence: 'Scale 仍等待复测；未完成测量前不能进入 Launch Review。',
        recoveryPath: '继续在 Scale 复测；若证据不支持当前方向，可以重新选择一次有限优化。',
      })
    }
    case 'measure-performance': {
      if (!isStageWorkable(state, 'scale') || !state.performanceChoice) return state
      const next = completeCheckpoint(
        {
          ...resetDownstream(state, 'scale'),
          performanceMeasured: true,
          incidents: {
            ...state.incidents,
            'scale-sla-risk': {
              ...state.incidents['scale-sla-risk'],
              status: state.performanceChoice === 'no-change' ? 'handled' : 'recovered',
              consequence:
                state.performanceChoice === 'no-change'
                  ? '复测确认没有改变主要瓶颈，Launch Review 保持 BLOCKED。'
                  : '复测已记录 Runtime、Scan、成本、Freshness、正确性和维护代价。',
            },
          },
        },
        'scale',
      )
      return recordDecision(next, {
        checkpointId: 'scale',
        input: '已应用一次有限优化，需要对照 Before / After。',
        evidence: [
          'Before Runtime = 68 min；After 由复测证据记录。',
          '同时检查 Scan Bytes、成本、SLA / Freshness 和正确性。',
          '状态、Rerun、Backfill 与维护复杂度作为副作用检查项。',
        ],
        decision: '完成一次复测，并把收益和代价一起写入 Launch Review。',
        consequence:
          state.performanceChoice === 'partition-pruning'
            ? 'Scan 主要瓶颈得到验证，Scale checkpoint 完成。'
            : state.performanceChoice === 'add-resources'
              ? 'Runtime 可能下降，但新增资源成本和长期维护风险被保留下来。'
              : '没有改变瓶颈，Launch Review 会保持 BLOCKED。',
        recoveryPath: '如果正确性、SLA 或成本不满足，回到 Scale 重新选择或撤销优化。',
      })
    }
    case 'complete-launch-review': {
      if (!isStageWorkable(state, 'launch-review')) return state
      const next = completeCheckpoint({ ...state, launchReviewed: true }, 'launch-review')
      return recordDecision(next, {
        checkpointId: 'launch-review',
        input: '正确性、运行、质量、血缘、治理、交付、性能与维护证据。',
        evidence: [
          `当前 Launch status = ${next.launchStatus}`,
          'Decision Records 保留每次有限选择及其后果。',
          '已知假设、Remaining risks、Non-goals 和后续演进方向均有记录。',
        ],
        decision: `完成工程式 Launch Review：${next.launchStatus}。`,
        consequence:
          next.launchStatus === 'READY'
            ? '当前教学项目具备完整发布证据。'
            : next.launchStatus === 'READY WITH RISK'
              ? '可以带已知风险评审，但消费者必须理解风险边界。'
              : '保留 BLOCKED，只有满足恢复条件后才能发布。',
        recoveryPath: '回到产生阻断的 checkpoint，修复选择并重新记录证据。',
      })
    }
  }
}

function parseValidChoice<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T | null {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : null
}

function isMissionStatus(value: unknown): value is CapstoneMissionStatus {
  return (
    value === 'in-progress' ||
    value === 'blocked' ||
    value === 'ready' ||
    value === 'ready-with-risk'
  )
}

function normalizeDecisions(value: unknown): CapstoneDecisionRecord[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return []
    const decision = candidate as Partial<CapstoneDecisionRecord>
    if (!isValidStageId(decision.checkpointId) || typeof decision.decision !== 'string') {
      return []
    }

    return [
      {
        id: typeof decision.id === 'string' ? decision.id : `restored-decision-${index + 1}`,
        checkpointId: decision.checkpointId,
        recordedAt: typeof decision.recordedAt === 'string' ? decision.recordedAt : '教学记录',
        input: typeof decision.input === 'string' ? decision.input : '恢复的历史记录未提供输入。',
        evidence: Array.isArray(decision.evidence)
          ? decision.evidence.filter((item): item is string => typeof item === 'string')
          : [],
        decision: decision.decision,
        consequence:
          typeof decision.consequence === 'string'
            ? decision.consequence
            : '恢复的历史记录未提供后果。',
        projectStatus: isMissionStatus(decision.projectStatus)
          ? decision.projectStatus
          : 'in-progress',
        recoveryPath:
          typeof decision.recoveryPath === 'string'
            ? decision.recoveryPath
            : '重新进入对应 checkpoint 检查证据。',
      },
    ]
  })
}

function normalizeIncidents(
  candidate: Partial<CapstoneProjectState>,
): CapstoneProjectState['incidents'] {
  const source = candidate.incidents ?? ({} as CapstoneProjectState['incidents'])
  return Object.fromEntries(
    CAPSTONE_INCIDENT_IDS.map((id) => {
      const incident = source[id]
      return [
        id,
        incident
          ? {
              ...emptyIncident(id),
              ...incident,
              id,
              status:
                incident.status === 'handled' || incident.status === 'recovered'
                  ? incident.status
                  : 'not-started',
              decision: typeof incident.decision === 'string' ? incident.decision : null,
              consequence: typeof incident.consequence === 'string' ? incident.consequence : null,
              recoveryPath:
                typeof incident.recoveryPath === 'string' ? incident.recoveryPath : null,
            }
          : emptyIncident(id),
      ]
    }),
  ) as CapstoneProjectState['incidents']
}

/** Safely restore a project without trusting stale or malformed localStorage JSON. */
export function normalizeCapstoneState(
  candidate: unknown,
  fallback: CapstoneProjectState = createInitialCapstoneState(),
): CapstoneProjectState {
  if (!candidate || typeof candidate !== 'object') {
    return fallback
  }

  const partial = candidate as Partial<CapstoneProjectState>
  const completedCheckpointIds = Array.isArray(partial.completedCheckpointIds)
    ? orderCompletedStages(partial.completedCheckpointIds.filter(isValidStageId))
    : fallback.completedCheckpointIds
  const requestedActiveCheckpointId = isValidStageId(partial.activeCheckpointId)
    ? partial.activeCheckpointId
    : null
  const activeCheckpointId = requestedActiveCheckpointId ?? fallback.activeCheckpointId
  const state: CapstoneProjectState = {
    ...fallback,
    missionId: typeof partial.missionId === 'string' ? partial.missionId : fallback.missionId,
    businessDate:
      typeof partial.businessDate === 'string' ? partial.businessDate : fallback.businessDate,
    activeCheckpointId,
    completedCheckpointIds,
    grainChoice: parseValidChoice(partial.grainChoice, CAPSTONE_GRAIN_CHOICES),
    buildChoice: parseValidChoice(partial.buildChoice, CAPSTONE_BUILD_CHOICES),
    operateConfirmed: partial.operateConfirmed === true,
    loanLateDecision: parseValidChoice(partial.loanLateDecision, CAPSTONE_LOAN_DECISIONS),
    reconciliationDecision: parseValidChoice(
      partial.reconciliationDecision,
      CAPSTONE_RECONCILIATION_DECISIONS,
    ),
    investigationCandidateId:
      typeof partial.investigationCandidateId === 'string'
        ? partial.investigationCandidateId
        : null,
    qualityRecovered: partial.qualityRecovered === true,
    consumerChoice: parseValidChoice(partial.consumerChoice, CAPSTONE_CONSUMERS),
    performanceChoice: parseValidChoice(partial.performanceChoice, CAPSTONE_PERFORMANCE_CHOICES),
    performanceMeasured: partial.performanceMeasured === true,
    launchReviewed: partial.launchReviewed === true,
    incidents: normalizeIncidents(partial),
    decisions: normalizeDecisions(partial.decisions),
    checkpointStates: fallback.checkpointStates,
    missionStatus: fallback.missionStatus,
    launchStatus: fallback.launchStatus,
  }

  const derivedState = deriveProjectState(state)
  const normalizedActive =
    requestedActiveCheckpointId &&
    derivedState.checkpointStates[requestedActiveCheckpointId] !== 'locked'
      ? requestedActiveCheckpointId
      : (CAPSTONE_STAGE_IDS.find(
          (stageId) => derivedState.checkpointStates[stageId] === 'available',
        ) ?? 'mission-brief')

  return deriveProjectState({ ...derivedState, activeCheckpointId: normalizedActive })
}

export interface CapstoneMissionProgress {
  completedCount: number
  totalCount: number
  percent: number
  activeCheckpointId: CapstoneStageId
  status: CapstoneMissionStatus
}

export function getMissionProgress(state: CapstoneProjectState): CapstoneMissionProgress {
  const completedCount = state.completedCheckpointIds.length
  const totalCount = CAPSTONE_STAGE_IDS.length
  return {
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100),
    activeCheckpointId: state.activeCheckpointId,
    status: state.missionStatus,
  }
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('zh-CN')} 元`
}

function getNodeLabelMap(nodes: readonly LineageNode[]): Map<string, string> {
  return new Map(nodes.map((node) => [node.id, node.label]))
}

function getLabels(ids: readonly string[], labels: Map<string, string>): string[] {
  return ids.map((id) => labels.get(id) ?? id)
}

function getOutputAvailableAt(visualization: CapstoneVisualization): string | null {
  const finalTask = visualization.scheduler.tasks.at(-1)
  return finalTask
    ? (visualization.scheduler.lateRun.taskRuns[finalTask.taskId]?.endedAt ?? null)
    : null
}

function getQualityEvidence(
  visualization: CapstoneVisualization,
  state: CapstoneProjectState,
): GovernanceQualityEvidence {
  return state.qualityRecovered
    ? visualization.governance.recoveryEvidence
    : visualization.governance.failureEvidence
}

function getPerformanceAfterRuntime(
  visualization: CapstoneVisualization,
  choice: CapstoneProjectState['performanceChoice'],
): string {
  if (choice === 'partition-pruning') {
    return `${visualization.performance.diagnosis.diagnosis.validation.afterRuntimeMinutes} min`
  }
  if (choice === 'add-resources') {
    return '52 min'
  }
  return `${visualization.performance.diagnosis.diagnosis.validation.beforeRuntimeMinutes} min`
}

function getPerformanceAfterScan(
  visualization: CapstoneVisualization,
  choice: CapstoneProjectState['performanceChoice'],
): string {
  const scanLayout = visualization.performance.scanLayout.scanLayout
  if (choice === 'partition-pruning') {
    return getScanSnapshot(scanLayout, 'partition-pruning').scanBytes
  }
  return getScanSnapshot(scanLayout, 'full-history').scanBytes
}

function getPerformanceCost(
  visualization: CapstoneVisualization,
  choice: CapstoneProjectState['performanceChoice'],
): string {
  const cost = visualization.performance.tradeoffs.tradeoffs.beforeAfter.find(
    (metric) => metric.id === 'scan-compute',
  )
  if (!cost || choice !== 'partition-pruning') {
    return cost?.before ?? 'relative simulation'
  }
  return cost.after
}

function getPerformanceCorrectness(
  choice: CapstoneProjectState['performanceChoice'],
  measured: boolean,
): string {
  if (!measured) {
    return '尚未复测'
  }
  return choice === 'partition-pruning'
    ? 'deposit_balance、loan_balance、loan_deposit_ratio 与目标 Grain 对账通过（教学证据）'
    : '需要额外复核；当前没有足够证据证明优化只改变了运行时间'
}

function getPerformanceMaintainability(choice: CapstoneProjectState['performanceChoice']): string {
  if (choice === 'partition-pruning') {
    return '维护日期过滤与回补范围；复杂度增加有限。'
  }
  if (choice === 'add-resources') {
    return '资源账单和容量责任上升，未改变加工语义。'
  }
  return '没有新增维护复杂度，但 SLA 风险未解决。'
}

function getRemainingRisks(
  visualization: CapstoneVisualization,
  state: CapstoneProjectState,
  status: CapstoneLaunchStatus,
): string[] {
  const risks: string[] = []
  if (status === 'BLOCKED') {
    if (!state.qualityRecovered) {
      risks.push('Quality reconciliation 仍未完成修复、Rerun 和复检，Release 继续 BLOCKED。')
    }
    if (state.grainChoice && state.grainChoice !== 'business-date-branch') {
      risks.push('最终 Grain 尚未成立，不能把结果解释为 business_date × branch_id。')
    }
    if (state.loanLateDecision === 'publish-deposit-only') {
      risks.push('只得到存款侧部分结果，LoanBalanceSnapshot 缺失时不能发布完整产品。')
    }
    if (state.performanceChoice === 'no-change') {
      risks.push('规模上涨后的主要 Scan 瓶颈没有改变，08:00 SLA 仍需重新评估。')
    }
  }
  if (state.loanLateDecision === 'rerun-original-business-date') {
    risks.push('迟到输入需要按原业务日期局部 Rerun，剩余窗口更短，需保留运行证据。')
  }
  if (state.consumerChoice && state.consumerChoice !== 'report') {
    risks.push('主消费者选择偏离经营报表 / BI；需要向经营使用方说明交付边界。')
  }
  if (state.performanceChoice === 'add-resources') {
    risks.push('增加资源可能降低 Runtime，但成本和容量责任高于 Partition Pruning 方案。')
  }
  if (state.investigationCandidateId) {
    risks.push('根因候选仍需结合数据 Diff、SQL 版本、任务日志或业务变更记录确认。')
  }
  const zeroRatioRow = visualization.facts.productRows.find(
    (row) => row.loan_deposit_ratio_status === 'not-calculable',
  )
  if (zeroRatioRow) {
    risks.push(
      `${zeroRatioRow.branch_id} 的 deposit_balance = 0，存贷比保留 NULL / not-calculable，不得静默转换为 0。`,
    )
  }
  return risks
}

function getReviewStatus(state: CapstoneProjectState): CapstoneLaunchStatus {
  return getCapstoneLaunchStatus(state)
}

export function getCapstoneLaunchReview(
  visualization: CapstoneVisualization,
  state: CapstoneProjectState,
): CapstoneLaunchReview {
  const status = getReviewStatus(state)
  const labels = getNodeLabelMap(visualization.lineage.nodes)
  const lineageResult = analyzeLineageInvestigation(
    visualization.lineage.nodes,
    visualization.lineage.edges,
    visualization.lineage.investigationEvent,
  )
  const governanceAsset = state.qualityRecovered
    ? visualization.governance.recoveredAsset
    : visualization.governance.asset
  const governanceEvidence = getQualityEvidence(visualization, state)
  const governanceRecommendation = getGovernanceRecommendation(governanceAsset)
  const governanceImpact = getGovernanceLineageImpact(
    [governanceAsset],
    visualization.lineage.nodes,
    visualization.lineage.edges,
    { sourceEntityId: governanceAsset.lineageEvidence.nodeId ?? '' },
  )
  const finalTask = visualization.scheduler.tasks.at(-1)
  const finalRun = visualization.scheduler.lateRun
  const selectedConsumer = state.consumerChoice
  const fileState = getDataServiceFileState(status === 'BLOCKED' ? 'txt' : 'complete')
  const beforeScan = getScanSnapshot(
    visualization.performance.scanLayout.scanLayout,
    'full-history',
  )
  const remainingRisks = getRemainingRisks(visualization, state, status)

  return {
    status,
    mission: visualization.mission,
    finalGrain: CAPSTONE_FINAL_GRAIN,
    metrics: visualization.mission.metrics,
    sources: visualization.mission.sources,
    dag: {
      taskCount: visualization.scheduler.tasks.length,
      dependencies: [
        'AccountBalanceSnapshot → 存款 DWD / DWS',
        'LoanBalanceSnapshot → 贷款 DWD / DWS',
        'Branch → branch_business_daily',
        '存款主题 + 贷款主题 → branch_business_daily',
        `最终输出表：${finalTask?.contract.outputTable ?? 'branch_business_daily'}`,
      ],
      scheduledAt: visualization.scheduler.processingStartedAt,
      deliverySlaAt: visualization.scheduler.deliverySlaAt,
      finalRunStatus: finalRun.status,
      lateInputArrival: visualization.scheduler.loanArrivedAt,
      outputAvailableAt: getOutputAvailableAt(visualization),
    },
    quality: {
      failureStatus: visualization.quality.failure.releaseDecision.status,
      failureEventId: visualization.quality.event.eventId,
      expectedValue: String(visualization.quality.event.expected),
      observedValue: String(visualization.quality.event.observed),
      effectiveStatus: state.qualityRecovered
        ? visualization.quality.recovery.releaseDecision.status
        : visualization.quality.failure.releaseDecision.status,
      effectiveBlocked: !state.qualityRecovered,
      rerunBusinessDate: visualization.mission.businessDate,
      evidenceBoundary:
        'Quality Event 记录观察事实；Lineage 提供调查路径；候选根因必须由数据和任务证据最终确认。',
    },
    lineage: {
      upstream: getLabels(lineageResult.impact.upstream, labels),
      directDownstream: getLabels(lineageResult.impact.directDownstream, labels),
      transitiveDownstream: getLabels(lineageResult.impact.finalImpact, labels),
      blastRadius: getLabels(lineageResult.blastRadius.nodeIds, labels),
      rootCauseCandidates: lineageResult.rootCauseCandidates.map(
        (candidate) => candidate.label ?? labels.get(candidate.entityId) ?? candidate.entityId,
      ),
      evidenceBoundary:
        '箭头和 Blast Radius 是依赖证据，不自动等于已经证明的业务根因；治理影响沿同一血缘投影读取。',
    },
    governance: {
      technicalName: governanceAsset.technicalName,
      owner: governanceAsset.owner ?? 'Owner 待确认',
      lifecycle: governanceAsset.lifecycle,
      sensitivity: governanceAsset.sensitivity,
      definition: `${governanceAsset.businessDefinition.summary} Grain = ${governanceAsset.businessDefinition.grain}。`,
      qualityStatus: `${governanceAsset.qualityStatus ?? 'unknown'} · ${governanceRecommendation.status}`,
      qualityEvidence: governanceEvidence,
      impactSummary: `${governanceImpact.riskLevel} · ${governanceImpact.riskReason}`,
    },
    dataService: {
      primaryConsumer: selectedConsumer,
      consumerLabel: selectedConsumer ? getDataServiceConsumerLabel(selectedConsumer) : '尚未选择',
      assetName: visualization.dataService.asset.assetName,
      fileCompletionSignal: `${visualization.dataService.file.flagFileName} · ${fileState.statusLabel}`,
      apiBoundary: 'API 只访问已发布的上一业务日结果，不等于实时数据，也不能绕过 Release。',
      canConsume: fileState.canConsume,
    },
    performance: {
      beforeRuntime: `${visualization.performance.diagnosis.diagnosis.validation.beforeRuntimeMinutes} min`,
      afterRuntime: getPerformanceAfterRuntime(visualization, state.performanceChoice),
      beforeScan: beforeScan.scanBytes,
      afterScan: getPerformanceAfterScan(visualization, state.performanceChoice),
      cost: getPerformanceCost(visualization, state.performanceChoice),
      freshness: state.performanceMeasured
        ? state.performanceChoice === 'partition-pruning'
          ? '复测约 06:50 可用，早于 08:00 SLA（教学模拟）'
          : '需要继续观察剩余窗口和资源消耗'
        : '尚未复测',
      bottleneck: visualization.performance.diagnosis.diagnosis.longestTask.label,
      chosenOptimization: state.performanceChoice,
      measured: state.performanceMeasured,
      correctness: getPerformanceCorrectness(state.performanceChoice, state.performanceMeasured),
      maintainability: getPerformanceMaintainability(state.performanceChoice),
    },
    decisionRecords: state.decisions,
    knownAssumptions: [
      '所有金额、运行时间和收益数字均为确定性的教学模拟值，不是银行生产承诺。',
      'AccountBalanceSnapshot 和 LoanBalanceSnapshot 的 snapshot_date 与本次 business_date 对齐。',
      'Branch 是两套事实汇总时使用的公共维度；Customer、Product 不进入 Capstone 主加工链。',
      '存贷比只采用教学版公式 loan_balance ÷ deposit_balance，未引入监管口径。',
      `质量事故固定为 DWD ${formatAmount(12_000_000_000)}、DWS ${formatAmount(11_800_000_000)}。`,
    ],
    remainingRisks,
    nonGoals: [
      '不建设真实银行核心系统、信贷系统、数据库或生产级 API / 文件平台。',
      '不扩展 LoanContract、LoanNote、Repayment、授信、逾期或监管口径。',
      '不复制 Scheduler、Quality、Lineage、Governance、Data Service 或 Performance 领域模型。',
      '不做自由 SQL IDE、随机 Chaos 或实时数仓。',
    ],
    nextEvolution: [
      '为正式数据资产补充版本化契约、Owner、变更通知和可审计运行记录。',
      '根据真实消费者需求评估分区、增量加工和状态重建，而不是同时打开所有优化。',
      '在业务口径明确后再讨论更细的贷款产品或监管指标，不把它们偷偷塞进当前 Grain。',
    ],
  }
}

export function getCapstoneNodeTypeCounts(
  visualization: CapstoneVisualization,
): Record<string, number> {
  return visualization.lineage.nodes.reduce<Record<string, number>>((counts, node) => {
    const type = getLineageEntityType(node)
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})
}
