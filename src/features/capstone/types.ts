import type {
  DataServiceApiExample,
  DataServiceFileDelivery,
  DataServicePublishedAsset,
  DataServicePublishedBalance,
} from '../data-service/types'
import type {
  QualityCheckResult,
  QualityEvent,
  QualityEvaluation,
  QualityScalar,
  QualityThreshold,
} from '../data-quality/types'
import type {
  SchedulerRerunPlan,
  SchedulerRunState,
  SchedulerTaskDefinition,
} from '../scheduler/types'
import type {
  PerformanceDiagnosisVisualization,
  PerformanceScanLayoutVisualization,
  PerformanceTradeoffsVisualization,
} from '../performance/types'
import type {
  GovernanceAsset,
  GovernanceQualityEvidence,
  LineageEdge,
  LineageNode,
} from '../../types'
import type { LineageInvestigationEventDefinition } from '../lineage/types'
import type { Account, AccountBalanceSnapshot, Branch } from '../sql-transformation/types'

/** Capstone-only teaching input; it is not a second loan domain model. */
export interface LoanBalanceSnapshot {
  loan_id: string
  customer_id: string
  branch_id: string
  snapshot_date: string
  balance: number
}

export const CAPSTONE_STAGE_IDS = [
  'mission-brief',
  'design',
  'build',
  'operate',
  'incident',
  'investigate',
  'deliver',
  'scale',
  'launch-review',
] as const

export type CapstoneStageId = (typeof CAPSTONE_STAGE_IDS)[number]

export const CAPSTONE_INCIDENT_IDS = [
  'loan-late',
  'deposit-reconciliation',
  'scale-sla-risk',
] as const

export type CapstoneIncidentId = (typeof CAPSTONE_INCIDENT_IDS)[number]

export type CapstoneCheckpointStatus = 'locked' | 'available' | 'completed' | 'blocked'
export type CapstoneMissionStatus = 'in-progress' | 'blocked' | 'ready' | 'ready-with-risk'
export type CapstoneLaunchStatus = 'READY' | 'BLOCKED' | 'READY WITH RISK'
export type CapstoneIncidentStatus = 'not-started' | 'handled' | 'recovered'

export type CapstoneGrainChoice =
  'business-date-branch' | 'branch-only' | 'account-business-date-branch'
export type CapstoneBuildChoice = 'aggregate-then-join' | 'join-raw-facts'
export type CapstoneLoanLateDecision =
  'wait-for-loan' | 'rerun-original-business-date' | 'publish-deposit-only'
export type CapstoneReconciliationDecision = 'block-and-investigate' | 'override-release'
export type CapstoneConsumerChoice = 'report' | 'file' | 'api'
export type CapstonePerformanceChoice = 'partition-pruning' | 'add-resources' | 'no-change'

export interface CapstoneMetricDefinition {
  id: 'deposit-balance' | 'loan-balance' | 'loan-deposit-ratio'
  label: string
  formula: string
  unit: string
  timeSemantics: string
}

export interface CapstoneMissionBrief {
  id: string
  title: string
  businessDate: string
  deliverySlaAt: string
  consumers: readonly string[]
  metrics: readonly CapstoneMetricDefinition[]
  sources: readonly string[]
  grain: string
  releasePrerequisite: string
}

export interface BranchBusinessDaily {
  business_date: string
  branch_id: string
  deposit_balance: number
  loan_balance: number
  loan_deposit_ratio: number | null
  loan_deposit_ratio_status: 'calculated' | 'not-calculable'
}

export interface CapstoneCheckpointDefinition {
  id: CapstoneStageId
  label: string
  question: string
  deliverable: string
}

export interface CapstoneIncidentState {
  id: CapstoneIncidentId
  status: CapstoneIncidentStatus
  decision: string | null
  consequence: string | null
  recoveryPath: string | null
}

export interface CapstoneDecisionRecord {
  id: string
  checkpointId: CapstoneStageId
  recordedAt: string
  input: string
  evidence: readonly string[]
  decision: string
  consequence: string
  projectStatus: CapstoneMissionStatus
  recoveryPath: string
}

/** Backward-friendly domain name for consumers that call these entries Decision Records. */
export type DecisionRecord = CapstoneDecisionRecord

/**
 * 跨层对账事故里可以在加工链路上被真实修复的三个缺陷维度。
 * 缺陷只描述“事故数据本身处于什么状态”，repair action 负责把它移除后重新计算。
 */
