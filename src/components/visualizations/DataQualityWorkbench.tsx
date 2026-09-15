import { useMemo, useState } from 'react'
import type {
  DataQualityVisualization,
  QualityCheckResult,
  QualityCheckStatus,
  QualityEvent,
  QualityEvidence,
  QualityReleaseDecision,
  QualityRuleDefinition,
  QualityBalanceRow,
  QualitySample,
  QualityScalar,
  QualityScenario,
  QualityScenarioOption,
  QualityThreshold,
} from '../../features/data-quality/types'
import {
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
  row: '行级证据',
  set: '应到集合',
  date: '日期证据',
  aggregate: '聚合证据',
  scheduler: 'Scheduler 上下文',
} as const

function formatScalar(value: QualityScalar): string {
  if (value === null) {
    return 'NULL'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value)
}

function formatCurrency(value: number): string {
  return `¥${new Intl.NumberFormat('zh-CN').format(value)}`
}

function formatThreshold(threshold: QualityThreshold): string {
  const operator =
    threshold.operator === 'at-most' ? '≤' : threshold.operator === 'at-least' ? '≥' : '='
  const value =
    threshold.unit === 'currency'
      ? formatCurrency(threshold.value)
      : threshold.unit === 'days'
        ? `${threshold.value} 天`
        : threshold.unit === 'accounts'
          ? `${threshold.value} 个账户`
          : `${threshold.value} 行`
  return `${operator} ${value}`
}

function StatusBadge({ status }: { status: QualityCheckStatus | string }) {
  const label =
    status in QUALITY_STATUS_LABELS
      ? QUALITY_STATUS_LABELS[status as QualityCheckStatus]
      : status.toUpperCase()
  return <span className={`data-quality-status data-quality-status--${status}`}>{label}</span>
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

function getVisibleChecks(
  visualization: DataQualityVisualization,
  checks: readonly QualityCheckResult[],
): QualityCheckResult[] {
  return checks.filter((check) => visualization.visibleRuleIds.includes(check.ruleId))
}

function getRule(
  visualization: DataQualityVisualization,
  ruleId: string | undefined,
): QualityRuleDefinition | undefined {
  return visualization.rules.find((rule) => rule.ruleId === ruleId)
}

function getCheck(
  checks: readonly QualityCheckResult[],
  ruleId: string | undefined,
): QualityCheckResult | undefined {
  return checks.find((check) => check.ruleId === ruleId)
}

function ScenarioTabs({
  options,
  selected,
  onChange,
  label,
}: {
  options: readonly QualityScenarioOption[]
  selected: QualityScenario
  onChange: (scenario: QualityScenario) => void
  label: string
}) {
  return (
    <div className="data-quality-scenarios" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          className={`data-quality-scenario${option.id === selected ? ' is-selected' : ''}`}
          type="button"
          aria-pressed={option.id === selected}
          onClick={() => onChange(option.id)}
          key={option.id}
        >
          <span>{option.label}</span>
          <small>{option.description}</small>
        </button>
      ))}
    </div>
  )
}

function EvidenceBlock({ evidence }: { evidence: QualityEvidence }) {
  return (
    <article className="data-quality-evidence">
      <div className="data-quality-evidence__heading">
        <div>
          <span className="data-quality-overline">{EVIDENCE_KIND_LABELS[evidence.kind]}</span>
          <strong>{evidence.evidenceId}</strong>
        </div>
        <span>
          expected <code>{formatScalar(evidence.expected)}</code> · observed{' '}
          <code>{formatScalar(evidence.observed)}</code>
        </span>
      </div>
      <p>{evidence.detail}</p>
      {evidence.failedRows !== undefined && (
        <p className="data-quality-evidence__count">failed_rows = {evidence.failedRows}</p>
      )}
      {evidence.sample ? (
        <SampleCard sample={evidence.sample} />
      ) : (
        <p className="data-quality-evidence__empty">这是聚合或日期证据，没有需要伪造的 sample。</p>
      )}
    </article>
  )
}

function SampleCard({ sample }: { sample: QualitySample }) {
  return (
    <div className="data-quality-sample">
      <div className="data-quality-sample__heading">
        <code>{sample.sampleId}</code>
        <span>{sample.rowKey}</span>
      </div>
      <dl>
        {Object.entries(sample.values).map(([field, value]) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd>
              <code>{formatScalar(value)}</code>
            </dd>
          </div>
        ))}
      </dl>
      <p>{sample.reason}</p>
    </div>
  )
}

