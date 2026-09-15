import type {
  LineageConfidence,
  LineageEdge,
  LineageEvidence,
  LineageInvestigationEvent,
  LineageNode,
} from '../../types'
import type { QualityEvent } from '../data-quality/types'

/**
 * 调查入口是教学层对外的事件语义；它不复制第 07 章的质量领域模型。
 * `quality-event` 由 adapter 接入，具体 QualityEvent 仍由第 07 章拥有。
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

export interface LineageRootCauseCandidate {
  entityId: string
  confidence: LineageConfidence
  evidence: LineageEvidence
  rationale: string
}

export interface LineageInvestigationEventDefinition extends LineageInvestigationEvent {
  entryPoint: LineageInvestigationEntryPoint
  label: string
  summary: string
  context?: LineageInvestigationContext
  /** Keep the source-domain event available instead of copying its contract into Lineage. */
  qualityEvent?: QualityEvent
  rootCauseCandidate?: LineageRootCauseCandidate
}

/** Structured provenance kept by the lineage projection without changing legacy graph types. */
export interface LineageProductionNode extends LineageNode {
  schedulerTaskId?: string
}

export interface LineageProductionEdge extends LineageEdge {
  schedulerTaskId?: string
  transformationStepId?: string
}

/**
 * #13 integration seam: an external event owns its own domain contract and only
 * needs to translate into the existing lineage investigation event shape.
 */
export interface LineageExternalEventAdapter<TEvent> {
  toInvestigationEvent(event: TEvent): LineageInvestigationEventDefinition
}