export type CapstoneReconciliationDefect =
  'value-source-drift' | 'branch-join-loss' | 'product-filter-over-restriction'

export interface CapstoneReconciliationConfig {
  readonly defects: readonly CapstoneReconciliationDefect[]
}

export type CapstoneRepairTarget = 'value-source' | 'branch-join' | 'product-filter'

/** 一个根因候选对应一个确定性修复动作；动作只改写加工配置，再由 recompute 得到结果。 */
export interface CapstoneQualityRepairAction {
  id: string
  target: CapstoneRepairTarget
  clearsDefect: CapstoneReconciliationDefect
  label: string
  detail: string
  rerunScope: string
  /** 该动作对应的 root cause candidate id / entityId，用于把候选映射到可执行修复。 */
  candidateKeys: readonly string[]
}

export interface CapstoneReconciliationGroupOutcome {
  groupId: string
  label: string
  balance: number
  includedInDws: boolean
  excludedReason: string | null
}

/** apply transformation 之后重新计算出的对账数据状态。 */
export interface CapstoneReconciliationRecompute {
  config: CapstoneReconciliationConfig
  dwdReaggregated: number
  dwsWritten: number
  delta: number
  groups: readonly CapstoneReconciliationGroupOutcome[]
}

/** 复检证据：由既有 `evaluateDataQuality` 在重算后的模型上重新执行得出。 */
export interface CapstoneQualityRecheck {
  repairActionId: string
  repairLabel: string
  candidateVerdict: 'confirmed' | 'rejected'
  ruleId: string
  expected: QualityScalar
  observed: QualityScalar
  expectedBalance: number
  observedBalanceBefore: number
  observedBalanceAfter: number
  delta: number
  threshold: QualityThreshold
  status: QualityCheckResult['status']
  releaseStatus: QualityEvaluation['releaseDecision']['status']
  appliedChanges: readonly string[]
  evidence: readonly string[]
}

export interface CapstoneProjectState {
  missionId: string
  businessDate: string
  activeCheckpointId: CapstoneStageId
  checkpointStates: Readonly<Record<CapstoneStageId, CapstoneCheckpointStatus>>
  completedCheckpointIds: readonly CapstoneStageId[]
  grainChoice: CapstoneGrainChoice | null
  buildChoice: CapstoneBuildChoice | null
  operateConfirmed: boolean
  loanLateDecision: CapstoneLoanLateDecision | null
  reconciliationDecision: CapstoneReconciliationDecision | null
  investigationCandidateId: string | null
  /** 已应用的修复动作；null = 尚未执行修复，Release 不能解除阻断。 */
  qualityRepairActionId: string | null
  /** 由 qualityRepairActionId 确定性派生的复检结果，是 Release 闸门的唯一依据。 */
  qualityRecheck: CapstoneQualityRecheck | null
  consumerChoice: CapstoneConsumerChoice | null
  performanceChoice: CapstonePerformanceChoice | null
  performanceMeasured: boolean
  launchReviewed: boolean
  incidents: Readonly<Record<CapstoneIncidentId, CapstoneIncidentState>>
  decisions: readonly CapstoneDecisionRecord[]
  missionStatus: CapstoneMissionStatus
  launchStatus: CapstoneLaunchStatus
}

export type CapstoneAction =
  | { type: 'select-checkpoint'; checkpointId: CapstoneStageId }
  | { type: 'confirm-mission' }
  | { type: 'choose-grain'; choice: CapstoneGrainChoice }
  | { type: 'choose-build'; choice: CapstoneBuildChoice }
  | { type: 'confirm-operate' }
  | { type: 'handle-loan-late'; decision: CapstoneLoanLateDecision }
  | { type: 'handle-reconciliation'; decision: CapstoneReconciliationDecision }
  | { type: 'select-root-cause'; candidateId: string }
  | { type: 'apply-quality-repair' }
  | { type: 'choose-consumer'; consumer: CapstoneConsumerChoice }
  | { type: 'choose-performance'; choice: CapstonePerformanceChoice }
  | { type: 'measure-performance' }
  | { type: 'complete-launch-review' }
  | { type: 'reset' }

export interface CapstoneSchedulerProjection {
  tasks: readonly SchedulerTaskDefinition[]
  happyRun: SchedulerRunState
  lateRun: SchedulerRunState
  lateTimeline: readonly SchedulerRunState[]
  loanExpectedAt: string
  processingStartedAt: string
  loanArrivedAt: string
  deliverySlaAt: string
  loanRerunPlan: SchedulerRerunPlan
  backfillPlan: SchedulerRerunPlan
}

