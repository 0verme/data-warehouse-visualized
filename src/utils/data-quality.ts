import type {
  DataQualityVisualization,
  QualityAction,
  QualityCheckResult,
  QualityCheckStatus,
  QualityDimension,
  QualityEvidence,
  QualityEvidenceKind,
  QualityEvaluation,
  QualityEvaluationOptions,
  QualityEvent,
  QualityInjection,
  QualityInjectionOption,
  QualityReleaseDecision,
  QualityRemediation,
  QualityRuleDefinition,
  QualitySample,
  QualitySchedulerContext,
  QualitySeverity,
  QualityThreshold,
} from '../features/data-quality/types'
import type {
  SchedulerRunState,
  SchedulerScenario,
  SchedulerTaskDefinition,
} from '../features/scheduler/types'
import type {
  TransformationRow,
  TransformationTableSnapshot,
} from '../features/sql-transformation/types'
import { DEPOSIT_BALANCE_SCOPE, depositBalanceDataset } from '../data/deposit-balance'
import {
  SCHEDULER_DEFAULT_SCHEDULED_AT,
  SCHEDULER_TASK_IDS,
  buildSchedulerTimeline,
  createInitialSchedulerRun,
  getSchedulerMinutesBetween,
} from './scheduler'
import { appendLateBalanceSnapshot, getLayerSnapshots } from './sql-transformation'

export const QUALITY_RULE_IDS = {
  completeness: 'dq.dwd.deposit-balance.completeness.v1',
  uniqueness: 'dq.dwd.deposit-balance.unique-key.v1',
  validity: 'dq.dwd.deposit-balance.currency.v1',
  referentialIntegrity: 'dq.dwd.deposit-balance.account-reference.v1',
  reconciliation: 'dq.dws.deposit-balance.reconciliation.v1',
  freshness: 'dq.ads.deposit-balance.partition-freshness.v1',
} as const

export const QUALITY_DIMENSION_LABELS = {
  completeness: '完整性',
  uniqueness: '唯一性 / 重复',
  validity: '有效性',
  'referential-integrity': '引用完整性',
  reconciliation: '跨表对账',
  freshness: '及时性 / Freshness',
} satisfies Record<QualityDimension, string>

export const QUALITY_RULE_TYPE_LABELS = {
  'row-count': 'row count',
  'not-null': 'not null',
  'unique-key': 'unique key',
  enum: 'enum',
  range: 'range',
  'foreign-key': 'foreign key',
  'aggregate-match': 'aggregate match',
  'max-delay': 'max delay',
} satisfies Record<QualityRuleDefinition['ruleType'], string>

export const QUALITY_SEVERITY_LABELS = {
  critical: 'critical · 严重',
  high: 'high · 高',
  medium: 'medium · 中',
  low: 'low · 低',
} satisfies Record<QualitySeverity, string>

export const QUALITY_STATUS_LABELS = {
  pass: 'pass · 通过',
  warn: 'warn · 告警',
  fail: 'fail · 失败',
} satisfies Record<QualityCheckStatus, string>

export const QUALITY_RELEASE_STATUS_LABELS = {
  released: 'released · 正常发布',
  'released-with-warning': 'released-with-warning · 带告警发布',
  'released-with-risk': 'released-with-risk · 带风险继续',
  quarantined: 'quarantined · 隔离后发布',
  blocked: 'blocked · 阻断下游',
} satisfies Record<QualityReleaseDecision['status'], string>

export const QUALITY_ACTION_OPTIONS: readonly {
  value: QualityAction
  label: string
  detail: string
}[] = [
  {
    value: 'block',
    label: 'block · 阻断',
    detail: '失败规则阻断完整指标结果，修复后按业务日期分区重跑。',
  },
  {
    value: 'warn',
    label: 'warn · 告警',
    detail: '保留证据并告警，下游可以继续读取但必须看到风险。',
  },
  {
    value: 'quarantine',
    label: 'quarantine · 隔离',
    detail: '隔离失败样本，不发布未经确认的完整结果。',
  },
  {
    value: 'continue-with-risk',
    label: 'continue with risk · 带风险继续',
    detail: '接受当前风险继续发布，并留下可追踪的豁免记录。',
  },
]

export const QUALITY_INJECTION_OPTIONS: readonly QualityInjectionOption[] = [
  {
    id: 'none',
    label: '正常基线',
    description: '不注入故障；用来确认规则覆盖后的 clean run。',
  },
  {
    id: 'missing-balance-snapshot',
    label: '完整性 · 缺余额快照',
    description: '从 DWD 输出移除 A002，观察事实缺行如何影响目标余额。',
    dimension: 'completeness',
    ruleId: QUALITY_RULE_IDS.completeness,
  },
  {
    id: 'duplicate-account-snapshot',
    label: '唯一性 · 重复账户日',
    description: '把 A002 × 2026-09-30 再写入一次，观察重复如何放大余额。',
    dimension: 'uniqueness',
    ruleId: QUALITY_RULE_IDS.uniqueness,
  },
  {
    id: 'invalid-currency',
    label: '有效性 · 非法币种',
    description: '把一条 DWD 记录的币种改成未注册的 JPY 编码。',
    dimension: 'validity',
    ruleId: QUALITY_RULE_IDS.validity,
  },
  {
    id: 'orphan-account-balance',
    label: '引用 · 孤儿账户',
    description: '追加一个找不到 dim_account 的 A999 余额，模拟关联键断裂。',
    dimension: 'referential-integrity',
    ruleId: QUALITY_RULE_IDS.referentialIntegrity,
  },
  {
    id: 'deposit-reconciliation-drift',
    label: '对账 · 余额漂移',
    description: '把 DWS 目标分组少记 40 元，和 DWD 明细重新对账。',
    dimension: 'reconciliation',
    ruleId: QUALITY_RULE_IDS.reconciliation,
  },
  {
    id: 'late-partition',
    label: 'Freshness · 分区迟到',
    description: '复用 Scheduler 的 upstream-late 场景，账户余额快照 06:20 才到。',
    dimension: 'freshness',
    ruleId: QUALITY_RULE_IDS.freshness,
  },
]

