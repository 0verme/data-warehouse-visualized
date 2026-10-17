/**
 * 依赖链重做专题 · 合成事故 fixture（Phase 1-A）。
 *
 * 教学故事（全部为合成数据，不含真实银行内部信息）：
 * `2026-10-16` 的 ODS_TRANSACTION 当日分区尚未完整到达，但接入任务与完整性校验
 * 都没有拦住它；DWD 交易明细、DWS 商户/渠道汇总已经运行，其中商户汇总仍在运行，
 * ADS 交易报表与两个消费方尚未启动。随后 ODS 被再次修复，平台需要按
 * SQL 血缘 + 调度依赖圈定受影响实例并重做。
 *
 * 无关链路（机构维表 → 机构报表 → 机构消费）必须保持不受影响；`2026-10-15`
 * 的相同任务实例属于另一个业务日期分区，也不得被误伤。
 *
 * 本文件只提供确定性数据；影响分析由 `model.ts` 的纯函数计算。
 */

import type {
  ReprocessingInstanceLog,
  ReprocessingModel,
  ReprocessingTaskDefinition,
  ReprocessingTaskInstance,
  TableRef,
  TaskInstanceState,
} from './types'

export const REPROCESSING_INCIDENT_BUSINESS_DATE = '2026-10-16'
export const REPROCESSING_PREVIOUS_BUSINESS_DATE = '2026-10-15'
export const REPROCESSING_PARTITION_COLUMN = 'business_date'

export const REPROCESSING_TASK_IDS = {
  ingestTransaction: 'ingest.ods-transaction.daily.v2',
  ingestAccount: 'ingest.ods-account.daily.v2',
  ingestCustomer: 'ingest.ods-customer.daily.v2',
  ingestMerchant: 'ingest.ods-merchant.daily.v2',
  checkTransactionCompleteness: 'check.ods-transaction-completeness.daily.v1',
  dwdTransactionDetail: 'transform.dwd-transaction-detail.daily.v3',
  dwsMerchantTransaction: 'transform.dws-merchant-transaction.daily.v3',
  dwsChannelTransaction: 'transform.dws-channel-transaction.daily.v3',
  adsTransactionReport: 'publish.ads-transaction-report.daily.v3',
  consumeTransactionReport: 'consume.transaction-report.push.v1',
  deliverTransactionFile: 'deliver.transaction-file.daily.v1',
  ingestBranch: 'prepare.branch.daily.v1',
  dimBranch: 'transform.dim-branch.daily.v2',
  adsBranchReport: 'publish.ads-branch-report.daily.v2',
  consumeBranchReport: 'consume.branch-report.push.v1',
} as const

function businessTable(name: string): TableRef {
  return { table: name, partitionColumn: REPROCESSING_PARTITION_COLUMN }
}

export const REPROCESSING_TABLES = {
  odsTransaction: businessTable('ods_transaction'),
  odsAccount: businessTable('ods_account'),
  odsCustomer: businessTable('ods_customer'),
  odsMerchant: businessTable('ods_merchant'),
  odsTransactionArrivalControl: businessTable('ods_transaction_arrival_control'),
  odsTransactionCheck: businessTable('ods_transaction_check'),
  dwdTransactionDetail: businessTable('dwd_transaction_detail'),
  dwsMerchantTransaction: businessTable('dws_merchant_transaction_daily'),
  dwsChannelTransaction: businessTable('dws_channel_transaction_daily'),
  adsTransactionReport: businessTable('ads_transaction_report'),
  odsBranch: businessTable('ods_branch'),
  dimBranch: businessTable('dim_branch'),
  adsBranchReport: businessTable('ads_branch_management_report'),
} as const

/**
 * 任务定义。`reads` 是 SQL 读血缘（含 LEFT JOIN），`dependsOn` 是实际
 * Job / Plan 调度依赖；两者相互独立，由影响分析取并集。
 */