export interface CapstoneQualityProjection {
  failure: QualityEvaluation
  /**
   * 参考复检：对事故配置应用「清除现存缺陷」的修复后重新计算的评估结果。
   * 只用于 Governance 的已发布展示模板；Release 闸门读取 state.qualityRecheck。
   */
  recoveryReference: QualityEvaluation
  repairActions: readonly CapstoneQualityRepairAction[]
  event: QualityEvent
  reconciliation: {
    businessDate: string
    branch: string
    expectedDwdBalance: number
    observedDwsBalance: number
    delta: number
  }
}

export interface CapstoneLineageProjection {
  nodes: readonly LineageNode[]
  edges: readonly LineageEdge[]
  investigationEvent: LineageInvestigationEventDefinition
}

export interface CapstoneGovernanceProjection {
  asset: GovernanceAsset
  recoveredAsset: GovernanceAsset
  failureEvidence: GovernanceQualityEvidence
  recoveryEvidence: GovernanceQualityEvidence
}

export interface CapstoneDataServiceProjection {
  asset: DataServicePublishedAsset
  publishedBalances: readonly DataServicePublishedBalance[]
  file: DataServiceFileDelivery
  api: DataServiceApiExample
}

export interface CapstonePerformanceProjection {
  diagnosis: PerformanceDiagnosisVisualization
  scanLayout: PerformanceScanLayoutVisualization
  tradeoffs: PerformanceTradeoffsVisualization
}

export interface CapstoneSourceFacts {
  depositSnapshots: readonly AccountBalanceSnapshot[]
  accounts: readonly Account[]
  branches: readonly Branch[]
  loanSnapshots: readonly LoanBalanceSnapshot[]
  productRows: readonly BranchBusinessDaily[]
}

export interface CapstoneVisualization {
  kind: 'capstone'
  mission: CapstoneMissionBrief
  checkpoints: readonly CapstoneCheckpointDefinition[]
  facts: CapstoneSourceFacts
  scheduler: CapstoneSchedulerProjection
  quality: CapstoneQualityProjection
  lineage: CapstoneLineageProjection
  governance: CapstoneGovernanceProjection
  dataService: CapstoneDataServiceProjection
  performance: CapstonePerformanceProjection
}

export interface CapstoneLaunchReview {
  status: CapstoneLaunchStatus
  mission: CapstoneMissionBrief
  finalGrain: string
  metrics: readonly CapstoneMetricDefinition[]
  sources: readonly string[]
  dag: {
    taskCount: number
    dependencies: readonly string[]
    scheduledAt: string
    deliverySlaAt: string
    finalRunStatus: SchedulerRunState['status']
    lateInputArrival: string
    outputAvailableAt: string | null
  }
  quality: {
    failureStatus: QualityEvaluation['releaseDecision']['status']
    failureEventId: string
    expectedValue: string
    observedValue: string
    effectiveStatus: QualityEvaluation['releaseDecision']['status']
    effectiveBlocked: boolean
    recheck: CapstoneQualityRecheck | null
    rerunBusinessDate: string
    evidenceBoundary: string
  }
  lineage: {
    upstream: readonly string[]
    directDownstream: readonly string[]
    transitiveDownstream: readonly string[]
    blastRadius: readonly string[]
    rootCauseCandidates: readonly string[]
    evidenceBoundary: string
  }
  governance: {
    technicalName: string
    owner: string
    lifecycle: string
    sensitivity: string
    definition: string
    qualityStatus: string
    qualityEvidence: GovernanceQualityEvidence
    impactSummary: string
  }
  dataService: {
    primaryConsumer: CapstoneConsumerChoice | null
    consumerLabel: string
    assetName: string
    fileCompletionSignal: string
    apiBoundary: string
    canConsume: boolean
  }
  performance: {
    beforeRuntime: string
    afterRuntime: string
    beforeScan: string
    afterScan: string
    cost: string
    freshness: string
    bottleneck: string
    chosenOptimization: CapstonePerformanceChoice | null
    measured: boolean
    correctness: string
    maintainability: string
  }
  decisionRecords: readonly CapstoneDecisionRecord[]
  knownAssumptions: readonly string[]
  remainingRisks: readonly string[]
  nonGoals: readonly string[]
  nextEvolution: readonly string[]
}
