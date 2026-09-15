import type { QualityEvent } from '../data-quality/types'
import type { LineageEvidence } from '../../types'
import { getLineageTableNodeId, getLineageTaskNodeId } from './mapping'
import type {
  LineageExternalEventAdapter,
  LineageInvestigationContext,
  LineageInvestigationEventDefinition,
} from './types'

const QUALITY_FINAL_IMPACT_NODE_ID = 'metric-report-status'

function formatQualityTarget(event: QualityEvent): string {
  const field = event.field ?? event.target.field ?? 'table-level'
  return `${event.target.table}.${field}`
}

function createQualityEventEvidence(event: QualityEvent): LineageEvidence {
  const evidenceIds = event.evidence.map((evidence) => evidence.evidenceId).join('、')
  const sampleText = event.sample ? `，包含样本 ${event.sample.rowKey}` : '，没有行级样本'
  return {
    source: 'quality_event',
    detail: `Quality Event ${event.eventId} 记录规则 ${event.ruleId} 在 ${formatQualityTarget(event)} 的事实：expected ${String(event.expected)}，observed ${String(event.observed)}；证据 ${evidenceIds || '未提供'}${sampleText}。根因与影响仍需沿血缘调查。`,
  }
}

function createRootCauseCandidate(
  event: QualityEvent,
  targetLabel: string,
): NonNullable<LineageInvestigationEventDefinition['rootCauseCandidate']> {
  const taskId = event.schedulerContext.taskId
  const entityId = getLineageTaskNodeId(taskId)
  const evidence: LineageEvidence = {
    source: 'task_dependency',
    detail: `Quality Event 只提供 ${taskId}、${event.schedulerContext.runId} 和质量证据。该 task 负责产出 ${event.schedulerContext.schedulerOutputTable}，因此被列为优先复核入口；这不是已经证明的根因。`,
  }

  return {
    entityId,
    confidence: 'inferred',
    evidence,
    rationale: `${targetLabel} 的质量检查失败，先沿 ${taskId} 的输入、过滤和 JOIN 复核；最终根因需要结合血缘证据与业务规则确认。`,
  }
}

/**
 * Quality Event owns observed facts. This adapter derives the lineage investigation context from
 * the scheduler task and the compatibility table map instead of reading upstream/downstream hints
 * from the event.
 */
export function qualityEventToLineageInvestigation(
  event: QualityEvent,
): LineageInvestigationEventDefinition {
  const sourceEntityId = getLineageTableNodeId(event.target.table)
  const schedulerContext = event.schedulerContext
  const context: LineageInvestigationContext = {
    taskId: schedulerContext.taskId,
    runId: schedulerContext.runId,
    businessDate: event.businessDate,
    partition: event.partition,
    status: schedulerContext.taskStatus,
  }

  return {
    id: `investigate-${event.eventId}`,
    entryPoint: 'quality-event',
    label: `Quality Event · ${event.ruleId}`,
    summary: `规则 ${event.ruleId} 在 ${formatQualityTarget(event)} 的 ${event.partition.column} = ${event.partition.value} 分区失败；从产出表和生产 task 开始复核，根因与下游影响由血缘关系推导。`,
    sourceEntityId,
    eventType: 'quality_alert',
    affectedEntityId: QUALITY_FINAL_IMPACT_NODE_ID,
    evidence: createQualityEventEvidence(event),
    context,
    qualityEvent: event,
    rootCauseCandidate: createRootCauseCandidate(event, formatQualityTarget(event)),
  }
}

/** The implementation uses the adapter seam reserved by the lineage production chain. */
export const qualityEventAdapter: LineageExternalEventAdapter<QualityEvent> = {
  toInvestigationEvent: qualityEventToLineageInvestigation,
}
