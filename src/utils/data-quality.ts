import type {
  DataQualityVisualization,
  QualityAction,
  QualityBankingModel,
  QualityBalanceRow,
  QualityCheckResult,
  QualityCheckStatus,
  QualityDimension,
  QualityEvidence,
  QualityEvidenceKind,
  QualityEvaluation,
  QualityEvaluationOptions,
  QualityEvent,
  QualityLessonMode,
  QualityRuleDefinition,
  QualityRuleType,
  QualitySample,
  QualityScenario,
  QualityScenarioOption,
  QualitySchedulerContext,
  QualitySeverity,
  QualityThreshold,
} from '../features/data-quality/types'
import type {
  SchedulerRunState,
  SchedulerScenario,
  SchedulerTaskDefinition,
} from '../features/scheduler/types'
import { depositAccountSnapshots } from '../content/lessons/deposit-data'
import {
  SCHEDULER_DEFAULT_SCHEDULED_AT,
  SCHEDULER_TASK_IDS,
  buildSchedulerTimeline,
  createInitialSchedulerRun,
} from './scheduler'

export const QUALITY_BUSINESS_DATE = '2026-09-30'

export const QUALITY_TABLES = {
  snapshot: 'account_balance_snapshot',
  dwd: 'dwd_deposit_account_balance',
  dws: 'dws_deposit_balance_daily',
  ads: 'ads_deposit_balance_metric',
  telemetry: 'ods_behavior_event',
} as const

export const QUALITY_RULE_IDS = {
  grain: 'dq.dwd.deposit-balance.grain.v1',
  requiredFields: 'dq.dwd.deposit-balance.required-fields.v1',
  currency: 'dq.dwd.deposit-balance.currency.v1',
  branchReference: 'dq.dwd.deposit-balance.branch-reference.v1',
  batchCompleteness: 'dq.snapshot.deposit-balance.expected-set.v1',
  freshness: 'dq.dwd.deposit-balance.freshness.v1',
  reconciliation: 'dq.dws.deposit-balance.reconciliation.v1',
  telemetryFormat: 'dq.ods.behavior-event.format.v1',
} as const

export const QUALITY_DIMENSION_LABELS: Record<QualityDimension, string> = {
  grain: 'Grain / 记录身份',
  field: '关键字段 / 字段语义',
  relationship: '对象关系',
  dataset: '整批数据',
  freshness: 'Freshness / 数据日期',
  reconciliation: '跨层对账',
  format: '记录格式',
}

export const QUALITY_RULE_TYPE_LABELS: Record<QualityRuleType, string> = {
  'grain-unique': '唯一身份',
  'required-field': '关键字段',
  'field-semantic': '字段语义',
  reference: '引用关系',
  'expected-set': '应到集合',
  'freshness-date': '日期比较',
  reconciliation: '同口径对账',
  'record-format': '记录格式',
}

export const QUALITY_SEVERITY_LABELS: Record<QualitySeverity, string> = {
  critical: 'critical · 关键',
  high: 'high · 高',
  medium: 'medium · 中',
  low: 'low · 低',
}

export const QUALITY_STATUS_LABELS: Record<QualityCheckStatus, string> = {
  pass: 'pass · 通过',
  warn: 'warn · 告警',
  fail: 'fail · 失败',
}

export const QUALITY_RELEASE_STATUS_LABELS = {
  released: 'released · 正常继续',
  quarantined: 'quarantined · 隔离后继续',
  blocked: 'blocked · 阻断发布',
} as const

interface QualityObservation {
  expected: string | number
  observed: string | number
  observedValue: number
  violationCount: number
  evaluatedRowCount: number
  evidenceKind: QualityEvidenceKind
  detail: string
  failedRows?: number
  sample?: QualitySample
}

function toQualityRow(snapshot: (typeof depositAccountSnapshots)[number]): QualityBalanceRow {
  return {
    accountId: snapshot.accountId,
    snapshotDate: snapshot.snapshotDate,
    customerScope: snapshot.customerScope,
    product: snapshot.product,
    branch: snapshot.branch,
    currency: snapshot.currency,
    status: snapshot.status,
    balance: snapshot.balance,
  }
}

function createSample(sampleId: string, row: QualityBalanceRow, reason: string): QualitySample {
  return {
    sampleId,
    rowKey: `${row.accountId} / ${row.snapshotDate ?? 'NULL'}`,
    values: {
      account_id: row.accountId,
      snapshot_date: row.snapshotDate,
      balance: row.balance,
      currency: row.currency,
      branch_id: row.branch,
    },
    reason,
  }
}

