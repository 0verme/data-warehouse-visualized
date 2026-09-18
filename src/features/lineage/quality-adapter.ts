import type { QualityEvent } from '../data-quality/types'
import type { LineageEvidence } from '../../types'
import { BANKING_LINEAGE_NODE_IDS, bankingRootCauseCandidates } from './banking'
import { getLineageTableNodeId, getLineageTaskNodeId } from './mapping'
import type {
  LineageExternalEventAdapter,
  LineageInvestigationContext,
  LineageInvestigationEventDefinition,
  LineageRootCauseCandidate,
} from './types'

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

function createTaskRootCauseCandidate(
  event: QualityEvent,
  targetLabel: string,
): LineageRootCauseCandidate {
  const taskId = event.schedulerContext.taskId
  const entityId = getLineageTaskNodeId(taskId)
  const evidence: LineageEvidence = {
    source: 'task_dependency',
    detail: `Quality Event 只提供 ${taskId}、${event.schedulerContext.runId} 和质量证据。该 task 负责产出 ${event.schedulerContext.schedulerOutputTable}，因此被列为优先复核入口；这不是已经证明的根因。`,
  }

  return {
    entityId,
    kind: 'task-output',
    confidence: 'inferred',
    evidence,
    evidenceSource: evidence.source,
    verificationStatus: 'pending',
    rationale: `${targetLabel} 的质量检查失败，先沿 ${taskId} 的输入、过滤和 JOIN 复核；最终根因需要结合血缘证据与业务规则确认。`,
  }
}

function createRootCauseCandidates(
  event: QualityEvent,
  targetLabel: string,
): LineageRootCauseCandidate[] {
  if (event.target.table === 'dws_deposit_balance_daily') {
    return bankingRootCauseCandidates.map((candidate) => ({ ...candidate }))
  }

  return [createTaskRootCauseCandidate(event, targetLabel)]
}

/**
 * Quality Event owns observed facts. This adapter derives the lineage investigation context from
 * the scheduler task and the canonical Banking table map instead of reading investigation hints
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
  const candidates = createRootCauseCandidates(event, formatQualityTarget(event))

  return {
    id: `investigate-${event.eventId}`,
    entryPoint: 'quality-event',
    label: `Quality Event · ${event.ruleId}`,
    summary: `规则 ${event.ruleId} 在 ${formatQualityTarget(event)} 的 ${event.partition.column} = ${event.partition.value} 分区失败；从产出表开始复核直接上游，根因与下游影响由血缘关系推导。`,
    sourceEntityId,
    eventType: 'quality_alert',
    affectedEntityId: BANKING_LINEAGE_NODE_IDS.metric,
    evidence: createQualityEventEvidence(event),
    context,
    qualityEvent: event,
    rootCauseCandidates: candidates,
    rootCauseCandidate: candidates[0],
  }
}

/** Quality Event → lineage investigation adapter for the Banking Teaching Domain. */
export const qualityEventAdapter: LineageExternalEventAdapter<QualityEvent> = {
  toInvestigationEvent: qualityEventToLineageInvestigation,
}
