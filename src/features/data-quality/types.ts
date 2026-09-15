import type {
  SchedulerPartition,
  SchedulerRunState,
  SchedulerTaskRunRecord,
} from '../scheduler/types'

export type QualityDimension =
  | 'completeness'
  | 'uniqueness'
  | 'validity'
  | 'referential-integrity'
  | 'reconciliation'
  | 'freshness'

export type QualityRuleType =
  | 'row-count'
  | 'not-null'
  | 'unique-key'
  | 'enum'
  | 'range'
  | 'foreign-key'
  | 'aggregate-match'
  | 'max-delay'

export type QualitySeverity = 'critical' | 'high' | 'medium' | 'low'
export type QualityCheckStatus = 'pass' | 'warn' | 'fail'
export type QualityAction = 'block' | 'warn' | 'quarantine' | 'continue-with-risk'
export type QualityReleaseStatus =
  'released' | 'released-with-warning' | 'released-with-risk' | 'quarantined' | 'blocked'

export type QualityEventType = 'quality-check'
export type QualityEvidenceKind =
  'failed-sample' | 'metric-comparison' | 'scheduler-context' | 'partition-freshness'

export type QualityInjection =
  | 'none'
  | 'missing-order-item'
  | 'duplicate-order-item'
  | 'invalid-payment-status'
  | 'orphan-order-item'
  | 'sales-reconciliation-drift'
  | 'late-partition'

export type QualityThresholdUnit = 'rows' | 'minutes' | 'currency'
export type QualityThresholdOperator = 'at-most' | 'at-least' | 'equals'
export type QualityScalar = string | number | null

export interface QualityTarget {
  table: string
  field?: string
  partition: SchedulerPartition
}

/**
 * A rule threshold is intentionally numeric and deterministic for the lesson.
 * warningRange describes the interval after the pass boundary that becomes warn.
 */
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
  severity: QualitySeverity
  threshold: QualityThreshold
  description: string
  remediationHint: string
  schedulerTaskId: string
  downstreamImpacts: readonly string[]
}

export interface QualitySample {
  sampleId: string
  rowKey: string
  values: Readonly<Record<string, QualityScalar>>
  reason: string
}

export interface QualityEvidence {
  evidenceId: string
  kind: QualityEvidenceKind
  detail: string
  observedValue: number
  expectedValue: number
  expectedLabel: string
  samples: readonly QualitySample[]
}

/** Stable bridge from a quality result to the existing Scheduler domain. */
export interface QualitySchedulerContext {
  taskId: string
  runId: SchedulerRunState['runId']
  runStatus: SchedulerRunState['status']
  taskStatus: SchedulerTaskRunRecord['status']
  businessDate: string
  partition: SchedulerPartition
  outputTable: string
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
}

export interface QualityCheckResult {
  checkId: string
  ruleId: string
  status: QualityCheckStatus
  summary: string
  observedValue: number
  violationCount: number
  evaluatedRowCount: number
  threshold: QualityThreshold
  schedulerContext: QualitySchedulerContext
  evidence: readonly QualityEvidence[]
}

export interface QualityReleaseImpact {
  downstreamRelease: QualityReleaseStatus
  isBlocked: boolean
  affectedOutputs: readonly string[]
  explanation: string
}

export interface QualityRemediation {
  action: QualityAction
  label: string
  steps: readonly string[]
  canRerun: boolean
  rerunTaskId: string
}

/** Context that a later lineage or governance chapter can import without UI coupling. */
export interface QualityInvestigationContext {
  target: QualityTarget
  schedulerTaskId: string
  schedulerRunId: string
  upstreamHints: readonly string[]
  downstreamImpacts: readonly string[]
  relatedRuleIds: readonly string[]
}

/** A non-score quality event carries the failed rule, evidence, and release consequence. */
export interface QualityEvent {
  eventId: string
  eventType: QualityEventType
  checkId: string
  ruleId: string
  status: QualityCheckStatus
  severity: QualitySeverity
  occurredAt: string
  target: QualityTarget
  threshold: QualityThreshold
  observedValue: number
  evidence: readonly QualityEvidence[]
  schedulerContext: QualitySchedulerContext
  releaseImpact: QualityReleaseImpact
  remediation: QualityRemediation
  investigationContext: QualityInvestigationContext
}

export interface QualityCheckCounts {
  pass: number
  warn: number
  fail: number
}

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
  remediation: readonly QualityRemediation[]
  rationale: string
}

export interface QualityInjectionOption {
  id: QualityInjection
  label: string
  description: string
  dimension?: QualityDimension
  ruleId?: string
}

export interface DataQualityVisualization {
  kind: 'data-quality'
  targetDate: string
  schedulerRun: SchedulerRunState
  rules: readonly QualityRuleDefinition[]
  injections: readonly QualityInjectionOption[]
  defaultInjection: QualityInjection
}

export interface QualityEvaluationOptions {
  injection?: QualityInjection
  action?: QualityAction
  thresholdOverrides?: Readonly<Record<string, number>>
}

export interface QualityEvaluation {
  schedulerRun: SchedulerRunState
  injection: QualityInjection
  action: QualityAction
  checks: readonly QualityCheckResult[]
  events: readonly QualityEvent[]
  releaseDecision: QualityReleaseDecision
}