/** Build the one deterministic Banking Teaching Domain model used by all five lessons. */
export function createQualityTeachingModel(): QualityBankingModel {
  const targetSnapshots = depositAccountSnapshots
    .filter((snapshot) => snapshot.snapshotDate === QUALITY_BUSINESS_DATE)
    .map(toQualityRow)
  const previousSnapshots = depositAccountSnapshots
    .filter((snapshot) => snapshot.snapshotDate === '2026-09-29')
    .map(toQualityRow)

  return {
    targetDate: QUALITY_BUSINESS_DATE,
    sourceSnapshots: targetSnapshots,
    previousSnapshots,
    knownBranchIds: [...new Set(depositAccountSnapshots.map((snapshot) => snapshot.branch))],
    knownProductIds: [...new Set(depositAccountSnapshots.map((snapshot) => snapshot.product))],
    knownCurrencyCodes: [...new Set(depositAccountSnapshots.map((snapshot) => snapshot.currency))],
    expectedActiveAccountCount: 10_000,
    receivedSnapshotAccountCount: 10_000,
    incompleteSnapshotAccountCount: 7_000,
    reconciliation: {
      businessDate: QUALITY_BUSINESS_DATE,
      branch: 'hangzhou',
      customerScope: 'small-business',
      product: 'term',
      currency: 'CNY',
      expectedDwdBalance: 1_000_000_000,
      observedDwsBalance: 800_000_000,
    },
    telemetry: {
      totalRecords: 1_000_000,
      invalidRecords: 3,
      sample: {
        sampleId: 'sample.telemetry.invalid-json.001',
        rowKey: 'event-880031',
        values: {
          event_id: 'event-880031',
          payload: '{"page":',
          format: 'invalid JSON',
        },
        reason: '行为事件彼此独立，隔离这条记录不会改变其他事件的业务含义。',
      },
    },
  }
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

function target(
  table: string,
  partition: { column: string; value: string },
  field?: string,
): { table: string; partition: { column: string; value: string }; field?: string } {
  return field ? { table, field, partition } : { table, partition }
}

export function createQualityRules(schedulerRun: SchedulerRunState): QualityRuleDefinition[] {
  const partition = { column: 'business_date', value: schedulerRun.businessDate }
  const dwdTask = getTaskOrThrow(schedulerRun.tasks, SCHEDULER_TASK_IDS.dwd)
  const dwsTask = getTaskOrThrow(schedulerRun.tasks, SCHEDULER_TASK_IDS.dws)
  const adsTask = getTaskOrThrow(schedulerRun.tasks, SCHEDULER_TASK_IDS.ads)

  return [
    {
      ruleId: QUALITY_RULE_IDS.grain,
      name: 'Account × snapshot_date 不能重复',
      dimension: 'grain',
      ruleType: 'grain-unique',
      target: target(QUALITY_TABLES.dwd, partition, 'account_id + snapshot_date'),
      severity: 'critical',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: 'DWD 一行代表一个账户在一个快照日的余额状态，同一身份不能出现两次。',
      teachingQuestion: '同一个账户同一天为什么出现两次？',
      schedulerTaskId: dwdTask.taskId,
      strict: true,
      releaseScope: 'banking',
    },
    {
      ruleId: QUALITY_RULE_IDS.requiredFields,
      name: '关键字段不能无意义缺失',
      dimension: 'field',
      ruleType: 'required-field',
      target: target(QUALITY_TABLES.dwd, partition, 'account_id / snapshot_date / balance'),
      severity: 'high',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: '账户身份、快照日期和余额共同说明这条状态记录，缺少其中一项就无法可靠使用。',
      teachingQuestion: '这条余额记录还知道自己属于哪个账户、哪一天吗？',
      schedulerTaskId: dwdTask.taskId,
      strict: true,
      releaseScope: 'banking',
    },
    {
      ruleId: QUALITY_RULE_IDS.currency,
      name: 'currency 必须符合字段语义',
      dimension: 'field',
      ruleType: 'field-semantic',
      target: target(QUALITY_TABLES.dwd, partition, 'currency'),
      severity: 'high',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: 'currency 不是“有值就行”，只能使用教学域已经登记的币种代码。',
      teachingQuestion: 'currency = ??? 还能解释这笔余额吗？',
      schedulerTaskId: dwdTask.taskId,
      strict: true,
      releaseScope: 'banking',
    },
    {
      ruleId: QUALITY_RULE_IDS.branchReference,
      name: 'branch_id 必须能找到 Branch',
      dimension: 'relationship',
      ruleType: 'reference',
      target: target(QUALITY_TABLES.dwd, partition, 'branch_id'),
      severity: 'critical',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: '账户归属的机构必须存在于 Branch 参考集合，未知机构不能静默进入经营指标。',
      teachingQuestion: '这个机构真的存在吗？',
      schedulerTaskId: dwdTask.taskId,
      strict: true,
      releaseScope: 'banking',
    },
    {
      ruleId: QUALITY_RULE_IDS.batchCompleteness,
      name: '应到 Account 是否全部出现',
      dimension: 'dataset',
      ruleType: 'expected-set',
      target: target(QUALITY_TABLES.snapshot, partition, 'account_id'),
      severity: 'critical',
      threshold: { operator: 'at-most', value: 0, unit: 'accounts' },
      description: '整批检查需要明确的应到账户集合，不能只拿昨天的行数猜今天是否缺数据。',
      teachingQuestion: '应该来的 10000 个账户为什么只来了 7000 个？',
      schedulerTaskId: dwdTask.taskId,
      strict: true,
      releaseScope: 'banking',
    },
    {
      ruleId: QUALITY_RULE_IDS.freshness,
      name: 'snapshot_date 必须追上业务日期',
      dimension: 'freshness',
      ruleType: 'freshness-date',
      target: target(QUALITY_TABLES.dwd, partition, 'snapshot_date'),
      severity: 'high',
      threshold: { operator: 'at-most', value: 0, unit: 'days' },
      description: '检查产出内容代表的日期，而不是再次检查任务何时到达或等待。',
      teachingQuestion: '任务按时完成了，为什么数据还是昨天的？',
      schedulerTaskId: adsTask.taskId,
      strict: true,
      releaseScope: 'banking',
    },
    {
      ruleId: QUALITY_RULE_IDS.reconciliation,
      name: 'DWD / DWS 按同一口径对账',
      dimension: 'reconciliation',
      ruleType: 'reconciliation',
      target: target(QUALITY_TABLES.dws, partition, 'balance'),
      severity: 'critical',
      threshold: {
        operator: 'at-most',
        value: 0,
        unit: 'currency',
        warningRange: 100_000_000,
      },
      description: '相同日期、机构、客户口径、产品和币种下，DWD 重聚合结果要与 DWS 主题一致。',
      teachingQuestion: 'DWD 是 10 亿，DWS 为什么只剩 8 亿？',
      schedulerTaskId: dwsTask.taskId,
      strict: false,
      releaseScope: 'banking',
    },
    {
      ruleId: QUALITY_RULE_IDS.telemetryFormat,
      name: '行为埋点记录格式可解析',
      dimension: 'format',
      ruleType: 'record-format',
      target: target(QUALITY_TABLES.telemetry, partition, 'payload'),
      severity: 'low',
      threshold: { operator: 'at-most', value: 0, unit: 'rows' },
      description: '独立行为记录格式非法时，可以在不改变其他事件含义的前提下隔离。',
      teachingQuestion: '少量独立事件坏了，移除它们会不会改变剩余数据语义？',
      schedulerTaskId: adsTask.taskId,
      strict: true,
      releaseScope: 'telemetry',
    },
  ]
}

export function createQualitySchedulerRun(
  tasks: readonly SchedulerTaskDefinition[],
  businessDate = QUALITY_BUSINESS_DATE,
  scenario: SchedulerScenario = 'happy-path',
  scheduledAt = SCHEDULER_DEFAULT_SCHEDULED_AT,
): SchedulerRunState {
  const scenarioSuffix = scenario === 'upstream-late' ? 'late' : scenario
  const initial = createInitialSchedulerRun(tasks, {
    businessDate,
    scenario,
    scheduledAt,
    runId: `run.bank.deposit.${businessDate.replace(/-/gu, '')}.quality-${scenarioSuffix}.001`,
  })
  const terminal = buildSchedulerTimeline(initial).at(-1)
  if (!terminal || (terminal.status !== 'success' && terminal.status !== 'failed')) {
    throw new Error(`数据质量实验的 Scheduler Run 未能到达终态: ${scenario}`)
  }

  return terminal
}

function cloneRows(rows: readonly QualityBalanceRow[]): QualityBalanceRow[] {
  return rows.map((row) => ({ ...row }))
}

function findRow(rows: readonly QualityBalanceRow[], accountId: string): QualityBalanceRow {
  const row = rows.find((candidate) => candidate.accountId === accountId)
  if (!row) {
    throw new Error(`质量教学数据缺少账户样本: ${accountId}`)
  }
  return row
}

/** Fault injection is pure: every call starts from the same snapshot projection. */
export function getQualityScenarioRows(
  model: QualityBankingModel,
  scenario: QualityScenario,
): QualityBalanceRow[] {
  const rows =
    scenario === 'stale-snapshot'
      ? cloneRows(model.previousSnapshots)
      : cloneRows(model.sourceSnapshots)

  if (scenario === 'duplicate-grain') {
    rows.push({ ...findRow(rows, 'A005') })
  }

  if (scenario === 'missing-required-field') {
    const row = findRow(rows, 'A003')
    row.balance = null
  }

  if (scenario === 'invalid-currency') {
    const row = findRow(rows, 'A004')
    row.currency = '???'
  }

  if (scenario === 'missing-branch-reference') {
    const row = findRow(rows, 'A003')
    row.branch = 'B9999'
    row.balance = 230_000
  }

  if (scenario === 'bank-critical-branch-failure') {
    for (const accountId of ['A003', 'A005', 'A007']) {
      const row = findRow(rows, accountId)
      row.branch = 'B9999'
    }
    findRow(rows, 'A003').balance = 230_000_000
  }

  return rows
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
    outputTable: rule.target.table,
    schedulerOutputTable: task.contract.outputTable,
    scheduledAt: schedulerRun.scheduledAt,
    startedAt: taskRun.startedAt,
    endedAt: taskRun.endedAt,
  }
}