export const reprocessingTaskDefinitions: readonly ReprocessingTaskDefinition[] = [
  {
    taskId: REPROCESSING_TASK_IDS.ingestTransaction,
    label: '接入 ODS_TRANSACTION 当日分区',
    layer: 'ods',
    reads: [],
    writes: [REPROCESSING_TABLES.odsTransaction],
    dependsOn: [],
  },
  {
    taskId: REPROCESSING_TASK_IDS.ingestAccount,
    label: '接入 ODS_ACCOUNT 当日分区',
    layer: 'ods',
    reads: [],
    writes: [REPROCESSING_TABLES.odsAccount],
    dependsOn: [],
  },
  {
    taskId: REPROCESSING_TASK_IDS.ingestCustomer,
    label: '接入 ODS_CUSTOMER 当日分区',
    layer: 'ods',
    reads: [],
    writes: [REPROCESSING_TABLES.odsCustomer],
    dependsOn: [],
  },
  {
    taskId: REPROCESSING_TASK_IDS.ingestMerchant,
    label: '接入 ODS_MERCHANT 当日分区',
    layer: 'ods',
    reads: [],
    writes: [REPROCESSING_TABLES.odsMerchant],
    dependsOn: [],
  },
  {
    taskId: REPROCESSING_TASK_IDS.checkTransactionCompleteness,
    label: '校验 ODS_TRANSACTION 当日分区完整性',
    layer: 'ods',
    reads: [
      {
        ...REPROCESSING_TABLES.odsTransactionArrivalControl,
        transform: 'select',
        notes: '只读取控制表登记的到达文件，不直接读取交易明细。',
      },
    ],
    writes: [REPROCESSING_TABLES.odsTransactionCheck],
    // 这里是“调度依赖但无 SQL 血缘”的传播路径：控制表没有被污染，
    // 但校验任务依赖接入任务，接入重做时它也必须重做。
    dependsOn: [REPROCESSING_TASK_IDS.ingestTransaction],
  },
  {
    taskId: REPROCESSING_TASK_IDS.dwdTransactionDetail,
    label: 'DWD 交易明细加工',
    layer: 'dwd',
    reads: [
      { ...REPROCESSING_TABLES.odsTransaction, transform: 'select' },
      { ...REPROCESSING_TABLES.odsAccount, transform: 'join' },
      { ...REPROCESSING_TABLES.odsCustomer, transform: 'join' },
    ],
    writes: [REPROCESSING_TABLES.dwdTransactionDetail],
    dependsOn: [
      REPROCESSING_TASK_IDS.ingestTransaction,
      REPROCESSING_TASK_IDS.ingestAccount,
      REPROCESSING_TASK_IDS.ingestCustomer,
    ],
  },
  {
    taskId: REPROCESSING_TASK_IDS.dwsMerchantTransaction,
    label: 'DWS 商户交易汇总（LEFT JOIN 商户）',
    layer: 'dws',
    reads: [
      { ...REPROCESSING_TABLES.dwdTransactionDetail, transform: 'aggregate' },
      {
        ...REPROCESSING_TABLES.odsMerchant,
        transform: 'left-join',
        notes: '商户资料缺失不阻断交易汇总，但商户数据被污染时仍属于同一血缘链。',
      },
    ],
    writes: [REPROCESSING_TABLES.dwsMerchantTransaction],
    dependsOn: [REPROCESSING_TASK_IDS.dwdTransactionDetail, REPROCESSING_TASK_IDS.ingestMerchant],
  },
  {
    taskId: REPROCESSING_TASK_IDS.dwsChannelTransaction,
    label: 'DWS 渠道交易汇总',
    layer: 'dws',
    reads: [{ ...REPROCESSING_TABLES.dwdTransactionDetail, transform: 'aggregate' }],
    writes: [REPROCESSING_TABLES.dwsChannelTransaction],
    dependsOn: [REPROCESSING_TASK_IDS.dwdTransactionDetail],
  },
  {
    taskId: REPROCESSING_TASK_IDS.adsTransactionReport,
    label: 'ADS 交易经营报表（两支汇合）',
    layer: 'ads',
    reads: [
      { ...REPROCESSING_TABLES.dwsMerchantTransaction, transform: 'union' },
      { ...REPROCESSING_TABLES.dwsChannelTransaction, transform: 'union' },
    ],
    writes: [REPROCESSING_TABLES.adsTransactionReport],
    dependsOn: [
      REPROCESSING_TASK_IDS.dwsMerchantTransaction,
      REPROCESSING_TASK_IDS.dwsChannelTransaction,
    ],
  },
  {
    taskId: REPROCESSING_TASK_IDS.consumeTransactionReport,
    label: '消费方 · 交易报表推送',
    layer: 'consumer',
    reads: [{ ...REPROCESSING_TABLES.adsTransactionReport, transform: 'select' }],
    writes: [],
    dependsOn: [REPROCESSING_TASK_IDS.adsTransactionReport],
  },
  {
    taskId: REPROCESSING_TASK_IDS.deliverTransactionFile,
    label: '消费方 · 交易文件投递',
    layer: 'consumer',
    reads: [{ ...REPROCESSING_TABLES.adsTransactionReport, transform: 'select' }],
    writes: [],
    dependsOn: [REPROCESSING_TASK_IDS.adsTransactionReport],
  },
  {
    taskId: REPROCESSING_TASK_IDS.ingestBranch,
    label: '接入 ODS_BRANCH 当日分区',
    layer: 'ods',
    reads: [],
    writes: [REPROCESSING_TABLES.odsBranch],
    dependsOn: [],
  },
  {
    taskId: REPROCESSING_TASK_IDS.dimBranch,
    label: '机构维表加工',
    layer: 'dwd',
    reads: [{ ...REPROCESSING_TABLES.odsBranch, transform: 'select' }],
    writes: [REPROCESSING_TABLES.dimBranch],
    dependsOn: [REPROCESSING_TASK_IDS.ingestBranch],
  },
  {
    taskId: REPROCESSING_TASK_IDS.adsBranchReport,
    label: 'ADS 机构经营报表',
    layer: 'ads',
    reads: [{ ...REPROCESSING_TABLES.dimBranch, transform: 'aggregate' }],
    writes: [REPROCESSING_TABLES.adsBranchReport],
    dependsOn: [REPROCESSING_TASK_IDS.dimBranch],
  },
  {
    taskId: REPROCESSING_TASK_IDS.consumeBranchReport,
    label: '消费方 · 机构报表订阅',
    layer: 'consumer',
    reads: [{ ...REPROCESSING_TABLES.adsBranchReport, transform: 'select' }],
    writes: [],
    dependsOn: [REPROCESSING_TASK_IDS.adsBranchReport],
  },
]

