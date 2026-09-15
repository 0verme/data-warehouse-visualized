import { useMemo, useState } from 'react'
import type {
  DataQualityVisualization,
  QualityAction,
  QualityCheckResult,
  QualityCheckStatus,
  QualityEvidence,
  QualityEvent,
  QualityReleaseDecision,
  QualityRemediation,
  QualityRuleDefinition,
  QualitySample,
  QualityThreshold,
} from '../../features/data-quality/types'
import {
  QUALITY_ACTION_OPTIONS,
  QUALITY_DIMENSION_LABELS,
  QUALITY_RELEASE_STATUS_LABELS,
  QUALITY_RULE_TYPE_LABELS,
  QUALITY_SEVERITY_LABELS,
  QUALITY_STATUS_LABELS,
  evaluateDataQuality,
} from '../../utils/data-quality'
import '../../styles/lessons/data-quality.css'

interface DataQualityWorkbenchProps {
  visualization: DataQualityVisualization
}

const EVIDENCE_KIND_LABELS = {
  'failed-sample': '失败样本',
  'metric-comparison': '指标对账',
  'scheduler-context': '调度上下文',
  'partition-freshness': '分区时效',
} satisfies Record<QualityEvidence['kind'], string>

function formatQualityValue(value: number, unit: QualityThreshold['unit']): string {
  switch (unit) {
    case 'currency':
      return `¥${value}`
    case 'minutes':
      return `${value} min`
    default:
      return `${value} 行`
  }
}

function formatThreshold(threshold: QualityThreshold): string {
  let operator = '='
  if (threshold.operator === 'at-most') {
    operator = '≤'
  } else if (threshold.operator === 'at-least') {
    operator = '≥'
  }
  return `${operator} ${formatQualityValue(threshold.value, threshold.unit)}`
}

function formatTarget(rule: QualityRuleDefinition): string {
  const field = rule.target.field ? ` · ${rule.target.field}` : ''
  return `${rule.target.table}${field} · ${rule.target.partition.column} = ${rule.target.partition.value}`
}

function formatSampleValue(value: string | number | null): string {
  return value === null ? 'NULL' : String(value)
}

function getGateStatus(checks: readonly QualityCheckResult[]): QualityCheckStatus {
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail'
  }
  if (checks.some((check) => check.status === 'warn')) {
    return 'warn'
  }
  return 'pass'
}

function getThresholdRange(rule: QualityRuleDefinition): { max: number; step: number } {
  if (rule.threshold.unit === 'minutes') {
    return { max: 60, step: 5 }
  }
  if (rule.threshold.unit === 'currency') {
    return { max: 100, step: 10 }
  }
  return { max: 3, step: 1 }
}

function getThresholdHint(threshold: QualityThreshold): string {
  if (threshold.operator === 'at-most' && threshold.warningRange !== undefined) {
    const warningLimit = threshold.value + threshold.warningRange
    return `pass ${formatThreshold(threshold)}；warn ≤ ${formatQualityValue(warningLimit, threshold.unit)}；再往上 fail。`
  }
  return `超过 ${formatThreshold(threshold)} 即视为 fail。`
}

function getReleaseTone(status: QualityReleaseDecision['status']): QualityCheckStatus {
  if (status === 'blocked' || status === 'quarantined') {
    return 'fail'
  }
  if (status === 'released') {
    return 'pass'
  }
  return 'warn'
}

function SchedulerStatus({ status }: { status: string }) {
  return <span className={`data-quality-status data-quality-status--${status}`}>{status}</span>
}

function QualityStatus({ status }: { status: QualityCheckStatus }) {
  return (
    <span className={`data-quality-status data-quality-status--${status}`}>
      {QUALITY_STATUS_LABELS[status]}
    </span>
  )
}