interface QualityFixture {
  dwd: TransformationTableSnapshot
  dws: TransformationTableSnapshot
  expectedDwd: TransformationTableSnapshot
  accountIds: ReadonlySet<string>
}

interface QualityObservation {
  observedValue: number
  violationCount: number
  evaluatedRowCount: number
  evidenceKind: QualityEvidenceKind
  detail: string
  expectedLabel: string
  samples: readonly QualitySample[]
}

function getTaskOrThrow(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): SchedulerTaskDefinition {
  const task = tasks.find((candidate) => candidate.taskId === taskId)
  if (!task) {
    throw new Error(`数据质量规则引用了不存在的 Scheduler task: ${taskId}`)
  }

  return task
}

function getTableOrThrow(
  snapshots: ReturnType<typeof getLayerSnapshots>,
  tableName: string,
): TransformationTableSnapshot {
  const table = snapshots
    .flatMap((snapshot) => snapshot.tables)
    .find((candidate) => candidate.name === tableName)
  if (!table) {
    throw new Error(`数据质量 fixture 找不到表: ${tableName}`)
  }

  return table
}

function getQualityFixture(includeLateData: boolean): QualityFixture {
  const sourceDataset = includeLateData
    ? appendLateBalanceSnapshot(depositBalanceDataset)
    : depositBalanceDataset
  const snapshots = getLayerSnapshots(sourceDataset)
  const expectedSnapshots = getLayerSnapshots(depositBalanceDataset)

  return {
    dwd: getTableOrThrow(snapshots, 'dwd_deposit_balance_detail'),
    dws: getTableOrThrow(snapshots, 'dws_deposit_balance_daily'),
    expectedDwd: getTableOrThrow(expectedSnapshots, 'dwd_deposit_balance_detail'),
    accountIds: new Set(depositBalanceDataset.accounts.map((account) => account.accountId)),
  }
}

function replaceRows(
  table: TransformationTableSnapshot,
  rows: readonly TransformationRow[],
): TransformationTableSnapshot {
  return { ...table, rows }
}