function getDuplicateRows(rows: readonly QualityBalanceRow[]): QualityBalanceRow[] {
  const groups = new Map<string, QualityBalanceRow[]>()
  for (const row of rows) {
    const key = `${row.accountId}|${row.snapshotDate ?? 'NULL'}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return [...groups.values()].flatMap((group) => group.slice(1))
}

function getRuleObservation(
  rule: QualityRuleDefinition,
  model: QualityBankingModel,
  rows: readonly QualityBalanceRow[],
  scenario: QualityScenario,
): QualityObservation {
  if (rule.ruleId === QUALITY_RULE_IDS.grain) {
    const duplicates = getDuplicateRows(rows)
    return {
      expected: 0,
      observed: duplicates.length,
      observedValue: duplicates.length,
      violationCount: duplicates.length,
      evaluatedRowCount: rows.length,
      evidenceKind: 'row',
      detail: `扫描 ${rows.length} 行，按 Account × snapshot_date 分组后发现 ${duplicates.length} 条重复记录。`,
      failedRows: duplicates.length || undefined,
      sample: duplicates[0]
        ? createSample(
            'sample.grain.duplicate.001',
            duplicates[0],
            '同一个账户同一天出现了第二条余额状态。',
          )
        : undefined,
    }
  }

  if (rule.ruleId === QUALITY_RULE_IDS.requiredFields) {
    const invalidRows = rows.filter(
      (row) => !row.accountId || !row.snapshotDate || row.balance === null,
    )
    return {
      expected: 0,
      observed: invalidRows.length,
      observedValue: invalidRows.length,
      violationCount: invalidRows.length,
      evaluatedRowCount: rows.length,
      evidenceKind: 'row',
      detail: `account_id、snapshot_date、balance 三个关键字段中有 ${invalidRows.length} 行不完整。`,
      failedRows: invalidRows.length || undefined,
      sample: invalidRows[0]
        ? createSample(
            'sample.required-field.001',
            invalidRows[0],
            '余额状态缺少用于识别账户、日期或金额的关键字段。',
          )
        : undefined,
    }
  }

  if (rule.ruleId === QUALITY_RULE_IDS.currency) {
    const invalidRows = rows.filter((row) => !model.knownCurrencyCodes.includes(row.currency))
    return {
      expected: model.knownCurrencyCodes.join(' / '),
      observed: invalidRows[0]?.currency ?? model.knownCurrencyCodes.join(' / '),
      observedValue: invalidRows.length,
      violationCount: invalidRows.length,
      evaluatedRowCount: rows.length,
      evidenceKind: 'row',
      detail: `currency 允许 ${model.knownCurrencyCodes.join(' / ')}，发现 ${invalidRows.length} 行不符合字段语义。`,
      failedRows: invalidRows.length || undefined,
      sample: invalidRows[0]
        ? createSample(
            'sample.currency.invalid.001',
            invalidRows[0],
            '字段有值，但值不能解释为已登记的币种代码。',
          )
        : undefined,
    }
  }

  if (rule.ruleId === QUALITY_RULE_IDS.branchReference) {
    const invalidRows = rows.filter((row) => !model.knownBranchIds.includes(row.branch))
    return {
      expected: `branch_id ∈ {${model.knownBranchIds.join(', ')}}`,
      observed:
        invalidRows.length > 0 ? (invalidRows[0]?.branch ?? '未知 branch_id') : '全部可关联',
      observedValue: invalidRows.length,
      violationCount: invalidRows.length,
      evaluatedRowCount: rows.length,
      evidenceKind: 'row',
      detail: `Branch 参考集合中没有 ${invalidRows.length} 条记录使用的机构标识。`,
      failedRows: invalidRows.length || undefined,
      sample: invalidRows[0]
        ? createSample(
            'sample.branch-reference.001',
            invalidRows[0],
            'branch_id 在 Branch 参考集合中不存在。',
          )
        : undefined,
    }
  }

  if (rule.ruleId === QUALITY_RULE_IDS.batchCompleteness) {
    const observedCount =
      scenario === 'batch-incomplete'
        ? model.incompleteSnapshotAccountCount
        : model.receivedSnapshotAccountCount
    const missingCount = Math.max(0, model.expectedActiveAccountCount - observedCount)
    return {
      expected: `${model.expectedActiveAccountCount} 个有效 Account`,
      observed: `${observedCount} 个 AccountBalanceSnapshot`,
      observedValue: missingCount,
      violationCount: missingCount,
      evaluatedRowCount: observedCount,
      evidenceKind: 'set',
      detail: `应到集合有 ${model.expectedActiveAccountCount} 个有效 Account，实际快照集合只有 ${observedCount} 个，少了 ${missingCount} 个。`,
      failedRows: missingCount || undefined,
    }
  }

  if (rule.ruleId === QUALITY_RULE_IDS.freshness) {
    const actualDate = scenario === 'stale-snapshot' ? '2026-09-29' : model.targetDate
    const dateDelta = actualDate === model.targetDate ? 0 : 1
    return {
      expected: model.targetDate,
      observed: actualDate,
      observedValue: dateDelta,
      violationCount: dateDelta,
      evaluatedRowCount: rows.length,
      evidenceKind: 'date',
      detail: `business_date 是 ${model.targetDate}，产出内容的 MAX(snapshot_date) 是 ${actualDate}。`,
    }
  }

  if (rule.ruleId === QUALITY_RULE_IDS.reconciliation) {
    const expected = model.reconciliation.expectedDwdBalance
    const observed =
      scenario === 'balance-reconciliation-drift'
        ? model.reconciliation.observedDwsBalance
        : expected
    const delta = observed - expected
    return {
      expected: 'delta = 0',
      observed: `delta = ${delta}`,
      observedValue: Math.abs(delta),
      violationCount: delta === 0 ? 0 : 1,
      evaluatedRowCount: rows.length,
      evidenceKind: 'aggregate',
      detail: `相同业务日期、机构、客户口径、产品和币种下，DWD 重聚合为 ${expected}，DWS 为 ${observed}。`,
    }
  }

  const invalidRecords =
    scenario === 'telemetry-invalid-records' ? model.telemetry.invalidRecords : 0
  return {
    expected: '0 条非法格式记录',
    observed: `${invalidRecords} 条非法格式记录`,
    observedValue: invalidRecords,
    violationCount: invalidRecords,
    evaluatedRowCount: model.telemetry.totalRecords,
    evidenceKind: 'row',
    detail: `共检查 ${model.telemetry.totalRecords} 条独立行为事件，发现 ${invalidRecords} 条 JSON 格式非法。`,
    failedRows: invalidRecords || undefined,
    sample: invalidRecords > 0 ? model.telemetry.sample : undefined,
  }
}

function createSchedulerFailureObservation(context: QualitySchedulerContext): QualityObservation {
  return {
    expected: 'task status = success',
    observed: context.taskStatus,
    observedValue: 1,
    violationCount: 1,
    evaluatedRowCount: 0,
    evidenceKind: 'scheduler',
    detail: `质量检查依赖的 Scheduler task 当前为 ${context.taskStatus}，不能把未成功产出的数据当成通过。`,
    failedRows: 0,
    sample: {
      sampleId: 'sample.scheduler-context.001',
      rowKey: `${context.runId} / ${context.taskId}`,
      values: {
        run_id: context.runId,
        task_id: context.taskId,
        task_status: context.taskStatus,
        output_table: context.outputTable,
      },
      reason: '质量事实保留对应的 Scheduler run、task 和分区上下文。',
    },
  }
}

function getThreshold(
  rule: QualityRuleDefinition,
  overrides: Readonly<Record<string, number>> | undefined,
): QualityThreshold {
  const override = overrides?.[rule.ruleId]
  if (rule.strict || override === undefined) {
    return { ...rule.threshold }
  }

  return { ...rule.threshold, value: Math.max(0, override) }
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

function formatThreshold(threshold: QualityThreshold): string {
  const operator =
    threshold.operator === 'at-most' ? '≤' : threshold.operator === 'at-least' ? '≥' : '='
  const unit =
    threshold.unit === 'currency'
      ? `¥${threshold.value}`
      : threshold.unit === 'days'
        ? `${threshold.value} 天`
        : threshold.unit === 'accounts'
          ? `${threshold.value} 个账户`
          : `${threshold.value} 行`
  return `${operator} ${unit}`
}

function createEvidence(
  rule: QualityRuleDefinition,
  observation: QualityObservation,
): QualityEvidence {
  return {
    evidenceId: `evidence.${rule.ruleId}`,
    kind: observation.evidenceKind,
    detail: observation.detail,
    expected: observation.expected,
    observed: observation.observed,
    ...(observation.failedRows === undefined ? {} : { failedRows: observation.failedRows }),
    ...(observation.sample === undefined ? {} : { sample: observation.sample }),
  }
}

function createQualityChecks(
  visualization: DataQualityVisualization,
  schedulerRun: SchedulerRunState,
  scenario: QualityScenario,
  thresholdOverrides: Readonly<Record<string, number>> | undefined,
): QualityCheckResult[] {
  const rows = getQualityScenarioRows(visualization.model, scenario)
  return visualization.rules.map((rule) => {
    const schedulerContext = getSchedulerContext(rule, schedulerRun)
    const threshold = getThreshold(rule, thresholdOverrides)
    const rawObservation = getRuleObservation(rule, visualization.model, rows, scenario)
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
      summary: `${QUALITY_STATUS_LABELS[status]}：观察 ${observation.observed}，期望 ${observation.expected}；阈值 ${formatThreshold(threshold)}。`,
      expected: observation.expected,
      observed: observation.observed,
      observedValue: observation.observedValue,
      violationCount: observation.violationCount,
      evaluatedRowCount: observation.evaluatedRowCount,
      ...(observation.failedRows === undefined ? {} : { failedRows: observation.failedRows }),
      threshold,
      schedulerContext,
      evidence: [createEvidence(rule, observation)],
    }
  })
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

function getRuleIdsByStatus(
  checks: readonly QualityCheckResult[],
  status: QualityCheckStatus,
): string[] {
  return checks.filter((check) => check.status === status).map((check) => check.ruleId)
}

function getCheckCounts(checks: readonly QualityCheckResult[]) {
  return checks.reduce(
    (counts, check) => ({ ...counts, [check.status]: counts[check.status] + 1 }),
    { pass: 0, warn: 0, fail: 0 },
  )
}

function getReleaseOutputs(scope: QualityRuleDefinition['releaseScope']): string[] {
  return scope === 'banking'
    ? [QUALITY_TABLES.dwd, QUALITY_TABLES.dws, QUALITY_TABLES.ads]
    : ['behavior_event_clean_result']
}

function createReleaseDecision(
  checks: readonly QualityCheckResult[],
  rules: readonly QualityRuleDefinition[],
  schedulerRun: SchedulerRunState,
  scenario: QualityScenario,
  action: QualityAction,
  eventIds: readonly string[],
): QualityEvaluation['releaseDecision'] {
  const checkCounts = getCheckCounts(checks)
  const failedRules = checks
    .filter((check) => check.status === 'fail')
    .map((check) => getRuleById(rules, check.ruleId))
  const failedBanking = failedRules.some((rule) => rule.releaseScope === 'banking')
  const failedTelemetry = failedRules.some((rule) => rule.releaseScope === 'telemetry')
  const status =
    failedRules.length === 0
      ? 'released'
      : failedBanking || action === 'block'
        ? 'blocked'
        : 'quarantined'
  const scopes = new Set(failedRules.map((rule) => rule.releaseScope))
  const affectedOutputs = [...scopes].flatMap(getReleaseOutputs)
  const quarantinedSampleCount =
    status === 'quarantined'
      ? checks
          .filter((check) => check.status === 'fail')
          .reduce((count, check) => count + (check.failedRows ?? 0), 0)
      : 0
  const isTelemetryOnly = failedTelemetry && !failedBanking

  return {
    decisionId: `decision.quality.${schedulerRun.runId}.${scenario}`,
    action,
    status,
    isBlocked: status === 'blocked',
    schedulerRunId: schedulerRun.runId,
    businessDate: schedulerRun.businessDate,
    partition: schedulerRun.partition,
    checkCounts,
    eventIds,
    failedRuleIds: getRuleIdsByStatus(checks, 'fail'),
    warningRuleIds: getRuleIdsByStatus(checks, 'warn'),
    affectedOutputs,
    quarantinedSampleCount,
    nextStep: isTelemetryOnly
      ? '隔离独立非法记录，保留告警，再继续处理其余行为事件。'
      : failedRules.length > 0
        ? '修复证据指向的数据，按同一 business_date 重跑，再重新执行质量检查。'
        : '保留本次检查证据，按正常发布流程继续。',
    rationale:
      failedRules.length === 0
        ? checkCounts.warn > 0
          ? '没有 fail；仍有告警，消费方需要看到对应证据。'
          : '所有纳入本次检查的规则均通过。'
        : failedBanking
          ? '存款余额属于银行关键经营数据；已知质量失败时，异常行数多少不能替代业务影响判断。'
          : '行为埋点记录彼此独立，且业务允许少量格式损失，因此可以隔离异常记录并留下告警。',
  }
}

function createQualityEvents(
  checks: readonly QualityCheckResult[],
  rules: readonly QualityRuleDefinition[],
  schedulerRun: SchedulerRunState,
): QualityEvent[] {
  return checks
    .filter((check) => check.status !== 'pass')
    .map((check) => {
      const rule = getRuleById(rules, check.ruleId)
      const sample = check.evidence.find((evidence) => evidence.sample)?.sample
      const event: QualityEvent = {
        eventId: `event.quality.${check.ruleId}`,
        eventType: 'quality-check',
        checkId: check.checkId,
        ruleId: check.ruleId,
        status: check.status,
        ...(rule.severity ? { severity: rule.severity } : {}),
        occurredAt: check.schedulerContext.endedAt ?? schedulerRun.clock,
        businessDate: schedulerRun.businessDate,
        target: rule.target,
        partition: rule.target.partition,
        ...(rule.target.field ? { field: rule.target.field } : {}),
        expected: check.expected,
        observed: check.observed,
        threshold: check.threshold,
        observedValue: check.observedValue,
        ...(check.failedRows === undefined ? {} : { failedRows: check.failedRows }),
        evidence: check.evidence,
        ...(sample === undefined ? {} : { sample }),
        schedulerContext: check.schedulerContext,
      }
      return event
    })
}

const SCENARIO_OPTIONS: Record<QualityLessonMode, readonly QualityScenarioOption[]> = {
  status: [
    {
      id: 'balance-reconciliation-drift',
      label: 'DWD / DWS 对账失败',
      description: '任务成功且 SLA 达标，但相同口径下的余额结果不一致。',
      ruleId: QUALITY_RULE_IDS.reconciliation,
    },
  ],
  rules: [
    {
      id: 'duplicate-grain',
      label: '同一账户同一天重复',
      description: '复制 A005 的余额快照，观察 Grain 规则如何识别重复身份。',
      ruleId: QUALITY_RULE_IDS.grain,
    },
    {
      id: 'missing-required-field',
      label: 'balance 缺失',
      description: '让 A003 缺少余额值，字段有缺失时记录不能可靠使用。',
      ruleId: QUALITY_RULE_IDS.requiredFields,
    },
    {
      id: 'invalid-currency',
      label: 'currency = ???',
      description: '保留值但破坏字段语义，观察有效值集合如何发现问题。',
      ruleId: QUALITY_RULE_IDS.currency,
    },
    {
      id: 'missing-branch-reference',
      label: 'branch_id = B9999',
      description: '账户带着未知机构进入 DWD，检查 Branch 引用关系。',
      ruleId: QUALITY_RULE_IDS.branchReference,
    },
  ],
  dataset: [
    {
      id: 'batch-incomplete',
      label: '应到 10000，实到 7000',
      description: '7000 行自身都可以合法，但明确的应到集合仍然少了 3000 个账户。',
      ruleId: QUALITY_RULE_IDS.batchCompleteness,
    },
    {
      id: 'stale-snapshot',
      label: 'MAX(snapshot_date) 仍是 09-29',
      description: 'Scheduler SUCCESS、SLA MET，但产出内容还停在前一天。',
      ruleId: QUALITY_RULE_IDS.freshness,
    },
    {
      id: 'balance-reconciliation-drift',
      label: 'DWD 10 亿，DWS 8 亿',
      description: '固定同一日期、机构、客户口径、产品和币种后，重新聚合并比较 delta。',
      ruleId: QUALITY_RULE_IDS.reconciliation,
    },
  ],
  evidence: [
    {
      id: 'bank-critical-branch-failure',
      label: '引用完整性：3 条坏行中的一条',
      description: '事件带出 rule、table、partition、field、failed_rows 和 sample。',
      ruleId: QUALITY_RULE_IDS.branchReference,
    },
    {
      id: 'balance-reconciliation-drift',
      label: '对账：只有聚合证据',
      description: '没有坏行样本时，事件直接记录 expected delta 和 observed delta。',
      ruleId: QUALITY_RULE_IDS.reconciliation,
    },
    {
      id: 'stale-snapshot',
      label: 'Freshness：比较两个日期',
      description: '事件记录目标 business_date 与实际 MAX(snapshot_date)。',
      ruleId: QUALITY_RULE_IDS.freshness,
    },
  ],
  release: [
    {
      id: 'bank-critical-branch-failure',
      label: '银行存款余额：已知机构异常',
      description: '3 条 branch_id 无法关联，其中一条余额为 230,000,000。默认阻断发布。',
      ruleId: QUALITY_RULE_IDS.branchReference,
    },
    {
      id: 'telemetry-invalid-records',
      label: '非关键埋点：少量格式非法',
      description: '100 万条独立事件中 3 条 JSON 非法，可以对照隔离条件。',
      ruleId: QUALITY_RULE_IDS.telemetryFormat,
    },
  ],
}

const VISIBLE_RULES: Record<QualityLessonMode, readonly string[]> = {
  status: [QUALITY_RULE_IDS.reconciliation],
  rules: [
    QUALITY_RULE_IDS.grain,
    QUALITY_RULE_IDS.requiredFields,
    QUALITY_RULE_IDS.currency,
    QUALITY_RULE_IDS.branchReference,
  ],
  dataset: [
    QUALITY_RULE_IDS.batchCompleteness,
    QUALITY_RULE_IDS.freshness,
    QUALITY_RULE_IDS.reconciliation,
  ],
  evidence: [
    QUALITY_RULE_IDS.branchReference,
    QUALITY_RULE_IDS.reconciliation,
    QUALITY_RULE_IDS.freshness,
  ],
  release: [QUALITY_RULE_IDS.branchReference, QUALITY_RULE_IDS.telemetryFormat],
}

export function createDataQualityVisualization(
  schedulerRun: SchedulerRunState,
  lessonMode: QualityLessonMode = 'status',
  model: QualityBankingModel = createQualityTeachingModel(),
): DataQualityVisualization {
  return {
    kind: 'data-quality',
    lessonMode,
    targetDate: schedulerRun.businessDate,
    schedulerRun,
    model,
    rules: createQualityRules(schedulerRun),
    scenarios: SCENARIO_OPTIONS[lessonMode],
    defaultScenario: SCENARIO_OPTIONS[lessonMode][0]?.id ?? 'baseline',
    visibleRuleIds: VISIBLE_RULES[lessonMode],
  }
}

export function getQualityScenarioOption(
  visualization: DataQualityVisualization,
  scenario: QualityScenario,
): QualityScenarioOption | undefined {
  return visualization.scenarios.find((option) => option.id === scenario)
}

export function evaluateDataQuality(
  visualization: DataQualityVisualization,
  options: QualityEvaluationOptions = {},
): QualityEvaluation {
  const scenario = options.scenario ?? options.injection ?? visualization.defaultScenario
  const action: QualityAction =
    options.action ?? (scenario === 'telemetry-invalid-records' ? 'quarantine' : 'block')
  const schedulerRun = visualization.schedulerRun
  const rows = getQualityScenarioRows(visualization.model, scenario)
  const checks = createQualityChecks(
    visualization,
    schedulerRun,
    scenario,
    options.thresholdOverrides,
  )
  const eventIds = checks
    .filter((check) => check.status !== 'pass')
    .map((check) => `event.quality.${check.ruleId}`)
  const releaseDecision = createReleaseDecision(
    checks,
    visualization.rules,
    schedulerRun,
    scenario,
    action,
    eventIds,
  )
  const events = createQualityEvents(checks, visualization.rules, schedulerRun)

  return {
    schedulerRun,
    scenario,
    injection: scenario,
    action,
    rows,
    checks,
    events,
    releaseDecision: {
      ...releaseDecision,
      eventIds: events.map((event) => event.eventId),
    },
  }
}