function QualityChain({ evaluation }: { evaluation: ReturnType<typeof evaluateDataQuality> }) {
  const gateStatus = getGateStatus(evaluation.checks)
  const evidenceCount = evaluation.events.reduce(
    (count, event) => count + event.evidence.flatMap((evidence) => evidence.samples).length,
    0,
  )
  const releaseTone = getReleaseTone(evaluation.releaseDecision.status)
  const steps = [
    {
      key: 'scheduler',
      label: 'Scheduler Run',
      value: evaluation.schedulerRun.status,
      detail: `${evaluation.schedulerRun.runId} · ${evaluation.schedulerRun.partition.column} = ${evaluation.schedulerRun.partition.value}`,
      tone: evaluation.schedulerRun.status === 'success' ? 'pass' : 'fail',
    },
    {
      key: 'check',
      label: 'Quality Check',
      value: QUALITY_STATUS_LABELS[gateStatus],
      detail: `${evaluation.releaseDecision.checkCounts.fail} fail · ${evaluation.releaseDecision.checkCounts.warn} warn · ${evaluation.releaseDecision.checkCounts.pass} pass`,
      tone: gateStatus,
    },
    {
      key: 'event',
      label: 'Quality Event',
      value: `${evaluation.events.length} events`,
      detail: evaluation.events.length > 0 ? '失败或告警规则已生成事件' : '没有非 pass 事件',
      tone: evaluation.events.length > 0 ? 'warn' : 'pass',
    },
    {
      key: 'evidence',
      label: 'Evidence',
      value: `${evidenceCount} samples`,
      detail: '规则、阈值、字段和分区保持可回放',
      tone: evidenceCount > 0 ? 'warn' : 'pass',
    },
    {
      key: 'release',
      label: 'Release Decision',
      value: QUALITY_RELEASE_STATUS_LABELS[evaluation.releaseDecision.status],
      detail: evaluation.releaseDecision.isBlocked
        ? '完整下游发布被阻断'
        : '下游按策略继续或正常发布',
      tone: releaseTone,
    },
  ] as const

  return (
    <ol className="data-quality-chain" aria-label="Scheduler Run 到 Release Decision 的质量链路">
      {steps.map((step, index) => (
        <li className={`data-quality-chain__step is-${step.tone}`} key={step.key}>
          <span className="data-quality-chain__index">0{index + 1}</span>
          <span className="data-quality-chain__label">{step.label}</span>
          <strong>{step.value}</strong>
          <small>{step.detail}</small>
          {index < steps.length - 1 && (
            <span className="data-quality-chain__arrow" aria-hidden="true">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

function InjectionControls({
  visualization,
  injection,
  onChange,
}: {
  visualization: DataQualityVisualization
  injection: DataQualityVisualization['defaultInjection']
  onChange: (injection: DataQualityVisualization['defaultInjection']) => void
}) {
  return (
    <section className="data-quality-injections" aria-labelledby="data-quality-injections-title">
      <div className="data-quality-section-heading">
        <div>
          <span className="data-quality-overline">01 · Fault injection</span>
          <h3 id="data-quality-injections-title">先注入一个现实问题</h3>
        </div>
        <p>每个选项都只改变本地确定性 fixture；Scheduler 事实仍来自第 06 章。</p>
      </div>
      <div className="data-quality-injection-grid" role="list" aria-label="质量故障注入器">
        {visualization.injections.map((option) => (
          <button
            className={`data-quality-injection${option.id === injection ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={option.id === injection}
            key={option.id}
            onClick={() => onChange(option.id)}
          >
            <span>
              {option.dimension ? QUALITY_DIMENSION_LABELS[option.dimension] : 'baseline'}
            </span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function ThresholdControls({
  rules,
  selectedRuleId,
  selectedCheck,
  onRuleChange,
  onThresholdChange,
}: {
  rules: readonly QualityRuleDefinition[]
  selectedRuleId: string
  selectedCheck: QualityCheckResult
  onRuleChange: (ruleId: string) => void
  onThresholdChange: (ruleId: string, value: number) => void
}) {
  const rule = rules.find((candidate) => candidate.ruleId === selectedRuleId) ?? rules[0]
  if (!rule) {
    return null
  }

  const range = getThresholdRange(rule)
  const max = Math.max(range.max, selectedCheck.threshold.value)

  return (
    <section className="data-quality-threshold" aria-labelledby="data-quality-threshold-title">
      <div className="data-quality-section-heading">
        <div>
          <span className="data-quality-overline">02 · Threshold</span>
          <h3 id="data-quality-threshold-title">阈值是规则的一部分，不是装饰</h3>
        </div>
        <p>放宽阈值会改变判定状态，但不会删除失败样本或隐藏事件。</p>
      </div>
      <label className="data-quality-threshold__select">
        <span>调整哪一条规则？</span>
        <select value={rule.ruleId} onChange={(event) => onRuleChange(event.target.value)}>
          {rules.map((candidate) => (
            <option value={candidate.ruleId} key={candidate.ruleId}>
              {candidate.name} · {candidate.ruleId}
            </option>
          ))}
        </select>
      </label>
      <label className="data-quality-threshold__range">
        <span>
          <strong>允许上限</strong>
          <output>{formatQualityValue(selectedCheck.threshold.value, rule.threshold.unit)}</output>
        </span>
        <input
          type="range"
          min="0"
          max={max}
          step={range.step}
          value={selectedCheck.threshold.value}
          aria-label={`调整 ${rule.name} 的质量阈值`}
          onChange={(event) => onThresholdChange(rule.ruleId, Number(event.target.value))}
        />
      </label>
      <p className="data-quality-threshold__hint">
        <code>{rule.ruleId}</code> · {getThresholdHint(selectedCheck.threshold)}
      </p>
    </section>
  )
}

function SchedulerHandoff({
  evaluation,
  activeCheck,
}: {
  evaluation: ReturnType<typeof evaluateDataQuality>
  activeCheck: QualityCheckResult
}) {
  const context = activeCheck.schedulerContext
  return (
    <section className="data-quality-scheduler" aria-labelledby="data-quality-scheduler-title">
      <div className="data-quality-section-heading">
        <div>
          <span className="data-quality-overline">Scheduler handoff · #06</span>
          <h3 id="data-quality-scheduler-title">先确认任务成功，再打开质量闸门</h3>
        </div>
        <p>当前检查跟随选中规则的产出任务；这里不复制 Scheduler 的状态机。</p>
      </div>
      <div className="data-quality-scheduler__headline" aria-live="polite">
        <div>
          <span>task status</span>
          <strong>
            <SchedulerStatus status={context.taskStatus} />
          </strong>
        </div>
        <div>
          <span>quality gate</span>
          <strong>
            <QualityStatus status={getGateStatus(evaluation.checks)} />
          </strong>
        </div>
        <p>success 只说明代码结束；质量检查还要回答数据是否可信。</p>
      </div>
      <dl className="data-quality-facts">
        <div>
          <dt>task identity</dt>
          <dd>
            <code>{context.taskId}</code>
          </dd>
        </div>
        <div>
          <dt>run identity</dt>
          <dd>
            <code>{context.runId}</code>
          </dd>
        </div>
        <div>
          <dt>business date / partition</dt>
          <dd>
            <code>
              {context.partition.column} = {context.partition.value}
            </code>
          </dd>
        </div>
        <div>
          <dt>output table</dt>
          <dd>
            <code>{context.outputTable}</code>
          </dd>
        </div>
        <div>
          <dt>run status</dt>
          <dd>
            <SchedulerStatus status={context.runStatus} />
          </dd>
        </div>
        <div>
          <dt>start → end</dt>
          <dd>
            {context.startedAt ?? '—'} → {context.endedAt ?? '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function EvidenceList({
  evidence,
  unit,
}: {
  evidence: readonly QualityEvidence[]
  unit: QualityThreshold['unit']
}) {
  return (
    <div className="data-quality-evidence-list">
      {evidence.map((item) => (
        <div className="data-quality-evidence" key={item.evidenceId}>
          <div className="data-quality-evidence__heading">
            <div>
              <span className="data-quality-overline">{EVIDENCE_KIND_LABELS[item.kind]}</span>
              <strong>{item.evidenceId}</strong>
            </div>
            <span>
              observed {formatQualityValue(item.observedValue, unit)} · expected{' '}
              {item.expectedLabel}
            </span>
          </div>
          <p>{item.detail}</p>
          {item.samples.length > 0 ? (
            <div className="data-quality-samples">
              <div className="data-quality-samples__heading">
                <strong>失败样本 / evidence</strong>
                <span>{item.samples.length} 条展示</span>
              </div>
              {item.samples.map((sample) => (
                <SampleCard sample={sample} key={sample.sampleId} />
              ))}
            </div>
          ) : (
            <p className="data-quality-evidence__empty">当前观察没有失败样本。</p>
          )}
        </div>
      ))}
    </div>
  )
}

function SampleCard({ sample }: { sample: QualitySample }) {
  return (
    <article className="data-quality-sample">
      <div className="data-quality-sample__heading">
        <code>{sample.sampleId}</code>
        <span>{sample.rowKey}</span>
      </div>
      <dl>
        {Object.entries(sample.values).map(([field, value]) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd>
              <code>{formatSampleValue(value)}</code>
            </dd>
          </div>
        ))}
      </dl>
      <p>{sample.reason}</p>
    </article>
  )
}

function QualityRuleCard({
  rule,
  check,
  selected,
  onSelect,
}: {
  rule: QualityRuleDefinition
  check: QualityCheckResult
  selected: boolean
  onSelect: () => void
}) {
  return (
    <article className={`data-quality-rule is-${check.status}${selected ? ' is-selected' : ''}`}>
      <button
        className="data-quality-rule__button"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="data-quality-rule__identity">
          <code>{rule.ruleId}</code>
          <QualityStatus status={check.status} />
        </span>
        <strong>{rule.name}</strong>
        <span className="data-quality-rule__meta">
          {QUALITY_DIMENSION_LABELS[rule.dimension]} · {QUALITY_RULE_TYPE_LABELS[rule.ruleType]} ·{' '}
          {QUALITY_SEVERITY_LABELS[rule.severity]}
        </span>
        <span className="data-quality-rule__target">{formatTarget(rule)}</span>
      </button>
      <div className="data-quality-rule__metrics">
        <div>
          <span>observed</span>
          <strong>{formatQualityValue(check.observedValue, check.threshold.unit)}</strong>
        </div>
        <div>
          <span>threshold</span>
          <strong>{formatThreshold(check.threshold)}</strong>
        </div>
        <div>
          <span>violations / scanned</span>
          <strong>
            {check.violationCount} / {check.evaluatedRowCount}
          </strong>
        </div>
      </div>
      <p className="data-quality-rule__description">{rule.description}</p>
      {check.status !== 'pass' || check.evidence.some((evidence) => evidence.samples.length > 0) ? (
        <>
          {check.status === 'pass' && (
            <p className="data-quality-rule__pass">
              当前阈值下 pass · 原始证据仍保留，放宽阈值不会隐藏异常样本。
            </p>
          )}
          <EvidenceList evidence={check.evidence} unit={check.threshold.unit} />
        </>
      ) : (
        <p className="data-quality-rule__pass">无失败样本 · 该规则在当前注入和阈值下 pass。</p>
      )}
    </article>
  )
}

function QualityCheckResults({
  rules,
  checks,
  selectedRuleId,
  onSelectRule,
}: {
  rules: readonly QualityRuleDefinition[]
  checks: readonly QualityCheckResult[]
  selectedRuleId: string
  onSelectRule: (ruleId: string) => void
}) {
  return (
    <section className="data-quality-rules" aria-labelledby="data-quality-rules-title">
      <div className="data-quality-section-heading">
        <div>
          <span className="data-quality-overline">03 · Quality checks</span>
          <h3 id="data-quality-rules-title">不要只看质量分数，逐条看规则证据</h3>
        </div>
        <p>每张结果卡都包含 rule identity、目标、阈值、严重级别和扫描规模。</p>
      </div>
      <div className="data-quality-rule-list">
        {rules.map((rule) => {
          const check = checks.find((candidate) => candidate.ruleId === rule.ruleId)
          if (!check) {
            return null
          }
          return (
            <QualityRuleCard
              rule={rule}
              check={check}
              selected={selectedRuleId === rule.ruleId}
              onSelect={() => onSelectRule(rule.ruleId)}
              key={rule.ruleId}
            />
          )
        })}
      </div>
    </section>
  )
}

function QualityEventLog({ events }: { events: readonly QualityEvent[] }) {
  return (
    <section className="data-quality-events" aria-labelledby="data-quality-events-title">
      <div className="data-quality-section-heading">
        <div>
          <span className="data-quality-overline">04 · Quality events</span>
          <h3 id="data-quality-events-title">失败结果要变成可调查的事件</h3>
        </div>
        <p>事件把证据、Scheduler run、下游影响和 remediation 绑定在一起。</p>
      </div>
      {events.length === 0 ? (
        <p className="data-quality-empty">当前没有非 pass 规则，因此没有新的 Quality Event。</p>
      ) : (
        <ol className="data-quality-event-list">
          {events.map((event) => (
            <li className={`data-quality-event is-${event.status}`} key={event.eventId}>
              <div className="data-quality-event__heading">
                <div>
                  <code>{event.eventId}</code>
                  <strong>{event.ruleId}</strong>
                </div>
                <QualityStatus status={event.status} />
              </div>
              <p className="data-quality-event__target">
                {event.target.table} · {event.target.field ?? 'table-level'} ·{' '}
                {event.target.partition.column} = {event.target.partition.value} ·{' '}
                {QUALITY_SEVERITY_LABELS[event.severity]}
              </p>
              <dl className="data-quality-event__facts">
                <div>
                  <dt>scheduler task / run</dt>
                  <dd>
                    <code>
                      {event.schedulerContext.taskId} / {event.schedulerContext.runId}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>evidence</dt>
                  <dd>
                    {event.evidence.map((item) => item.evidenceId).join(' · ')} ·{' '}
                    {event.evidence.flatMap((item) => item.samples).length} samples
                  </dd>
                </div>
                <div>
                  <dt>downstream release</dt>
                  <dd>{QUALITY_RELEASE_STATUS_LABELS[event.releaseImpact.downstreamRelease]}</dd>
                </div>
              </dl>
              <p className="data-quality-event__impact">{event.releaseImpact.explanation}</p>
              <div className="data-quality-event__investigation">
                <div>
                  <span>investigation context · upstream</span>
                  <ul>
                    {event.investigationContext.upstreamHints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span>downstream impact</span>
                  <ul>
                    {event.investigationContext.downstreamImpacts.map((impact) => (
                      <li key={impact}>{impact}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="data-quality-event__remediation">
                <span>remediation · {event.remediation.label}</span>
                <p>{event.remediation.steps.join(' ')}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function RemediationList({ remediations }: { remediations: readonly QualityRemediation[] }) {
  if (remediations.length === 0) {
    return <p className="data-quality-empty">没有遗留质量事件，不需要 remediation。</p>
  }

  return (
    <ul className="data-quality-remediation-list">
      {remediations.map((remediation, index) => (
        <li key={`${remediation.rerunTaskId}-${index}`}>
          <strong>{remediation.label}</strong>
          <span>{remediation.steps.join(' ')}</span>
        </li>
      ))}
    </ul>
  )
}

function ReleaseDecisionPanel({
  decision,
  onActionChange,
}: {
  decision: QualityReleaseDecision
  onActionChange: (action: QualityAction) => void
}) {
  return (
    <section className="data-quality-release" aria-labelledby="data-quality-release-title">
      <div className="data-quality-section-heading">
        <div>
          <span className="data-quality-overline">05 · Release decision</span>
          <h3 id="data-quality-release-title">同一份证据，选择处置后会发生什么？</h3>
        </div>
        <p>策略不改写 check；它只决定非 pass 结果如何影响下游发布。</p>
      </div>
      <fieldset className="data-quality-actions">
        <legend>选择处置动作</legend>
        <div className="data-quality-action-grid">
          {QUALITY_ACTION_OPTIONS.map((option) => (
            <button
              className={`data-quality-action${option.value === decision.action ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={option.value === decision.action}
              key={option.value}
              onClick={() => onActionChange(option.value)}
            >
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      </fieldset>
      <div
        className={`data-quality-decision data-quality-decision--${decision.status}`}
        aria-live="polite"
      >
        <div className="data-quality-decision__headline">
          <div>
            <span className="data-quality-overline">decision.{decision.action}</span>
            <strong>{QUALITY_RELEASE_STATUS_LABELS[decision.status]}</strong>
          </div>
          <span>{decision.decisionId}</span>
        </div>
        <p className="data-quality-decision__rationale">{decision.rationale}</p>
        <dl className="data-quality-decision__facts">
          <div>
            <dt>完整下游发布</dt>
            <dd>{decision.isBlocked ? 'blocked · 是' : 'released · 否'}</dd>
          </div>
          <div>
            <dt>规则结果</dt>
            <dd>
              {decision.checkCounts.fail} fail · {decision.checkCounts.warn} warn ·{' '}
              {decision.checkCounts.pass} pass
            </dd>
          </div>
          <div>
            <dt>affected outputs</dt>
            <dd>{decision.affectedOutputs.join(' · ') || '无'}</dd>
          </div>
          <div>
            <dt>quarantine samples</dt>
            <dd>{decision.quarantinedSampleCount}</dd>
          </div>
        </dl>
        <div className="data-quality-decision__lists">
          <div>
            <h4>失败 / 告警规则</h4>
            <ul>
              {[...decision.failedRuleIds, ...decision.warningRuleIds].map((ruleId) => (
                <li key={ruleId}>
                  <code>{ruleId}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Remediation</h4>
            <RemediationList remediations={decision.remediation} />
          </div>
        </div>
      </div>
    </section>
  )
}

export function DataQualityWorkbench({ visualization }: DataQualityWorkbenchProps) {
  const firstRuleId = visualization.rules[0]?.ruleId ?? ''
  const [injection, setInjection] = useState(visualization.defaultInjection)
  const [action, setAction] = useState<QualityAction>('block')
  const [selectedRuleId, setSelectedRuleId] = useState(firstRuleId)
  const [thresholdOverrides, setThresholdOverrides] = useState<Record<string, number>>({})
  const evaluation = useMemo(
    () =>
      evaluateDataQuality(visualization, {
        injection,
        action,
        thresholdOverrides,
      }),
    [action, injection, thresholdOverrides, visualization],
  )
  const activeCheck =
    evaluation.checks.find((check) => check.ruleId === selectedRuleId) ?? evaluation.checks[0]

  if (!activeCheck) {
    return null
  }

  function selectInjection(nextInjection: typeof injection) {
    setInjection(nextInjection)
    const option = visualization.injections.find((candidate) => candidate.id === nextInjection)
    setSelectedRuleId(option?.ruleId ?? firstRuleId)
  }

  function changeThreshold(ruleId: string, value: number) {
    setThresholdOverrides((current) => ({ ...current, [ruleId]: value }))
  }

  function resetWorkbench() {
    setInjection(visualization.defaultInjection)
    setAction('block')
    setSelectedRuleId(firstRuleId)
    setThresholdOverrides({})
  }

  return (
    <div className="data-quality-workbench">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">
            Quality Gate · Scheduler Run → Evidence → Release
          </span>
          <p aria-live="polite">
            当前注入：{visualization.injections.find((option) => option.id === injection)?.label} ·{' '}
            {evaluation.events.length} 个 Quality Event · {evaluation.releaseDecision.status}
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetWorkbench}
        >
          重置质量实验
        </button>
      </div>

      <QualityChain evaluation={evaluation} />
      <SchedulerHandoff evaluation={evaluation} activeCheck={activeCheck} />
      <div className="data-quality-controls">
        <InjectionControls
          visualization={visualization}
          injection={injection}
          onChange={selectInjection}
        />
        <ThresholdControls
          rules={visualization.rules}
          selectedRuleId={selectedRuleId}
          selectedCheck={activeCheck}
          onRuleChange={setSelectedRuleId}
          onThresholdChange={changeThreshold}
        />
      </div>
      <QualityCheckResults
        rules={visualization.rules}
        checks={evaluation.checks}
        selectedRuleId={selectedRuleId}
        onSelectRule={setSelectedRuleId}
      />
      <QualityEventLog events={evaluation.events} />
      <ReleaseDecisionPanel decision={evaluation.releaseDecision} onActionChange={setAction} />
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        本实验消费第 05 章的确定性加工快照和第 06 章的 Scheduler domain；不接入 Great
        Expectations、Soda、数据库、告警渠道或通用 Fault Injection Framework。
      </p>
    </div>
  )
}
