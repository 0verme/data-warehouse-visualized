import type { QualityEvent } from '../data-quality/types'
import type {
  LineageConfidence,
  LineageEvidence,
  LineageEvidenceSource,
  LineageInvestigationEvent,
  LineageRelationType,
  LineageVerificationStatus,
} from '../../types'

/**
 * 调查入口是教学层对外的事件语义；它不复制第 06 章的质量领域模型。
 * `quality-event` 由 adapter 接入，具体 QualityEvent 仍由第 06 章拥有。
 */
export type LineageInvestigationEntryPoint =
  'field-semantic-change' | 'schema-change' | 'task-failure' | 'quality-event'

export interface LineageInvestigationContext {
  taskId?: string
  runId?: string
  businessDate?: string
  partition?: {
    column: string
    value: string
  }
  attempt?: number
  status?: string
  dependencyState?: string
  outputState?: string
}

export type LineageRootCauseCandidateKind =
  'value-source' | 'join-dependency' | 'filter-dependency' | 'task-output'

export interface LineageRootCauseCandidate {
  id?: string
  entityId: string
  label?: string
  kind?: LineageRootCauseCandidateKind
  evidence: LineageEvidence
  evidenceSource: LineageEvidenceSource
  verificationStatus: LineageVerificationStatus
  /** A human-readable dependency path used for investigation, not proof of causality. */
  evidencePath?: readonly string[]
  rationale: string
  /** @deprecated Use verificationStatus; retained while legacy lessons migrate. */
  confidence?: LineageConfidence
}

export interface LineageInvestigationEventDefinition extends LineageInvestigationEvent {
  entryPoint: LineageInvestigationEntryPoint
  label: string
  summary: string
  context?: LineageInvestigationContext
  /** Keep the source-domain event available instead of copying its contract into Lineage. */
  qualityEvent?: QualityEvent
  /** Candidates are hypotheses selected from relationships already present in the graph. */
  rootCauseCandidates?: readonly LineageRootCauseCandidate[]
  /** Legacy single-candidate field remains readable by older investigation consumers. */
  rootCauseCandidate?: LineageRootCauseCandidate
}

export interface LineageExternalEventAdapter<TEvent> {
  toInvestigationEvent(event: TEvent): LineageInvestigationEventDefinition
}

export type LineageLessonMode =
  'overview' | 'field-dependencies' | 'investigation' | 'impact' | 'evidence'

export type LineageFieldDependencyKind = 'aggregate' | 'rename' | 'filter' | 'join'

/** A compact field path; operation labels are evidence, not an SQL tutorial. */
export interface LineageFieldDependency {
  id: string
  kind: LineageFieldDependencyKind
  label: string
  operation: 'SUM' | 'rename' | 'FILTER' | 'JOIN'
  sourceFields: readonly string[]
  targetFields: readonly string[]
  path: readonly string[]
  detail: string
  evidence: LineageEvidence
  evidenceSource: LineageEvidenceSource
  verificationStatus: LineageVerificationStatus
}

export interface LineageTaskDependencyExample {
  upstreamTaskId: string
  downstreamTaskId: string
  upstreamLabel: string
  downstreamLabel: string
  evidence: LineageEvidence
  evidenceSource: LineageEvidenceSource
  verificationStatus: LineageVerificationStatus
}

export interface LineageInvestigationTeachingConfig {
  qualityEvent: QualityEvent
  anomalyNodeId: string
  directUpstreamNodeIds: readonly string[]
  upstreamExpansionNodeIds: readonly string[]
  transformationChecks: readonly string[]
  candidates: readonly LineageRootCauseCandidate[]
  evidenceRecordIds?: readonly string[]
}

export interface LineageImpactTeachingConfig {
  sourceNodeId: string
  choiceNodeIds: readonly string[]
  expectedDirectNodeIds: readonly string[]
  expectedTransitiveNodeIds: readonly string[]
  finalMetricNodeId?: string
  affectedMetricLabel?: string
}

/** Evidence examples may include a pending manual relation without affecting graph traversal. */
export interface LineageEvidenceRecord {
  id: string
  sourceEntityId: string
  targetEntityId: string
  sourceLabel: string
  targetLabel: string
  relation: LineageRelationType
  evidence: LineageEvidence
  evidenceSource: LineageEvidenceSource
  verificationStatus: LineageVerificationStatus
}

export interface LineageTeachingConfig {
  mode: LineageLessonMode
  tableNodeIds: readonly string[]
  overviewNodeIds?: readonly string[]
  initialNodeId?: string
  taskDependency?: LineageTaskDependencyExample
  fieldDependencies?: readonly LineageFieldDependency[]
  investigation?: LineageInvestigationTeachingConfig
  impact?: LineageImpactTeachingConfig
  evidenceRecords?: readonly LineageEvidenceRecord[]
}