export const REPROCESSING_SOURCE_TASK_ID = REPROCESSING_TASK_IDS.ingestTransaction
export const REPROCESSING_SOURCE_INSTANCE_ID = `${REPROCESSING_SOURCE_TASK_ID}@${REPROCESSING_INCIDENT_BUSINESS_DATE}`

type IncidentVariant = 'mid-flight' | 'completed'

export interface CreateReprocessingFixtureOptions {
  /**
   * `mid-flight`（默认）：事故仍在进行，商户汇总运行中，ADS 与消费方未启动。
   * `completed`：事故日整条链路已全部 SUCCESS，用于验证“已执行就必须重做”。
   */
  variant?: IncidentVariant
}

const INCIDENT_MID_FLIGHT_STATES: Readonly<Record<string, TaskInstanceState>> = {
  [REPROCESSING_TASK_IDS.ingestTransaction]: 'success',
  [REPROCESSING_TASK_IDS.ingestAccount]: 'success',
  [REPROCESSING_TASK_IDS.ingestCustomer]: 'success',
  [REPROCESSING_TASK_IDS.ingestMerchant]: 'success',
  [REPROCESSING_TASK_IDS.checkTransactionCompleteness]: 'success',
  [REPROCESSING_TASK_IDS.dwdTransactionDetail]: 'success',
  [REPROCESSING_TASK_IDS.dwsMerchantTransaction]: 'running',
  [REPROCESSING_TASK_IDS.dwsChannelTransaction]: 'success',
  [REPROCESSING_TASK_IDS.adsTransactionReport]: 'waiting',
  [REPROCESSING_TASK_IDS.consumeTransactionReport]: 'waiting',
  [REPROCESSING_TASK_IDS.deliverTransactionFile]: 'waiting',
  [REPROCESSING_TASK_IDS.ingestBranch]: 'success',
  [REPROCESSING_TASK_IDS.dimBranch]: 'success',
  [REPROCESSING_TASK_IDS.adsBranchReport]: 'success',
  [REPROCESSING_TASK_IDS.consumeBranchReport]: 'success',
}

function normalizeTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

/**
 * 确定性执行日志：只使用时分秒，不引入轮次 / generation。
 * 未首次执行（waiting / ready / blocked / skipped）的实例没有执行日志。
 */
function buildLogs(
  businessDate: string,
  state: TaskInstanceState,
  taskIndex: number,
): readonly ReprocessingInstanceLog[] {
  const startHour = 1 + Math.floor(taskIndex / 3)
  const scheduledAt = `${businessDate} ${normalizeTime(startHour, 0)}`
  const startedAt = `${businessDate} ${normalizeTime(startHour, 5)}`
  const endedAt = `${businessDate} ${normalizeTime(startHour, 12)}`
  const logs: ReprocessingInstanceLog[] = []

  if (state === 'waiting' || state === 'ready' || state === 'blocked' || state === 'skipped') {
    return logs
  }

  logs.push({
    loggedAt: scheduledAt,
    event: 'scheduled',
    detail: '正常调度实例进入队列',
    source: 'normal-schedule',
  })
  logs.push({
    loggedAt: startedAt,
    event: 'started',
    detail: '任务开始执行',
    source: 'normal-schedule',
  })

  if (state === 'success') {
    logs.push({
      loggedAt: endedAt,
      event: 'succeeded',
      detail: '任务实例执行完成',
      source: 'normal-schedule',
    })
  }
  if (state === 'failed') {
    logs.push({
      loggedAt: endedAt,
      event: 'failed',
      detail: '任务实例执行失败，按正常生产故障流程处理',
      source: 'normal-schedule',
    })
  }
  if (state === 'stopping') {
    logs.push({
      loggedAt: endedAt,
      event: 'stop-requested',
      detail: '收到停止请求，等待确认停止与副作用处置',
      source: 'normal-schedule',
    })
  }
  if (state === 'stopped') {
    logs.push({
      loggedAt: endedAt,
      event: 'stopped',
      detail: '停止已确认，等待重做调度',
      source: 'normal-schedule',
    })
  }

  return logs
}

function createInstance(
  taskId: string,
  businessDate: string,
  state: TaskInstanceState,
  taskIndex: number,
): ReprocessingTaskInstance {
  return {
    instanceId: `${taskId}@${businessDate}`,
    taskId,
    businessDate,
    partition: { column: REPROCESSING_PARTITION_COLUMN, value: businessDate },
    state,
    source: 'normal-schedule',
    logs: buildLogs(businessDate, state, taskIndex),
  }
}

/**
 * 构造事故 fixture：
 * - 事故日 `2026-10-16` 采用 `variant` 指定的状态；
 * - 前一日 `2026-10-15` 全链路 SUCCESS，用于验证分区隔离。
 */
export function createReprocessingFixture(
  options: CreateReprocessingFixtureOptions = {},
): ReprocessingModel {
  const variant = options.variant ?? 'mid-flight'
  const incidentStates: Record<string, TaskInstanceState> = { ...INCIDENT_MID_FLIGHT_STATES }

  if (variant === 'completed') {
    incidentStates[REPROCESSING_TASK_IDS.dwsMerchantTransaction] = 'success'
    incidentStates[REPROCESSING_TASK_IDS.adsTransactionReport] = 'success'
    incidentStates[REPROCESSING_TASK_IDS.consumeTransactionReport] = 'success'
    incidentStates[REPROCESSING_TASK_IDS.deliverTransactionFile] = 'success'
  }

  const instances: ReprocessingTaskInstance[] = []
  reprocessingTaskDefinitions.forEach((task, taskIndex) => {
    const incidentState = incidentStates[task.taskId]
    if (!incidentState) {
      throw new Error(`fixture 缺少任务 ${task.taskId} 的事故日状态`)
    }
    instances.push(
      createInstance(task.taskId, REPROCESSING_INCIDENT_BUSINESS_DATE, incidentState, taskIndex),
      createInstance(task.taskId, REPROCESSING_PREVIOUS_BUSINESS_DATE, 'success', taskIndex),
    )
  })

  return {
    tasks: reprocessingTaskDefinitions,
    instances,
  }
}
