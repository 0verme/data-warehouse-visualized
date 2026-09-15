import type {
  SchedulerPartition,
  SchedulerRunState,
  SchedulerTaskRunRecord,
} from '../scheduler/types'

/** Each lesson focuses on a different question while sharing the same model. */
export type QualityLessonMode = 'status' | 'rules' | 'dataset' | 'evidence' | 'release'

/** Where a rule gets its meaning; these are teaching anchors, not a score taxonomy. */
export type QualityDimension =
  'grain' | 'field' | 'relationship' | 'dataset' | 'freshness' | 'reconciliation' | 'format'

export type QualityRuleType =
  | 'grain-unique'
  | 'required-field'
  | 'field-semantic'
  | 'reference'
  | 'expected-set'
  | 'freshness-date'
  | 'reconciliation'
  | 'record-format'

export type QualitySeverity = 'critical' | 'high' | 'medium' | 'low'
export type QualityCheckStatus = 'pass' | 'warn' | 'fail'

/** Release has two deliberately non-peer examples: banking blocks, telemetry may quarantine. */
export type QualityAction = 'block' | 'quarantine'
export type QualityReleaseStatus = 'released' | 'quarantined' | 'blocked'

export type QualityEventType = 'quality-check'
export type QualityEvidenceKind = 'row' | 'set' | 'date' | 'aggregate' | 'scheduler'

export type QualityScenario =
  | 'baseline'
  | 'duplicate-grain'
  | 'missing-required-field'
  | 'invalid-currency'
  | 'missing-branch-reference'
  | 'bank-critical-branch-failure'
  | 'batch-incomplete'
  | 'stale-snapshot'
  | 'balance-reconciliation-drift'
  | 'telemetry-invalid-records'

export type QualityThresholdUnit = 'rows' | 'accounts' | 'days' | 'currency'
export type QualityThresholdOperator = 'at-most' | 'at-least' | 'equals'
export type QualityScalar = string | number | boolean | null

/**
 * A small projection of the existing BankingMetricAccountSnapshot.
 * It is a faulty teaching row, not a second Account/Customer/Product/Branch model.
 */
export interface QualityBalanceRow {
  accountId: string
  snapshotDate: string | null
  customerScope: string
  product: string
  branch: string
  currency: string
  status: string
  balance: number | null
}

export interface QualityBankingModel {
  targetDate: string
  sourceSnapshots: readonly QualityBalanceRow[]
  previousSnapshots: readonly QualityBalanceRow[]
  knownBranchIds: readonly string[]
  knownProductIds: readonly string[]
  knownCurrencyCodes: readonly string[]
  expectedActiveAccountCount: number
  receivedSnapshotAccountCount: number
  incompleteSnapshotAccountCount: number
  reconciliation: {
    businessDate: string
    branch: string
    customerScope: string
    product: string
    currency: string
    expectedDwdBalance: number
    observedDwsBalance: number
  }
  telemetry: {
    totalRecords: number
    invalidRecords: number
    sample: QualitySample
  }
}

export interface QualityTarget {
  table: string
  field?: string
  partition: SchedulerPartition
}

export interface QualityThreshold {
  operator: QualityThresholdOperator
  value: number
  unit: QualityThresholdUnit
  warningRange?: number
}

export interface QualityRuleDefinition {
  ruleId: string
  name: string
  dimension: QualityDimension
  ruleType: QualityRuleType
  target: QualityTarget
  severity?: QualitySeverity
  threshold: QualityThreshold
  description: string
  teachingQuestion: string
  schedulerTaskId: string
  /** Strict rules keep their boundary even if a learner edits a non-critical threshold. */
  strict: boolean
  releaseScope: 'banking' | 'telemetry'
}

export interface QualitySample {
  sampleId: string
  rowKey: string
  values: Readonly<Record<string, QualityScalar>>
  reason: string
}

/** Evidence can be row-level or aggregate; aggregate evidence intentionally has no sample. */
export interface QualityEvidence {
  evidenceId: string
  kind: QualityEvidenceKind
  detail: string
  expected: QualityScalar
  observed: QualityScalar
  failedRows?: number
  sample?: QualitySample
}

/** Stable bridge from a quality result to the existing Scheduler domain. */
export interface QualitySchedulerContext {
  taskId: string
  runId: SchedulerRunState['runId']
  runStatus: SchedulerRunState['status']
  taskStatus: SchedulerTaskRunRecord['status']
  businessDate: string
  partition: SchedulerPartition
  /** The quality target table. */
  outputTable: string
  /** The table name exposed by the current Scheduler task contract. */
  schedulerOutputTable: string
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
}

export interface QualityCheckResult {
  checkId: string
  ruleId: string
  status: QualityCheckStatus
  summary: string
  expected: QualityScalar
  observed: QualityScalar
  observedValue: number
  violationCount: number
  evaluatedRowCount: number
  failedRows?: number
  threshold: QualityThreshold
  schedulerContext: QualitySchedulerContext
  evidence: readonly QualityEvidence[]
}

/** Release consequence is calculated after facts and evidence; it is not copied into events. */
export interface QualityReleaseDecision {
  decisionId: string
  action: QualityAction
  status: QualityReleaseStatus
  isBlocked: boolean
  schedulerRunId: string
  businessDate: string
  partition: SchedulerPartition
  checkCounts: QualityCheckCounts
  eventIds: readonly string[]
  failedRuleIds: readonly string[]
  warningRuleIds: readonly string[]
  affectedOutputs: readonly string[]
  quarantinedSampleCount: number
  nextStep: string
  rationale: string
}

/** The event stops at the observed quality fact. Lineage derives investigation conclusions later. */
export interface QualityEvent {
  eventId: string
  eventType: QualityEventType
  checkId: string
  ruleId: string
  status: QualityCheckStatus
  severity?: QualitySeverity
  occurredAt: string
  businessDate: string
  target: QualityTarget
  partition: SchedulerPartition
  field?: string
  expected: QualityScalar
  observed: QualityScalar
  threshold: QualityThreshold
  observedValue: number
  failedRows?: number
  evidence: readonly QualityEvidence[]
  sample?: QualitySample
  schedulerContext: QualitySchedulerContext
}

export interface QualityCheckCounts {
  pass: number
  warn: number
  fail: number
}

export interface QualityScenarioOption {
  id: QualityScenario
  label: string
  description: string
  ruleId?: string
}

export interface DataQualityVisualization {
  kind: 'data-quality'
  lessonMode: QualityLessonMode
  targetDate: string
  schedulerRun: SchedulerRunState
  model: QualityBankingModel
  rules: readonly QualityRuleDefinition[]
  scenarios: readonly QualityScenarioOption[]
  defaultScenario: QualityScenario
  visibleRuleIds: readonly string[]
}

export interface QualityEvaluationOptions {
  /** `injection` remains as a small compatibility name for existing lesson consumers. */
  injection?: QualityScenario
  scenario?: QualityScenario
  action?: QualityAction
  thresholdOverrides?: Readonly<Record<string, number>>
}

export interface QualityEvaluation {
  schedulerRun: SchedulerRunState
  scenario: QualityScenario
  injection: QualityScenario
  action: QualityAction
  rows: readonly QualityBalanceRow[]
  checks: readonly QualityCheckResult[]
  events: readonly QualityEvent[]
  releaseDecision: QualityReleaseDecision
}