function RuleResult({
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
    <button
      className={`data-quality-rule${selected ? ' is-selected' : ''} is-${check.status}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="data-quality-rule__topline">
        <code>{rule.ruleId}</code>
        <StatusBadge status={check.status} />
      </span>
      <strong>{rule.name}</strong>
      <span className="data-quality-rule__meta">
        {QUALITY_DIMENSION_LABELS[rule.dimension]} · {QUALITY_RULE_TYPE_LABELS[rule.ruleType]}
        {rule.severity ? ` · ${QUALITY_SEVERITY_LABELS[rule.severity]}` : ''}
      </span>
      <span className="data-quality-rule__target">
        {rule.target.table} · {rule.target.field ?? 'table-level'} · {rule.target.partition.column}{' '}
        = {rule.target.partition.value}
      </span>
      <span className="data-quality-rule__values">
        <span>
          <small>expected</small>
          <b>{formatScalar(check.expected)}</b>
        </span>
        <span>
          <small>observed</small>
          <b>{formatScalar(check.observed)}</b>
        </span>
      </span>
    </button>
  )
}

function FocusedEvidence({
  rule,
  check,
  thresholdOverride,
  onThresholdChange,
}: {
  rule: QualityRuleDefinition | undefined
  check: QualityCheckResult | undefined
  thresholdOverride: number | undefined
  onThresholdChange: (ruleId: string, value: number) => void
}) {
  if (!rule || !check) {
    return null
  }

  return (
    <section className="data-quality-focus" aria-label="当前规则证据">
      <div className="data-quality-focus__heading">
        <div>
          <span className="data-quality-overline">当前规则</span>
          <h4>{rule.teachingQuestion}</h4>
        </div>
        <StatusBadge status={check.status} />
      </div>
      <p>{rule.description}</p>
      <dl className="data-quality-facts data-quality-facts--compact">
        <div>
          <dt>expected</dt>
          <dd>{formatScalar(check.expected)}</dd>
        </div>
        <div>
          <dt>observed</dt>
          <dd>{formatScalar(check.observed)}</dd>
        </div>
        <div>
          <dt>threshold</dt>
          <dd>{formatThreshold(check.threshold)}</dd>
        </div>
        <div>
          <dt>failed_rows</dt>
          <dd>{check.failedRows ?? 0}</dd>
        </div>
      </dl>
      <div className="data-quality-evidence-list">
        {check.evidence.map((evidence) => (
          <EvidenceBlock evidence={evidence} key={evidence.evidenceId} />
        ))}
      </div>
      <div className="data-quality-threshold-note">
        <strong>阈值说明</strong>
        {rule.strict || rule.releaseScope === 'banking' ? (
          <p>
            这是关键数据规则，阈值基线为 {formatThreshold(rule.threshold)}；
            不能通过放宽规则把重复、非法值或关键结果差异变成正确。
          </p>
        ) : (
          <label>
            允许多少异常？
            <input
              type="number"
              min="0"
              value={thresholdOverride ?? check.threshold.value}
              onChange={(event) => onThresholdChange(rule.ruleId, Number(event.target.value))}
            />
            <span>修改的是质量规则，不是数据本身。</span>
          </label>
        )}
      </div>
    </section>
  )
}

function SnapshotTable({
  rows,
  sample,
}: {
  rows: readonly QualityBalanceRow[]
  sample: QualitySample | undefined
}) {
  const sampleAccountId = sample?.values.account_id
  return (
    <div className="data-quality-table-wrap">
      <table className="data-quality-table">
        <caption>AccountBalanceSnapshot 的教学样本</caption>
        <thead>
          <tr>
            <th>account_id</th>
            <th>snapshot_date</th>
            <th>balance</th>
            <th>currency</th>
            <th>branch_id</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, index) => (
            <tr
              className={row.accountId === sampleAccountId ? 'is-evidence' : ''}
              key={`${row.accountId}-${row.snapshotDate}-${index}`}
            >
              <td>{row.accountId || 'NULL'}</td>
              <td>{row.snapshotDate || 'NULL'}</td>
              <td>{row.balance === null ? 'NULL' : formatCurrency(row.balance)}</td>
              <td>{row.currency}</td>
              <td>{row.branch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusFlow({
  visualization,
  evaluation,
  onReset,
}: {
  visualization: DataQualityVisualization
  evaluation: ReturnType<typeof evaluateDataQuality>
  onReset: () => void
}) {
  const [showEvidence, setShowEvidence] = useState(false)
  const visibleChecks = getVisibleChecks(visualization, evaluation.checks)
  const qualityStatus = getGateStatus(visibleChecks)
  const qualityEvent = evaluation.events[0]
  const steps = [
    {
      label: 'Run Status',
      value: evaluation.schedulerRun.status.toUpperCase(),
      detail: `run ${evaluation.schedulerRun.runId}`,
      tone: evaluation.schedulerRun.status === 'success' ? 'pass' : 'fail',
    },
    {
      label: 'Quality Status',
      value: QUALITY_STATUS_LABELS[qualityStatus],
      detail: `${evaluation.events.length} 个质量事件`,
      tone: qualityStatus,
    },
    {
      label: 'Release Status',
      value: QUALITY_RELEASE_STATUS_LABELS[evaluation.releaseDecision.status],
      detail: evaluation.releaseDecision.isBlocked ? '银行关键结果暂不发布' : '可以继续处理',
      tone: evaluation.releaseDecision.isBlocked ? 'fail' : 'pass',
    },
  ] as const

  return (
    <div className="data-quality-view data-quality-view--status">
      <div className="data-quality-view__toolbar">
        <div>
          <span className="data-quality-overline">RUN → QUALITY → RELEASE</span>
          <p>business_date = {visualization.targetDate} · SLA MET</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={onReset}>
          重置检查
        </button>
      </div>
      <ol className="data-quality-status-flow" aria-label="运行、质量与发布状态">
        {steps.map((step, index) => (
          <li className={`is-${step.tone}`} key={step.label}>
            <span>{step.label}</span>
            <strong>{step.value}</strong>
            <small>{step.detail}</small>
            {index < steps.length - 1 && <b aria-hidden="true">→</b>}
          </li>
        ))}
      </ol>
      <div className="data-quality-status-summary">
        <div>
          <span>Scheduler</span>
          <strong>SUCCESS</strong>
          <small>07:20 完成 · SLA MET</small>
        </div>
        <div>
          <span>Quality</span>
          <strong className="is-fail">FAILED</strong>
          <small>同口径 DWD / DWS 对账不一致</small>
        </div>
        <div>
          <span>Release</span>
          <strong className="is-fail">BLOCKED</strong>
          <small>需要修复证据指向的数据后再发布</small>
        </div>
      </div>
      <button
        className="data-quality-text-button"
        type="button"
        aria-expanded={showEvidence}
        onClick={() => setShowEvidence((current) => !current)}
      >
        {showEvidence ? '收起质量证据' : '查看为什么 Quality FAILED'}
      </button>
      {showEvidence && qualityEvent && <EventEvidence event={qualityEvent} />}
    </div>
  )
}

function RuleReasoningLab({
  visualization,
  evaluation,
  selectedRuleId,
  onSelectRule,
  onScenarioChange,
  onThresholdChange,
  thresholdOverrides,
}: {
  visualization: DataQualityVisualization
  evaluation: ReturnType<typeof evaluateDataQuality>
  selectedRuleId: string
  onSelectRule: (ruleId: string) => void
  onScenarioChange: (scenario: QualityScenario) => void
  onThresholdChange: (ruleId: string, value: number) => void
  thresholdOverrides: Readonly<Record<string, number>>
}) {
  const visibleChecks = getVisibleChecks(visualization, evaluation.checks)
  const activeRule = getRule(visualization, selectedRuleId)
  const activeCheck = getCheck(evaluation.checks, selectedRuleId)
  const activeEvidence = activeCheck?.evidence.find((evidence) => evidence.sample)

  return (
    <div className="data-quality-view data-quality-view--rules">
      <div className="data-quality-view__intro">
        <span className="data-quality-overline">GRAIN → RULE → EVIDENCE</span>
        <h3>一行代表 Account × snapshot_date</h3>
        <p>从记录身份出发，依次看关键字段、字段语义和对象关系。</p>
      </div>
      <div className="data-quality-grain-callout">
        <span>核心 Grain</span>
        <strong>Account × snapshot_date</strong>
        <small>同一身份重复数 = 0；这是关键记录身份的严格规则。</small>
      </div>
      <ScenarioTabs
        options={visualization.scenarios}
        selected={evaluation.scenario}
        onChange={onScenarioChange}
        label="记录级质量故障"
      />
      <SnapshotTable rows={evaluation.rows} sample={activeEvidence?.sample} />
      <div className="data-quality-rule-grid">
        {visualization.visibleRuleIds.map((ruleId) => {
          const rule = getRule(visualization, ruleId)
          const check = getCheck(visibleChecks, ruleId)
          if (!rule || !check) {
            return null
          }
          return (
            <RuleResult
              rule={rule}
              check={check}
              selected={selectedRuleId === ruleId}
              onSelect={() => onSelectRule(ruleId)}
              key={ruleId}
            />
          )
        })}
      </div>
      <FocusedEvidence
        rule={activeRule}
        check={activeCheck}
        thresholdOverride={activeRule ? thresholdOverrides[activeRule.ruleId] : undefined}
        onThresholdChange={onThresholdChange}
      />
    </div>
  )
}

function DatasetQualityLab({
  visualization,
  evaluation,
  onScenarioChange,
  onReset,
  thresholdOverrides,
  onThresholdChange,
}: {
  visualization: DataQualityVisualization
  evaluation: ReturnType<typeof evaluateDataQuality>
  onScenarioChange: (scenario: QualityScenario) => void
  onReset: () => void
  thresholdOverrides: Readonly<Record<string, number>>
  onThresholdChange: (ruleId: string, value: number) => void
}) {
  const option = visualization.scenarios.find((candidate) => candidate.id === evaluation.scenario)
  const check = getCheck(evaluation.checks, option?.ruleId)
  const evidence = check?.evidence[0]
  const model = visualization.model

  return (
    <div className="data-quality-view data-quality-view--dataset">
      <div className="data-quality-view__toolbar">
        <div>
          <span className="data-quality-overline">ROW → BATCH → PIPELINE</span>
          <p>收到的行都合法，不代表应到的集合和加工链都正确。</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={onReset}>
          重置场景
        </button>
      </div>
      <ScenarioTabs
        options={visualization.scenarios}
        selected={evaluation.scenario}
        onChange={onScenarioChange}
        label="整批质量场景"
      />
      {evaluation.scenario === 'batch-incomplete' && (
        <div className="data-quality-comparison data-quality-comparison--batch">
          <div>
            <span>应到集合</span>
            <strong>{model.expectedActiveAccountCount.toLocaleString('zh-CN')}</strong>
            <small>2026-09-30 有效 Account</small>
          </div>
          <b aria-hidden="true">−</b>
          <div>
            <span>实际快照</span>
            <strong>{model.incompleteSnapshotAccountCount.toLocaleString('zh-CN')}</strong>
            <small>AccountBalanceSnapshot</small>
          </div>
          <b aria-hidden="true">=</b>
          <div className="is-fail">
            <span>缺口</span>
            <strong>
              {(
                model.expectedActiveAccountCount - model.incompleteSnapshotAccountCount
              ).toLocaleString('zh-CN')}
            </strong>
            <small>即使现有 7000 行都合法</small>
          </div>
        </div>
      )}
      {evaluation.scenario === 'stale-snapshot' && (
        <div className="data-quality-comparison data-quality-comparison--date">
          <div>
            <span>Scheduler</span>
            <strong>SUCCESS</strong>
            <small>SLA MET · 07:20</small>
          </div>
          <b aria-hidden="true">但</b>
          <div>
            <span>business_date</span>
            <strong>{model.targetDate}</strong>
            <small>期望业务日期</small>
          </div>
          <b aria-hidden="true">≠</b>
          <div className="is-fail">
            <span>MAX(snapshot_date)</span>
            <strong>2026-09-29</strong>
            <small>数据内容还停在昨天</small>
          </div>
        </div>
      )}
      {evaluation.scenario === 'balance-reconciliation-drift' && (
        <div className="data-quality-reconciliation">
          <div className="data-quality-scope-line">
            <span>同一对账口径</span>
            <strong>
              {model.reconciliation.businessDate} · {model.reconciliation.branch} ·{' '}
              {model.reconciliation.customerScope} · {model.reconciliation.product} ·{' '}
              {model.reconciliation.currency}
            </strong>
          </div>
          <div className="data-quality-reconciliation__values">
            <div>
              <span>DWD 重聚合</span>
              <strong>{formatCurrency(model.reconciliation.expectedDwdBalance)}</strong>
            </div>
            <b aria-hidden="true">→</b>
            <div className="is-fail">
              <span>DWS 主题</span>
              <strong>{formatCurrency(model.reconciliation.observedDwsBalance)}</strong>
            </div>
            <div className="data-quality-reconciliation__delta">
              <span>delta</span>
              <strong>{formatCurrency(-200_000_000)}</strong>
            </div>
          </div>
        </div>
      )}
      {check && evidence && (
        <FocusedEvidence
          rule={getRule(visualization, option?.ruleId)}
          check={check}
          thresholdOverride={option?.ruleId ? thresholdOverrides[option.ruleId] : undefined}
          onThresholdChange={onThresholdChange}
        />
      )}
    </div>
  )
}

function EventEvidence({ event }: { event: QualityEvent }) {
  return (
    <article className="data-quality-event" aria-label="Quality Event 质量事实">
      <div className="data-quality-event__heading">
        <div>
          <span className="data-quality-overline">QUALITY EVENT · 质量事实</span>
          <strong>{event.ruleId}</strong>
        </div>
        <StatusBadge status={event.status} />
      </div>
      <dl className="data-quality-event__facts">
        <div>
          <dt>event_id</dt>
          <dd>{event.eventId}</dd>
        </div>
        <div>
          <dt>business_date</dt>
          <dd>{event.businessDate}</dd>
        </div>
        <div>
          <dt>table / partition</dt>
          <dd>
            {event.target.table} · {event.partition.column} = {event.partition.value}
          </dd>
        </div>
        <div>
          <dt>field</dt>
          <dd>{event.field ?? 'table-level'}</dd>
        </div>
        <div>
          <dt>expected</dt>
          <dd>{formatScalar(event.expected)}</dd>
        </div>
        <div>
          <dt>observed</dt>
          <dd>{formatScalar(event.observed)}</dd>
        </div>
        <div>
          <dt>failed_rows</dt>
          <dd>{event.failedRows ?? '不适用'}</dd>
        </div>
        <div>
          <dt>scheduler context</dt>
          <dd>
            {event.schedulerContext.taskId} · {event.schedulerContext.taskStatus} ·{' '}
            {event.schedulerContext.runId}
          </dd>
        </div>
      </dl>
      <div className="data-quality-event__evidence">
        {event.evidence.map((evidence) => (
          <EvidenceBlock evidence={evidence} key={evidence.evidenceId} />
        ))}
      </div>
      <p className="data-quality-event__boundary">
        这里保存质量事实；根因候选和下游影响由后续血缘调查根据任务、表和字段映射推导。
      </p>
    </article>
  )
}

function EvidencePanel({
  visualization,
  evaluation,
  onScenarioChange,
  onReset,
}: {
  visualization: DataQualityVisualization
  evaluation: ReturnType<typeof evaluateDataQuality>
  onScenarioChange: (scenario: QualityScenario) => void
  onReset: () => void
}) {
  const option = visualization.scenarios.find((candidate) => candidate.id === evaluation.scenario)
  const event = evaluation.events.find((candidate) => candidate.ruleId === option?.ruleId)
  return (
    <div className="data-quality-view data-quality-view--evidence">
      <div className="data-quality-view__toolbar">
        <div>
          <span className="data-quality-overline">QUALITY EVENT · FACTS ONLY</span>
          <p>每个失败事件都必须能回到可检查证据。</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={onReset}>
          重置证据
        </button>
      </div>
      <ScenarioTabs
        options={visualization.scenarios}
        selected={evaluation.scenario}
        onChange={onScenarioChange}
        label="质量证据类型"
      />
      {event ? (
        <EventEvidence event={event} />
      ) : (
        <p className="data-quality-empty">当前场景没有非 pass 事件。</p>
      )}
    </div>
  )
}

function ReleaseDecisionLab({
  visualization,
  evaluation,
  onScenarioChange,
  onReset,
}: {
  visualization: DataQualityVisualization
  evaluation: ReturnType<typeof evaluateDataQuality>
  onScenarioChange: (scenario: QualityScenario) => void
  onReset: () => void
}) {
  const isBanking = evaluation.scenario === 'bank-critical-branch-failure'
  const option = visualization.scenarios.find((candidate) => candidate.id === evaluation.scenario)
  const event = evaluation.events.find((candidate) => candidate.ruleId === option?.ruleId)
  const decision: QualityReleaseDecision = evaluation.releaseDecision

  return (
    <div className="data-quality-view data-quality-view--release">
      <div className="data-quality-view__toolbar">
        <div>
          <span className="data-quality-overline">QUALITY FACT → RELEASE DECISION</span>
          <p>严重程度描述问题；发布动作结合数据用途和业务影响判断。</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={onReset}>
          重置发布判断
        </button>
      </div>
      <ScenarioTabs
        options={visualization.scenarios}
        selected={evaluation.scenario}
        onChange={onScenarioChange}
        label="发布对照案例"
      />
      <div className={`data-quality-release-decision is-${decision.status}`} aria-live="polite">
        <div>
          <span>{isBanking ? '银行关键数据' : '非关键行为埋点'}</span>
          <strong>{QUALITY_RELEASE_STATUS_LABELS[decision.status]}</strong>
        </div>
        <p>{decision.rationale}</p>
        <dl>
          <div>
            <dt>Quality</dt>
            <dd>{decision.checkCounts.fail > 0 ? 'FAILED' : 'PASS'}</dd>
          </div>
          <div>
            <dt>affected output</dt>
            <dd>{decision.affectedOutputs.join(' · ') || '无'}</dd>
          </div>
          <div>
            <dt>failed rows</dt>
            <dd>{event?.failedRows ?? 0}</dd>
          </div>
          <div>
            <dt>下一步</dt>
            <dd>{decision.nextStep}</dd>
          </div>
        </dl>
      </div>
      {isBanking ? (
        <div className="data-quality-release-rule data-quality-release-rule--block">
          <strong>存款余额：默认 BLOCK</strong>
          <p>
            3 条 branch_id 异常中有一条余额为 {formatCurrency(230_000_000)}
            。异常行少，不代表业务影响小；不能删掉它们后继续发布已知不可信的余额结果。
          </p>
        </div>
      ) : (
        <div className="data-quality-release-rule data-quality-release-rule--quarantine">
          <strong>行为埋点：只有三个条件同时满足才 quarantine</strong>
          <ul>
            <li>异常记录彼此独立。</li>
            <li>移除后不改变剩余记录的业务语义。</li>
            <li>业务允许少量格式损失，并保留告警。</li>
          </ul>
        </div>
      )}
      {event && <EventEvidence event={event} />}
    </div>
  )
}

export function DataQualityWorkbench({ visualization }: DataQualityWorkbenchProps) {
  const firstRuleId = visualization.visibleRuleIds[0] ?? visualization.rules[0]?.ruleId ?? ''
  const [scenario, setScenario] = useState<QualityScenario>(visualization.defaultScenario)
  const [selectedRuleId, setSelectedRuleId] = useState(firstRuleId)
  const [thresholdOverrides, setThresholdOverrides] = useState<Record<string, number>>({})
  const evaluation = useMemo(
    () => evaluateDataQuality(visualization, { scenario, thresholdOverrides }),
    [scenario, thresholdOverrides, visualization],
  )

  function selectScenario(nextScenario: QualityScenario) {
    setScenario(nextScenario)
    const option = visualization.scenarios.find((candidate) => candidate.id === nextScenario)
    if (option?.ruleId) {
      setSelectedRuleId(option.ruleId)
    }
  }

  function changeThreshold(ruleId: string, value: number) {
    setThresholdOverrides((current) => ({ ...current, [ruleId]: Math.max(0, value) }))
  }

  function resetWorkbench() {
    setScenario(visualization.defaultScenario)
    setSelectedRuleId(firstRuleId)
    setThresholdOverrides({})
  }

  const sharedProps = {
    visualization,
    evaluation,
    onScenarioChange: selectScenario,
    onReset: resetWorkbench,
  }

  return (
    <div className="data-quality-workbench">
      {visualization.lessonMode === 'status' && (
        <StatusFlow
          visualization={visualization}
          evaluation={evaluation}
          onReset={resetWorkbench}
        />
      )}
      {visualization.lessonMode === 'rules' && (
        <RuleReasoningLab
          {...sharedProps}
          selectedRuleId={selectedRuleId}
          onSelectRule={setSelectedRuleId}
          onThresholdChange={changeThreshold}
          thresholdOverrides={thresholdOverrides}
        />
      )}
      {visualization.lessonMode === 'dataset' && (
        <DatasetQualityLab
          {...sharedProps}
          thresholdOverrides={thresholdOverrides}
          onThresholdChange={changeThreshold}
        />
      )}
      {visualization.lessonMode === 'evidence' && <EvidencePanel {...sharedProps} />}
      {visualization.lessonMode === 'release' && <ReleaseDecisionLab {...sharedProps} />}
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        本实验使用确定性的存款余额教学数据；重置后仍会得到同一组行、证据和发布判断。
      </p>
    </div>
  )
}
