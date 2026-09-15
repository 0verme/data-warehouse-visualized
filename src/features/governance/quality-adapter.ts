import type { GovernanceQualityEvidence, GovernanceQualityEvidenceItem } from '../../types'
import type {
  QualityCheckResult,
  QualityEvent,
  QualityEvidence,
  QualityEvaluation,
  QualityReleaseDecision,
  QualityRuleDefinition,
} from '../data-quality/types'

function projectSamples(evidence: QualityEvidence): GovernanceQualityEvidenceItem['samples'] {
  if (!evidence.sample) {
    return []
  }

  return [
    {
      sampleId: evidence.sample.sampleId,
      rowKey: evidence.sample.rowKey,
      values: evidence.sample.values,
      reason: evidence.sample.reason,
    },
  ]
}

function formatEvidenceValue(value: QualityEvidence['expected']): string {
  return value === null ? 'NULL' : String(value)
}

function projectEvidenceItems(
  evidence: readonly QualityEvidence[],
): GovernanceQualityEvidenceItem[] {
  return evidence.map((item) => ({
    evidenceId: item.evidenceId,
    kind: item.kind,
    detail: item.detail,
    observedValue: item.observed,
    expectedValue: item.expected,
    expectedLabel: formatEvidenceValue(item.expected),
    samples: projectSamples(item),
  }))
}

function countFailedSamples(evidence: readonly QualityEvidence[]): number {
  return evidence.reduce((count, item) => count + (item.sample ? 1 : 0), 0)
}

function getExpectedLabel(
  evidence: readonly GovernanceQualityEvidenceItem[],
  fallback: string,
): string {
  return evidence.find((item) => item.expectedLabel)?.expectedLabel ?? fallback
}

function getRemainingRisk(
  status: QualityCheckResult['status'],
  ruleId: string,
  releaseDecision: Pick<
    QualityReleaseDecision,
    'action' | 'status' | 'isBlocked' | 'affectedOutputs'
  >,
  failedSampleCount: number,
): string {
  if (releaseDecision.isBlocked || status === 'fail') {
    return `Quality ${status}：规则 ${ruleId} 的 ${failedSampleCount} 条失败样本仍需处理；Release Decision 为 ${releaseDecision.action} / ${releaseDecision.status}。`
  }

  if (status === 'warn') {
    return `Quality warn：规则 ${ruleId} 允许继续但保留告警；消费方仍需核对证据和受影响输出。`
  }

  return `Quality pass：规则 ${ruleId} 当前通过；该结论只覆盖本次检查的目标、分区和阈值。`
}

function createProjection({
  status,
  severity,
  eventId,
  ruleId,
  ruleName,
  target,
  observedValue,
  expectedValue,
  evidence,
  lastCheckedAt,
  schedulerTaskId,
  schedulerRunId,
  taskStatus,
  releaseDecision,
}: {
  status: QualityCheckResult['status']
  severity?: QualityEvent['severity']
  eventId?: string
  ruleId: string
  ruleName?: string
  target: QualityEvent['target']
  observedValue: number
  expectedValue: number
  evidence: readonly QualityEvidence[]
  lastCheckedAt: string
  schedulerTaskId: QualityEvent['schedulerContext']['taskId']
  schedulerRunId: QualityEvent['schedulerContext']['runId']
  taskStatus: QualityEvent['schedulerContext']['taskStatus']
  releaseDecision: Pick<
    QualityReleaseDecision,
    'action' | 'status' | 'isBlocked' | 'affectedOutputs'
  >
}): GovernanceQualityEvidence {
  const projectedEvidence = projectEvidenceItems(evidence)
  const failedSampleCount = countFailedSamples(evidence)

  return {
    source: 'chapter-07',
    status,
    ...(severity ? { severity } : {}),
    ...(eventId ? { eventId } : {}),
    ruleId,
    ...(ruleName ? { ruleName } : {}),
    target,
    observedValue,
    expectedValue,
    expectedLabel: getExpectedLabel(projectedEvidence, `阈值 ${expectedValue}`),
    evidence: projectedEvidence,
    failedSampleCount,
    lastCheckedAt,
    schedulerTaskId,
    schedulerRunId,
    taskStatus,
    releaseDecision: {
      action: releaseDecision.action,
      status: releaseDecision.status,
      isBlocked: releaseDecision.isBlocked,
      affectedOutputs: releaseDecision.affectedOutputs,
    },
    remainingRisk: getRemainingRisk(status, ruleId, releaseDecision, failedSampleCount),
  }
}

/**
 * Project one real QualityEvent without copying the quality domain model.
 * Release is passed separately because the event itself only owns observed facts.
 */
export function qualityEventToGovernanceEvidence(
  event: QualityEvent,
  ruleName?: string,
  releaseDecision: Pick<
    QualityReleaseDecision,
    'action' | 'status' | 'isBlocked' | 'affectedOutputs'
  > = {
    action: 'block',
    status: event.status === 'fail' ? 'blocked' : 'released',
    isBlocked: event.status === 'fail',
    affectedOutputs: [],
  },
): GovernanceQualityEvidence {
  return createProjection({
    status: event.status,
    ...(event.severity ? { severity: event.severity } : {}),
    eventId: event.eventId,
    ruleId: event.ruleId,
    ruleName,
    target: event.target,
    observedValue: event.observedValue,
    expectedValue: event.threshold.value,
    evidence: event.evidence,
    lastCheckedAt: event.occurredAt,
    schedulerTaskId: event.schedulerContext.taskId,
    schedulerRunId: event.schedulerContext.runId,
    taskStatus: event.schedulerContext.taskStatus,
    releaseDecision,
  })
}

/** Project a pass/warn QualityCheckResult when #13 emits no event for a pass. */
export function qualityCheckToGovernanceEvidence(
  check: QualityCheckResult,
  rule: Pick<QualityRuleDefinition, 'ruleId' | 'name' | 'severity' | 'target'>,
  releaseDecision: Pick<
    QualityReleaseDecision,
    'action' | 'status' | 'isBlocked' | 'affectedOutputs'
  >,
  clock = check.schedulerContext.endedAt ?? check.schedulerContext.scheduledAt,
): GovernanceQualityEvidence {
  return createProjection({
    status: check.status,
    severity: rule.severity,
    ruleId: rule.ruleId,
    ruleName: rule.name,
    target: rule.target,
    observedValue: check.observedValue,
    expectedValue: check.threshold.value,
    evidence: check.evidence,
    lastCheckedAt: clock,
    schedulerTaskId: check.schedulerContext.taskId,
    schedulerRunId: check.schedulerContext.runId,
    taskStatus: check.schedulerContext.taskStatus,
    releaseDecision,
  })
}

/** Resolve the rule/check pair from a real #13 evaluation for catalog projection. */
export function qualityEvaluationToGovernanceEvidence(
  evaluation: QualityEvaluation,
  rule: Pick<QualityRuleDefinition, 'ruleId' | 'name' | 'severity' | 'target'>,
): GovernanceQualityEvidence {
  const check = evaluation.checks.find((candidate) => candidate.ruleId === rule.ruleId)
  if (!check) {
    throw new Error(`治理质量适配找不到 Quality Check: ${rule.ruleId}`)
  }

  const event = evaluation.events.find((candidate) => candidate.ruleId === rule.ruleId)
  if (event) {
    return qualityEventToGovernanceEvidence(event, rule.name, evaluation.releaseDecision)
  }

  return qualityCheckToGovernanceEvidence(check, rule, evaluation.releaseDecision)
}