function getNumber(row: TransformationRow, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

function toSample(
  sampleId: string,
  row: TransformationRow,
  reason: string,
  fields: readonly string[],
): QualitySample {
  const values: Record<string, string | number | null> = {}
  for (const field of fields) {
    values[field] = row[field] ?? null
  }

  return {
    sampleId,
    rowKey: fields.map((field) => String(row[field] ?? 'NULL')).join(' / '),
    values,
    reason,
  }
}

function matchesInjection(injection: QualityInjection, ...ids: QualityInjection[]): boolean {
  return ids.includes(injection)
}

function getScenarioFixture(injection: QualityInjection): QualityFixture {
  const fixture = getQualityFixture(injection === 'late-partition')
  const dwdRows = [...fixture.dwd.rows]

  if (matchesInjection(injection, 'missing-balance-snapshot', 'missing-order-item')) {
    return {
      ...fixture,
      dwd: replaceRows(
        fixture.dwd,
        dwdRows.filter((row) => row.account_id !== 'A002'),
      ),
    }
  }

  if (matchesInjection(injection, 'duplicate-account-snapshot', 'duplicate-order-item')) {
    const duplicate = fixture.dwd.rows.find((row) => row.account_id === 'A002')
    if (!duplicate) {
      throw new Error('质量 fixture 缺少用于重复注入的 A002 账户日明细')
    }

    return { ...fixture, dwd: replaceRows(fixture.dwd, [...dwdRows, { ...duplicate }]) }
  }

  if (matchesInjection(injection, 'invalid-currency', 'invalid-payment-status')) {
    const invalidRow = fixture.dwd.rows.find((row) => row.account_id === 'A002')
    if (!invalidRow) {
      throw new Error('质量 fixture 缺少用于有效性注入的 A002')
    }

    return {
      ...fixture,
      dwd: replaceRows(
        fixture.dwd,
        dwdRows.map((row) => (row === invalidRow ? { ...row, currency: 'JPY' } : row)),
      ),
    }
  }

  if (matchesInjection(injection, 'orphan-account-balance', 'orphan-order-item')) {
    const template = fixture.dwd.rows.find((row) => row.account_id === 'A001')
    if (!template) {
      throw new Error('质量 fixture 缺少用于引用完整性注入的 A001')
    }

    return {
      ...fixture,
      dwd: replaceRows(fixture.dwd, [
        ...dwdRows,
        {
          ...template,
          account_id: 'A999',
          customer_id: null,
          product_id: null,
          branch_id: null,
          customer_scope: null,
          product_type: null,
          branch_name: null,
          balance: 30000,
          missing_dimensions: 'customer、product、branch',
        },
      ]),
    }
  }

  if (matchesInjection(injection, 'deposit-reconciliation-drift', 'sales-reconciliation-drift')) {
    const targetRow = fixture.dws.rows.find((row) =>
      isTargetScope(row, depositBalanceDataset.targetDate),
    )
    if (!targetRow) {
      throw new Error(`质量 fixture 缺少 ${depositBalanceDataset.targetDate} 的 DWS 目标分组`)
    }

    return {
      ...fixture,
      dws: replaceRows(
        fixture.dws,
        fixture.dws.rows.map((row) =>
          row === targetRow ? { ...row, balance: getNumber(row, 'balance') - 40 } : row,
        ),
      ),
    }
  }

  return fixture
}

function isTargetScope(row: TransformationRow, targetDate: string): boolean {
  return (
    row.snapshot_date === targetDate &&
    row.branch_name === DEPOSIT_BALANCE_SCOPE.branchName &&
    row.customer_scope === DEPOSIT_BALANCE_SCOPE.customerScope &&
    row.product_type === DEPOSIT_BALANCE_SCOPE.productType &&
    row.currency === DEPOSIT_BALANCE_SCOPE.currency
  )
}

function getSchedulerContext(
  rule: QualityRuleDefinition,
  schedulerRun: SchedulerRunState,
): QualitySchedulerContext {
  const task = getTaskOrThrow(schedulerRun.tasks, rule.schedulerTaskId)
  const taskRun = schedulerRun.taskRuns[rule.schedulerTaskId]
  if (!taskRun) {
    throw new Error(`Scheduler Run 缺少 task run: ${rule.schedulerTaskId}`)
  }

  return {
    taskId: task.taskId,
    runId: schedulerRun.runId,
    runStatus: schedulerRun.status,
    taskStatus: taskRun.status,
    businessDate: schedulerRun.businessDate,
    partition: schedulerRun.partition,
    outputTable: task.contract.outputTable,
    scheduledAt: schedulerRun.scheduledAt,
    startedAt: taskRun.startedAt,
    endedAt: taskRun.endedAt,
  }
}

function getDuplicateRows(rows: readonly TransformationRow[]): TransformationRow[] {
  const groups = new Map<string, TransformationRow[]>()
  for (const row of rows) {
    const key = `${String(row.snapshot_date ?? 'NULL')}|${String(row.account_id ?? 'NULL')}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  return [...groups.values()].flatMap((group) => group.slice(1))
}

function sumTargetBalance(rows: readonly TransformationRow[], targetDate: string): number {
  return rows
    .filter((row) => isTargetScope(row, targetDate))
    .reduce((total, row) => total + getNumber(row, 'balance'), 0)
}

function getCompletenessObservation(fixture: QualityFixture): QualityObservation {
  const dwdRows = fixture.dwd.rows
  const expectedCount = fixture.expectedDwd.rows.length
  const missingCount = Math.max(0, expectedCount - dwdRows.length)
  const missingRow = fixture.expectedDwd.rows.find(
    (row) =>
      !dwdRows.some(
        (candidate) =>
          candidate.snapshot_date === row.snapshot_date && candidate.account_id === row.account_id,
      ),
  )
  return {
    observedValue: missingCount,
    violationCount: missingCount,
    evaluatedRowCount: Math.max(expectedCount, dwdRows.length),
    evidenceKind: 'failed-sample',
    detail: `期望 ${expectedCount} 行 DWD 账户日明细，实际只有 ${dwdRows.length} 行。`,
    expectedLabel: '缺失行数 ≤ 0',
    samples:
      missingCount > 0 && missingRow
        ? [
            toSample(
              'sample.missing-balance-snapshot',
              missingRow,
              '应当从 ODS 账户余额快照进入 DWD，但当前输出没有这条事实。',
              ['snapshot_date', 'account_id', 'balance'],
            ),
          ]
        : [],
  }
}

function getUniquenessObservation(fixture: QualityFixture): QualityObservation {
  const duplicateRows = getDuplicateRows(fixture.dwd.rows)
  return {
    observedValue: duplicateRows.length,
    violationCount: duplicateRows.length,
    evaluatedRowCount: fixture.dwd.rows.length,
    evidenceKind: 'failed-sample',
    detail: `扫描 ${fixture.dwd.rows.length} 行，发现 ${duplicateRows.length} 行重复的 snapshot_date + account_id。`,
    expectedLabel: '重复行数 ≤ 0',
    samples: duplicateRows
      .slice(0, 3)
      .map((row, index) =>
        toSample(
          `sample.duplicate-account-day.${index + 1}`,
          row,
          '同一账户同一快照日已经出现过，重复写入会放大存款余额。',
          ['snapshot_date', 'account_id', 'balance'],
        ),
      ),
  }
}

function getValidityObservation(fixture: QualityFixture): QualityObservation {
  const invalidRows = fixture.dwd.rows.filter(
    (row) => row.currency !== DEPOSIT_BALANCE_SCOPE.currency,
  )
  return {
    observedValue: invalidRows.length,
    violationCount: invalidRows.length,
    evaluatedRowCount: fixture.dwd.rows.length,
    evidenceKind: 'failed-sample',
    detail: `currency 允许标准编码 CNY，实际发现 ${invalidRows.length} 行非法值。`,
    expectedLabel: '非法枚举行数 ≤ 0',
    samples: invalidRows
      .slice(0, 3)
      .map((row, index) =>
        toSample(
          `sample.invalid-currency.${index + 1}`,
          row,
          '币种编码不在指标契约内，下游分组不能安全解释。',
          ['snapshot_date', 'account_id', 'source_currency', 'currency'],
        ),
      ),
  }
}

function getReferenceObservation(fixture: QualityFixture): QualityObservation {
  const orphanRows = fixture.dwd.rows.filter(
    (row) => typeof row.account_id !== 'string' || !fixture.accountIds.has(row.account_id),
  )
  return {
    observedValue: orphanRows.length,
    violationCount: orphanRows.length,
    evaluatedRowCount: fixture.dwd.rows.length,
    evidenceKind: 'failed-sample',
    detail: `DWD 明细中的 account_id 应能在 dim_account 找到，发现 ${orphanRows.length} 个孤儿引用。`,
    expectedLabel: '孤儿引用行数 ≤ 0',
    samples: orphanRows
      .slice(0, 3)
      .map((row, index) =>
        toSample(
          `sample.orphan-account.${index + 1}`,
          row,
          'account_id 在账户关系表不存在，无法确认这条余额属于哪个账户。',
          ['snapshot_date', 'account_id', 'balance'],
        ),
      ),
  }
}

function getReconciliationObservation(fixture: QualityFixture): QualityObservation {
  const targetDate = depositBalanceDataset.targetDate
  const expectedAmount = sumTargetBalance(fixture.dwd.rows, targetDate)
  const observedRow = fixture.dws.rows.find((row) => isTargetScope(row, targetDate))
  const observedAmount = observedRow ? getNumber(observedRow, 'balance') : 0
  const delta = Math.abs(expectedAmount - observedAmount)
  return {
    observedValue: delta,
    violationCount: delta > 0 ? 1 : 0,
    evaluatedRowCount: fixture.dwd.rows.length,
    evidenceKind: 'metric-comparison',
    detail: `DWD 目标余额 ${expectedAmount} 元，对账到 DWS 的 balance 为 ${observedAmount} 元，差额 ${delta} 元。`,
    expectedLabel: '对账差额 ≤ 0 元',
    samples:
      delta > 0
        ? [
            {
              sampleId: 'sample.deposit-reconciliation',
              rowKey: `${targetDate} / balance`,
              values: {
                snapshot_date: targetDate,
                dwd_balance: expectedAmount,
                dws_balance: observedAmount,
                delta,
              },
              reason: '同一业务分区的账户日明细合计与主题汇总不一致。',
            },
          ]
        : [],
  }
}

function getFreshnessObservation(schedulerContext: QualitySchedulerContext): QualityObservation {
  const finishedAt = schedulerContext.endedAt ?? '未知时间'
  const delayMinutes = schedulerContext.endedAt
    ? getSchedulerMinutesBetween(schedulerContext.scheduledAt, schedulerContext.endedAt)
    : 0
  const safeDelayMinutes = Number.isFinite(delayMinutes) ? Math.max(0, delayMinutes) : 0
  return {
    observedValue: safeDelayMinutes,
    violationCount: safeDelayMinutes > 30 ? 1 : 0,
    evaluatedRowCount: 1,
    evidenceKind: 'partition-freshness',
    detail: `ADS 分区在 ${finishedAt} 完成，距 ${schedulerContext.scheduledAt} 触发已过去 ${safeDelayMinutes} 分钟。`,
    expectedLabel: '发布延迟 ≤ 30 分钟',
    samples: [
      {
        sampleId: 'sample.partition-freshness',
        rowKey: `${schedulerContext.partition.column} = ${schedulerContext.partition.value}`,
        values: {
          run_id: schedulerContext.runId,
          task_id: schedulerContext.taskId,
          task_status: schedulerContext.taskStatus,
          completed_at: schedulerContext.endedAt,
          delay_minutes: safeDelayMinutes,
        },
        reason: 'Freshness 由 Scheduler 的实际分区完成时间计算，不由静态质量分数猜测。',
      },
    ],
  }
}

function getRuleObservation(
  rule: QualityRuleDefinition,
  fixture: QualityFixture,
  schedulerContext: QualitySchedulerContext,
): QualityObservation {
  switch (rule.ruleId) {
    case QUALITY_RULE_IDS.completeness:
      return getCompletenessObservation(fixture)
    case QUALITY_RULE_IDS.uniqueness:
      return getUniquenessObservation(fixture)
    case QUALITY_RULE_IDS.validity:
      return getValidityObservation(fixture)
    case QUALITY_RULE_IDS.referentialIntegrity:
      return getReferenceObservation(fixture)
    case QUALITY_RULE_IDS.reconciliation:
      return getReconciliationObservation(fixture)
    case QUALITY_RULE_IDS.freshness:
      return getFreshnessObservation(schedulerContext)
  }
}

function getThresholdValue(
  rule: QualityRuleDefinition,
  overrides: Readonly<Record<string, number>> | undefined,
): number {
  const override = overrides?.[rule.ruleId]
  return override === undefined ? rule.threshold.value : Math.max(0, override)
}

export function evaluateQualityStatus(
  observedValue: number,
  threshold: QualityThreshold,
): QualityCheckStatus {
  if (threshold.operator === 'at-most') {
    if (observedValue <= threshold.value) {
      return 'pass'
    }
    if (
      threshold.warningRange !== undefined &&
      observedValue <= threshold.value + threshold.warningRange
    ) {
      return 'warn'
    }
    return 'fail'
  }

  if (threshold.operator === 'at-least') {
    if (observedValue >= threshold.value) {
      return 'pass'
    }
    if (
      threshold.warningRange !== undefined &&
      observedValue >= threshold.value - threshold.warningRange
    ) {
      return 'warn'
    }
    return 'fail'
  }

  if (observedValue === threshold.value) {
    return 'pass'
  }
  if (
    threshold.warningRange !== undefined &&
    Math.abs(observedValue - threshold.value) <= threshold.warningRange
  ) {
    return 'warn'
  }
  return 'fail'
}

function getQualitySummary(
  status: QualityCheckStatus,
  observation: QualityObservation,
  threshold: QualityThreshold,
): string {
  const statusText = QUALITY_STATUS_LABELS[status]
  return `${statusText}：观察值 ${observation.observedValue}，阈值 ${threshold.value} ${threshold.unit}。`
}

function getEvidenceExpectedLabel(
  observation: QualityObservation,
  threshold: QualityThreshold,
): string {
  if (observation.evidenceKind === 'scheduler-context') {
    return observation.expectedLabel
  }

  let operator = '='
  if (threshold.operator === 'at-most') {
    operator = '≤'
  } else if (threshold.operator === 'at-least') {
    operator = '≥'
  }
  const prefix = observation.expectedLabel.replace(/\s*[≤≥=].*$/u, '')
  return `${prefix} ${operator} ${formatQualityThresholdValue(threshold.value, threshold.unit)}`
}

function formatQualityThresholdValue(value: number, unit: QualityThreshold['unit']): string {
  if (unit === 'currency') {
    return `¥${value}`
  }
  if (unit === 'minutes') {
    return `${value} min`
  }
  return `${value} 行`
}

function createEvidence(
  rule: QualityRuleDefinition,
  observation: QualityObservation,
  threshold: QualityThreshold,
): QualityEvidence {
  return {
    evidenceId: `evidence.${rule.ruleId}`,
    kind: observation.evidenceKind,
    detail: observation.detail,
    observedValue: observation.observedValue,
    expectedValue: threshold.value,
    expectedLabel: getEvidenceExpectedLabel(observation, threshold),
    samples: observation.samples,
  }
}

function createSchedulerFailureObservation(context: QualitySchedulerContext): QualityObservation {
  return {
    observedValue: 1,
    violationCount: 1,
    evaluatedRowCount: 0,
    evidenceKind: 'scheduler-context',
    detail: `质量检查前置任务 ${context.taskId} 当前为 ${context.taskStatus}，不能把未产出的数据当成通过。`,
    expectedLabel: 'Scheduler task status = success',
    samples: [
      {
        sampleId: 'sample.scheduler-task-status',
        rowKey: `${context.runId} / ${context.taskId}`,
        values: {
          run_id: context.runId,
          task_id: context.taskId,
          task_status: context.taskStatus,
          output_table: context.outputTable,
        },
        reason: '质量结果必须保留对应的 Scheduler task/run 上下文。',
      },
    ],
  }
}

function getUpstreamHints(dimension: QualityDimension): readonly string[] {
  if (dimension === 'freshness') {
    return ['检查上游输入到达时间、业务日期分区和 Scheduler SLA。']
  }
  if (dimension === 'reconciliation') {
    return ['沿 DWD → DWS 聚合边界复核过滤、币种和汇总口径。']
  }
  if (dimension === 'referential-integrity') {
    return ['沿账户余额快照与 dim_account 的 JOIN 关系检查迟到或错误写入。']
  }
  return ['回到 DWD 的 ODS 输入、去重规则和字段映射，确认异常是在加工前还是加工后产生。']
}

function createRemediation(rule: QualityRuleDefinition, action: QualityAction): QualityRemediation {
  const actionOption = QUALITY_ACTION_OPTIONS.find((option) => option.value === action)
  if (!actionOption) {
    throw new Error(`未知的数据质量处置动作: ${action}`)
  }

  const canRerun = action !== 'continue-with-risk'
  return {
    action,
    label: actionOption.label,
    canRerun,
    rerunTaskId: rule.schedulerTaskId,
    steps: [
      rule.remediationHint,
      canRerun
        ? `修复后按 ${rule.target.partition.column} = ${rule.target.partition.value} 重跑 ${rule.schedulerTaskId}。`
        : '记录业务豁免、通知下游使用方，并在下一轮质量检查前复核。',
    ],
  }
}

function getDecisionStatus(
  action: QualityAction,
  failedCount: number,
  warningCount: number,
): QualityReleaseDecision['status'] {
  if (failedCount === 0 && warningCount === 0) {
    return 'released'
  }
  if (failedCount === 0) {
    return action === 'continue-with-risk' ? 'released-with-risk' : 'released-with-warning'
  }

  if (action === 'block') {
    return 'blocked'
  }
  if (action === 'quarantine') {
    return 'quarantined'
  }
  if (action === 'continue-with-risk') {
    return 'released-with-risk'
  }
  return 'released-with-warning'
}

function getDecisionRationale(
  action: QualityAction,
  status: QualityReleaseDecision['status'],
  failedCount: number,
  warningCount: number,
): string {
  const actionLabel =
    QUALITY_ACTION_OPTIONS.find((option) => option.value === action)?.label ?? action
  if (status === 'released') {
    return '所有规则均 pass；Scheduler Run 成功且没有遗留质量事件，下游可以正常读取。'
  }
  if (status === 'blocked') {
    return `${failedCount} 条 fail 规则触发 ${actionLabel}：完整下游发布被阻断，必须修复证据指向的问题后再按分区重跑。`
  }
  if (status === 'quarantined') {
    return `${failedCount} 条 fail 规则触发 ${actionLabel}：失败样本进入隔离，未经确认的完整结果不会继续下游。`
  }
  if (status === 'released-with-risk') {
    return `${failedCount + warningCount} 条非 pass 规则触发 ${actionLabel}：下游继续，但必须把风险和豁免与本次 run 一起记录。`
  }
  return `${failedCount + warningCount} 条非 pass 规则触发 ${actionLabel}：下游可继续，但消费方必须看到告警和失败证据。`
}

function getRuleIdsByStatus(
  checks: readonly QualityCheckResult[],
  status: QualityCheckStatus,
): string[] {
  return checks.filter((check) => check.status === status).map((check) => check.ruleId)
}

function createReleaseDecision(
  checks: readonly QualityCheckResult[],
  action: QualityAction,
  schedulerRun: SchedulerRunState,
): QualityReleaseDecision {
  const checkCounts = checks.reduce(
    (counts, check) => ({ ...counts, [check.status]: counts[check.status] + 1 }),
    { pass: 0, warn: 0, fail: 0 },
  )
  const nonPassChecks = checks.filter((check) => check.status !== 'pass')
  const failedRuleIds = getRuleIdsByStatus(checks, 'fail')
  const warningRuleIds = getRuleIdsByStatus(checks, 'warn')
  const status = getDecisionStatus(action, checkCounts.fail, checkCounts.warn)
  return {
    decisionId: `decision.quality.${schedulerRun.runId}.${action}`,
    action,
    status,
    isBlocked: false,
    schedulerRunId: schedulerRun.runId,
    businessDate: schedulerRun.businessDate,
    partition: schedulerRun.partition,
    checkCounts,
    eventIds: nonPassChecks.map((check) => `event.quality.${check.ruleId}`),
    failedRuleIds,
    warningRuleIds,
    affectedOutputs: [],
    quarantinedSampleCount: 0,
    remediation: [],
    rationale: getDecisionRationale(action, status, checkCounts.fail, checkCounts.warn),
  }
}

function getReleaseImpactExplanation(
  status: QualityReleaseDecision['status'],
  action: QualityAction,
): string {
  if (status === 'blocked') {
    return `${action} 策略下，完整下游发布被阻断；修复并重跑关联分区后才能恢复。`
  }
  if (status === 'quarantined') {
    return `${action} 策略下，失败样本被隔离；完整结果不向下游放行。`
  }
  if (status === 'released-with-risk') {
    return `${action} 策略下，下游继续读取，但必须携带本次质量风险。`
  }
  if (status === 'released-with-warning') {
    return `${action} 策略下，下游继续读取并收到告警；证据仍保留在质量事件中。`
  }
  return '质量规则全部通过，下游可按正常路径发布。'
}

function getRuleById(
  rules: readonly QualityRuleDefinition[],
  ruleId: string,
): QualityRuleDefinition {
  const rule = rules.find((candidate) => candidate.ruleId === ruleId)
  if (!rule) {
    throw new Error(`找不到数据质量规则: ${ruleId}`)
  }

  return rule
}

export function createQualityRules(schedulerRun: SchedulerRunState): QualityRuleDefinition[] {
  const partition = { ...schedulerRun.partition }
  const dwdTask = getTaskOrThrow(schedulerRun.tasks, SCHEDULER_TASK_IDS.dwd)
  const dwsTask = getTaskOrThrow(schedulerRun.tasks, SCHEDULER_TASK_IDS.dws)
  const adsTask = getTaskOrThrow(schedulerRun.tasks, SCHEDULER_TASK_IDS.ads)
  const dwsOutput = dwsTask.contract.outputTable
  const adsOutput = adsTask.contract.outputTable

  return [
    {
      ruleId: QUALITY_RULE_IDS.completeness,
      name: 'DWD 账户余额完整性',
      dimension: 'completeness',
      ruleType: 'row-count',
      target: { table: 'dwd_deposit_balance_detail', field: 'account_id', partition },
      severity: 'high',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: '账户余额快照进入 DWD 后不能在加工中无故缺行。',
      remediationHint:
        '回查 ods_account_balance_snapshot 是否到齐，并确认 DWD 的过滤或 JOIN 没有丢余额。',
      schedulerTaskId: dwdTask.taskId,
      downstreamImpacts: [dwsOutput, adsOutput],
    },
    {
      ruleId: QUALITY_RULE_IDS.uniqueness,
      name: 'DWD 账户日唯一性',
      dimension: 'uniqueness',
      ruleType: 'unique-key',
      target: {
        table: 'dwd_deposit_balance_detail',
        field: 'snapshot_date + account_id',
        partition,
      },
      severity: 'critical',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: '账户余额明细在一个快照日只能出现一次。',
      remediationHint: '检查账户日去重键和分区写入是否幂等，避免重复事实放大存款余额。',
      schedulerTaskId: dwdTask.taskId,
      downstreamImpacts: [dwsOutput, adsOutput],
    },
    {
      ruleId: QUALITY_RULE_IDS.validity,
      name: '币种编码有效性',
      dimension: 'validity',
      ruleType: 'enum',
      target: { table: 'dwd_deposit_balance_detail', field: 'currency', partition },
      severity: 'high',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: 'currency 进入 DWD 后只能使用指标契约注册的 CNY 编码。',
      remediationHint: '修复币种标准化映射或补充经过评审的编码契约，再重新计算存款余额主题。',
      schedulerTaskId: dwdTask.taskId,
      downstreamImpacts: [dwsOutput, adsOutput],
    },
    {
      ruleId: QUALITY_RULE_IDS.referentialIntegrity,
      name: '账户余额引用完整性',
      dimension: 'referential-integrity',
      ruleType: 'foreign-key',
      target: { table: 'dwd_deposit_balance_detail', field: 'account_id', partition },
      severity: 'high',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: '每条 DWD 余额都必须能回到 dim_account 的账户关系。',
      remediationHint: '隔离找不到账户关系的余额，并确认关联表是否迟到或错误写入。',
      schedulerTaskId: dwdTask.taskId,
      downstreamImpacts: [dwsOutput, adsOutput],
    },
    {
      ruleId: QUALITY_RULE_IDS.reconciliation,
      name: 'DWD / DWS 存款余额对账',
      dimension: 'reconciliation',
      ruleType: 'aggregate-match',
      target: { table: 'dws_deposit_balance_daily', field: 'balance', partition },
      severity: 'critical',
      threshold: { operator: 'at-most', value: 0, unit: 'currency', warningRange: 30 },
      description: 'DWS 指标分组余额必须和 DWD 按同一口径聚合后的结果一致。',
      remediationHint: '对照 DWD 明细、指标筛选和 DWS 聚合 SQL，确认差额不是粒度或写入顺序造成。',
      schedulerTaskId: dwsTask.taskId,
      downstreamImpacts: [adsOutput],
    },
    {
      ruleId: QUALITY_RULE_IDS.freshness,
      name: 'ADS 分区 Freshness',
      dimension: 'freshness',
      ruleType: 'max-delay',
      target: { table: adsOutput, field: 'snapshot_date', partition },
      severity: 'medium',
      threshold: { operator: 'at-most', value: 30, unit: 'minutes', warningRange: 15 },
      description: '业务日期指标应在日批触发后 30 分钟内完成发布，迟到只能按业务日期回补。',
      remediationHint: '确认上游快照到达时间，必要时按同一业务日期重跑，而不是新建错误日期报表。',
      schedulerTaskId: adsTask.taskId,
      downstreamImpacts: [adsOutput, 'BI 存款余额日报'],
    },
  ]
}

/** Build a terminal Scheduler Run by reusing the existing scheduler state machine. */
export function createQualitySchedulerRun(
  tasks: readonly SchedulerTaskDefinition[],
  businessDate: string,
  scenario: SchedulerScenario = 'happy-path',
  scheduledAt = SCHEDULER_DEFAULT_SCHEDULED_AT,
): SchedulerRunState {
  const scenarioSuffix = scenario === 'upstream-late' ? 'late' : 'success'
  const initial = createInitialSchedulerRun(tasks, {
    businessDate,
    scenario,
    scheduledAt,
    runId: `run.deposit-balance.daily.${businessDate.replace(/-/gu, '')}.quality-${scenarioSuffix}.001`,
  })
  const terminal = buildSchedulerTimeline(initial).at(-1)
  if (!terminal || (terminal.status !== 'success' && terminal.status !== 'failed')) {
    throw new Error(`数据质量实验的 Scheduler Run 未能到达终态: ${scenario}`)
  }

  return terminal
}

export function createDataQualityVisualization(
  schedulerRun: SchedulerRunState,
): DataQualityVisualization {
  return {
    kind: 'data-quality',
    targetDate: schedulerRun.businessDate,
    schedulerRun,
    rules: createQualityRules(schedulerRun),
    injections: QUALITY_INJECTION_OPTIONS,
    defaultInjection: 'missing-balance-snapshot',
  }
}

function getSchedulerRunForInjection(
  visualization: DataQualityVisualization,
  injection: QualityInjection,
): SchedulerRunState {
  if (injection !== 'late-partition') {
    return visualization.schedulerRun
  }

  return createQualitySchedulerRun(
    visualization.schedulerRun.tasks,
    visualization.targetDate,
    'upstream-late',
    visualization.schedulerRun.scheduledAt,
  )
}

function createQualityChecks(
  visualization: DataQualityVisualization,
  schedulerRun: SchedulerRunState,
  injection: QualityInjection,
  thresholdOverrides: Readonly<Record<string, number>> | undefined,
): QualityCheckResult[] {
  const fixture = getScenarioFixture(injection)
  return visualization.rules.map((rule) => {
    const schedulerContext = getSchedulerContext(rule, schedulerRun)
    const threshold: QualityThreshold = {
      ...rule.threshold,
      value: getThresholdValue(rule, thresholdOverrides),
    }
    const rawObservation = getRuleObservation(rule, fixture, schedulerContext)
    const observation =
      schedulerContext.taskStatus === 'success'
        ? rawObservation
        : createSchedulerFailureObservation(schedulerContext)
    const status =
      schedulerContext.taskStatus === 'success'
        ? evaluateQualityStatus(observation.observedValue, threshold)
        : 'fail'

    return {
      checkId: `check.quality.${rule.ruleId}`,
      ruleId: rule.ruleId,
      status,
      summary: getQualitySummary(status, observation, threshold),
      observedValue: observation.observedValue,
      violationCount: observation.violationCount,
      evaluatedRowCount: observation.evaluatedRowCount,
      threshold,
      schedulerContext,
      evidence: [createEvidence(rule, observation, threshold)],
    }
  })
}

function getNonPassChecks(checks: readonly QualityCheckResult[]): QualityCheckResult[] {
  return checks.filter((check) => check.status !== 'pass')
}

function getAffectedOutputs(
  checks: readonly QualityCheckResult[],
  rules: readonly QualityRuleDefinition[],
): string[] {
  const rulesById = new Map(rules.map((rule) => [rule.ruleId, rule]))
  return [
    ...new Set(
      getNonPassChecks(checks).flatMap(
        (check) => rulesById.get(check.ruleId)?.downstreamImpacts ?? [],
      ),
    ),
  ]
}

function getQuarantinedSampleCount(checks: readonly QualityCheckResult[]): number {
  return getNonPassChecks(checks).reduce(
    (count, check) => count + check.evidence.flatMap((evidence) => evidence.samples).length,
    0,
  )
}

function finalizeReleaseDecision(
  initialDecision: QualityReleaseDecision,
  checks: readonly QualityCheckResult[],
  rules: readonly QualityRuleDefinition[],
): QualityReleaseDecision {
  const isBlocked = initialDecision.status === 'blocked' || initialDecision.status === 'quarantined'
  const nonPassChecks = getNonPassChecks(checks)
  return {
    ...initialDecision,
    isBlocked,
    affectedOutputs: getAffectedOutputs(checks, rules),
    quarantinedSampleCount:
      initialDecision.status === 'quarantined' ? getQuarantinedSampleCount(checks) : 0,
    remediation: nonPassChecks.map((check) =>
      createRemediation(getRuleById(rules, check.ruleId), initialDecision.action),
    ),
  }
}

interface QualityEventContext {
  checks: readonly QualityCheckResult[]
  rules: readonly QualityRuleDefinition[]
  schedulerRun: SchedulerRunState
  action: QualityAction
  releaseDecision: QualityReleaseDecision
}

function createQualityEvents({
  checks,
  rules,
  schedulerRun,
  action,
  releaseDecision,
}: QualityEventContext): QualityEvent[] {
  return getNonPassChecks(checks).map((check) => {
    const rule = getRuleById(rules, check.ruleId)
    const eventId = `event.quality.${check.ruleId}`
    return {
      eventId,
      eventType: 'quality-check',
      checkId: check.checkId,
      ruleId: check.ruleId,
      status: check.status,
      severity: rule.severity,
      occurredAt: check.schedulerContext.endedAt ?? schedulerRun.clock,
      target: rule.target,
      threshold: check.threshold,
      observedValue: check.observedValue,
      evidence: check.evidence,
      schedulerContext: check.schedulerContext,
      releaseImpact: {
        downstreamRelease: releaseDecision.status,
        isBlocked: releaseDecision.isBlocked,
        affectedOutputs: rule.downstreamImpacts,
        explanation: getReleaseImpactExplanation(releaseDecision.status, action),
      },
      remediation: createRemediation(rule, action),
      investigationContext: {
        target: rule.target,
        schedulerTaskId: rule.schedulerTaskId,
        schedulerRunId: schedulerRun.runId,
        upstreamHints: getUpstreamHints(rule.dimension),
        downstreamImpacts: rule.downstreamImpacts,
        relatedRuleIds: [rule.ruleId],
      },
    }
  })
}

export function evaluateDataQuality(
  visualization: DataQualityVisualization,
  options: QualityEvaluationOptions = {},
): QualityEvaluation {
  const injection = options.injection ?? visualization.defaultInjection
  const action = options.action ?? 'block'
  const schedulerRun = getSchedulerRunForInjection(visualization, injection)
  const checks = createQualityChecks(
    visualization,
    schedulerRun,
    injection,
    options.thresholdOverrides,
  )
  const initialDecision = createReleaseDecision(checks, action, schedulerRun)
  const releaseDecision = finalizeReleaseDecision(initialDecision, checks, visualization.rules)
  const events = createQualityEvents({
    checks,
    rules: visualization.rules,
    schedulerRun,
    action,
    releaseDecision,
  })

  return {
    schedulerRun,
    injection,
    action,
    checks,
    events,
    releaseDecision: {
      ...releaseDecision,
      eventIds: events.map((event) => event.eventId),
    },
  }
}
