import type { QualityEvent } from '../data-quality/types'
import type { LineageEvidence } from '../../types'
import { getLineageTableNodeId, getLineageTaskNodeId } from './mapping'
import { BANKING_LINEAGE_NODE_IDS, bankingRootCauseCandidates } from './banking'
import type {
  LineageExternalEventAdapter,
  LineageInvestigationContext,
  LineageInvestigationEventDefinition,
  LineageRootCauseCandidate,
} from './types'

const LEGACY_QUALITY_FINAL_IMPACT_NODE_ID = 'metric-report-status'

function formatQualityTarget(event: QualityEvent): string {
  const field = event.target.field ?? 'table-level'
  return `${event.target.table}.${field}`
}

function createQualityEventEvidence(event: QualityEvent): LineageEvidence {
  const evidenceIds = event.evidence.map((evidence) => evidence.evidenceId).join('、')
  const downstreamImpacts = event.investigationContext.downstreamImpacts.join('、')
  return {
    source: 'quality_event',
    detail: `Quality Event ${event.eventId} 由规则 ${event.ruleId} 触发：${formatQualityTarget(event)} 在 ${event.target.partition.column} = ${event.target.partition.value} 上为 ${event.status}（${event.severity}），观察值 ${event.observedValue} ${event.threshold.unit}；质量证据 ${evidenceIds || '未提供'}，QualityInvestigationContext 指向下游 ${downstreamImpacts || '未提供'}。`,
  }
}

function createTaskRootCauseCandidate(
  event: QualityEvent,
  targetLabel: string,
): LineageRootCauseCandidate {
  const entityId = getLineageTaskNodeId(event.investigationContext.schedulerTaskId)
  const upstreamHints = event.investigationContext.upstreamHints.join(' ')
  const evidence: LineageEvidence = {
    source: 'task_dependency',
    detail: `候选依据：Quality Event ${event.eventId} 的 QualityInvestigationContext 指向 ${event.investigationContext.schedulerTaskId}，该任务负责产出 ${event.schedulerContext.outputTable}；先复核它的输入、过滤和 JOIN。这个对象只是优先复核的可能根因，不等于已经证明业务因果。`,
  }

  return {
    entityId,
    kind: 'task-output',
    confidence: 'inferred',
    evidence,
    evidenceSource: evidence.source,
    verificationStatus: 'pending',
    rationale: `${targetLabel} 的质量检查失败，${event.investigationContext.schedulerTaskId} 是对应输出的生产任务，因此列为可能根因候选；${upstreamHints || '仍需检查 QualityEvidence 指向的上游数据'}仍需结合上游数据和业务规则确认。`,
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

function getFinalImpactNodeId(event: QualityEvent): string {
  return event.target.table === 'dws_deposit_balance_daily'
    ? BANKING_LINEAGE_NODE_IDS.metric
    : LEGACY_QUALITY_FINAL_IMPACT_NODE_ID
}

/**
 * 将第 07 章拥有的真实 QualityEvent 投影成 Lineage investigation event。
 * adapter 不重定义质量规则、状态、严重级别或 Scheduler context。
 */
export function qualityEventToLineageInvestigation(
  event: QualityEvent,
): LineageInvestigationEventDefinition {
  const sourceEntityId = getLineageTableNodeId(event.target.table)
  const context: LineageInvestigationContext = {
    taskId: event.investigationContext.schedulerTaskId,
    runId: event.investigationContext.schedulerRunId,
    businessDate: event.schedulerContext.businessDate,
    partition: event.investigationContext.target.partition,
    status: event.schedulerContext.taskStatus,
  }
  const candidates = createRootCauseCandidates(event, formatQualityTarget(event))

  return {
    id: `investigate-${event.eventId}`,
    entryPoint: 'quality-event',
    label: `Quality Event · ${event.ruleId}`,
    summary: `规则 ${event.ruleId} 在 ${formatQualityTarget(event)} 的 ${event.target.partition.column} = ${event.target.partition.value} 分区失败；从产出表开始复核直接上游，先判断异常是否已经存在，再决定是否继续向上。血缘路径只表示依赖，不自动证明业务因果。`,
    sourceEntityId,
    eventType: 'quality_alert',
    affectedEntityId: getFinalImpactNodeId(event),
    evidence: createQualityEventEvidence(event),
    context,
    qualityEvent: event,
    rootCauseCandidates: candidates,
    rootCauseCandidate: candidates[0],
  }
}

/** The implementation uses the adapter seam reserved by the lineage production chain. */
export const qualityEventAdapter: LineageExternalEventAdapter<QualityEvent> = {
  toInvestigationEvent: qualityEventToLineageInvestigation,
}
