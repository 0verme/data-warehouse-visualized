import type {
  SchedulerLayer,
  SchedulerLessonFocus,
  SchedulerTaskDefinition,
  SchedulerTaskReferences,
  SchedulerVisualization,
} from './types'
import type { TransformationTaskContract } from '../sql-transformation/types'

export const BANKING_DEPOSIT_BALANCE_DATE = '2026-09-30'
export const BANKING_SCHEDULER_SCHEDULED_AT = '2026-10-01 02:00'
export const BANKING_DEPOSIT_BALANCE_EXPECTED_ARRIVAL_AT = '2026-10-01 01:30'
export const BANKING_DEPOSIT_BALANCE_ARRIVAL_AT = '2026-10-01 02:20'
export const BANKING_DEPOSIT_BALANCE_FTP_ARRIVAL_AT = '2026-10-01 02:07'
export const BANKING_DEPOSIT_BALANCE_FTP_DETECTED_AT = '2026-10-01 02:30'
export const BANKING_DEPOSIT_BALANCE_SLA_AT = '2026-10-01 07:30'
export const BANKING_DEPOSIT_BALANCE_RESULT_LABEL = '杭州分行 · 小微口径 · 人民币 · 定期'

export const BANKING_SCHEDULER_TASK_IDS = {
  accountBalanceSnapshot: 'prepare.account-balance-snapshot.daily.v1',
  account: 'prepare.account.daily.v1',
  customer: 'prepare.customer.daily.v1',
  product: 'prepare.product.daily.v1',
  branch: 'prepare.branch.daily.v1',
  dwd: 'transform.deposit-balance.detail.daily.v1',
  dws: 'transform.deposit-balance.topic.daily.v1',
  ads: 'publish.deposit-balance.result.daily.v1',
} as const

export const BANKING_SCHEDULER_TASK_REFERENCES: SchedulerTaskReferences = {
  dwd: BANKING_SCHEDULER_TASK_IDS.dwd,
  dws: BANKING_SCHEDULER_TASK_IDS.dws,
  ads: BANKING_SCHEDULER_TASK_IDS.ads,
  lateInput: BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot,
  failure: BANKING_SCHEDULER_TASK_IDS.dwd,
}

export interface DepositBalancePreviewRow {
  branchName: string
  customerSegment: string
  currency: string
  productName: string
  snapshotDate: string
  balance: number
}

export const depositBalancePreviewRows: readonly DepositBalancePreviewRow[] = [
  {
    branchName: '杭州分行',
    customerSegment: '小微口径',
    currency: '人民币',
    productName: '定期',
    snapshotDate: BANKING_DEPOSIT_BALANCE_DATE,
    balance: 1_000_000,
  },
]

export const lateDepositBalancePreviewRow: DepositBalancePreviewRow = {
  branchName: '杭州分行',
  customerSegment: '小微口径',
  currency: '人民币',
  productName: '定期',
  snapshotDate: BANKING_DEPOSIT_BALANCE_DATE,
  balance: 200_000,
}

export const bankingDepositBalanceTaskContract: TransformationTaskContract = {
  taskId: 'transform.deposit-balance.topic.daily.v1',
  inputTables: ['AccountBalanceSnapshot', 'Account', 'Customer', 'Product', 'Branch'],
  outputTable: 'dws_deposit_balance_daily',
  outputGrain: 'snapshot_date × branch × customer_scope × product_type × currency',
  businessDate: BANKING_DEPOSIT_BALANCE_DATE,
  repeatExecution: '同样的输入和业务日期再次执行，目标分区结果应保持一致，不重复累加余额。',
  partition: {
    column: 'snapshot_date',
    value: BANKING_DEPOSIT_BALANCE_DATE,
  },
  dependencies: ['AccountBalanceSnapshot', 'Account', 'Customer', 'Product', 'Branch'],
  isIdempotent: true,
  supportsPartialRerun: true,
  rerunHint:
    '按业务日期重跑 snapshot_date = 2026-09-30；数据到达日是 2026-10-01，不是新的业务分区。',
}

function createTaskContract(
  taskId: string,
  inputTables: readonly string[],
  outputTable: string,
  dependencies: readonly string[],
): TransformationTaskContract {
  return {
    taskId,
    inputTables,
    outputTable,
    outputGrain: '由任务输出表声明的存款余额粒度',
    businessDate: BANKING_DEPOSIT_BALANCE_DATE,
    repeatExecution: '同样的输入和业务日期再次执行，目标分区结果应保持一致，不重复累加余额。',
    partition: bankingDepositBalanceTaskContract.partition,
    dependencies,
    isIdempotent: true,
    supportsPartialRerun: true,
    rerunHint: bankingDepositBalanceTaskContract.rerunHint,
  }
}

function createInputTask(
  taskId: string,
  label: string,
  sourceTable: string,
  description: string,
  outputTable: string,
): SchedulerTaskDefinition {
  return {
    taskId,
    label,
    layer: 'ods',
    description,
    dependsOn: [],
    contract: createTaskContract(taskId, [sourceTable], outputTable, [sourceTable]),
    durationMinutes: taskId === BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot ? 1 : 2,
    maxAttempts: 1,
    slaMinutes: 330,
  }
}

export function createBankingSchedulerTasks(
  taskContract: TransformationTaskContract = bankingDepositBalanceTaskContract,
): SchedulerTaskDefinition[] {
  const sourceTasks = [
    createInputTask(
      BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot,
      '日终余额快照到达',
      'AccountBalanceSnapshot',
      '提供 2026-09-30 各账户的日终余额；快照日期属于业务日期。',
      'ods_account_balance_snapshot',
    ),
    createInputTask(
      BANKING_SCHEDULER_TASK_IDS.account,
      '账户资料准备',
      'Account',
      '提供账户与客户、机构、产品的关联信息。',
      'ods_account',
    ),
    createInputTask(
      BANKING_SCHEDULER_TASK_IDS.customer,
      '客户资料准备',
      'Customer',
      '提供客户口径和客户属性，供余额主题按业务口径观察。',
      'ods_customer',
    ),
    createInputTask(
      BANKING_SCHEDULER_TASK_IDS.product,
      '产品资料准备',
      'Product',
      '提供存款产品属性，区分定期等产品观察角度。',
      'ods_product',
    ),
    createInputTask(
      BANKING_SCHEDULER_TASK_IDS.branch,
      '机构资料准备',
      'Branch',
      '提供机构归属，支持按杭州分行等组织口径查看余额。',
      'ods_branch',
    ),
  ]

  const sourceTableNames = [...taskContract.inputTables]
  const dwdTask: SchedulerTaskDefinition = {
    taskId: BANKING_SCHEDULER_TASK_IDS.dwd,
    label: 'DWD 存款余额明细',
    layer: 'dwd',
    description: '把五份当天所需输入对齐到账户余额明细，沿用第 05 章已经确定的加工结果。',
    dependsOn: sourceTasks.map((task) => task.taskId),
    contract: createTaskContract(
      BANKING_SCHEDULER_TASK_IDS.dwd,
      sourceTableNames,
      'dwd_deposit_account_balance',
      sourceTableNames,
    ),
    durationMinutes: 8,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  const dwsTask: SchedulerTaskDefinition = {
    taskId: BANKING_SCHEDULER_TASK_IDS.dws,
    label: 'DWS 存款余额主题',
    layer: 'dws',
    description: '按日期、机构、客户口径、产品和币种汇总存款余额主题。',
    dependsOn: [BANKING_SCHEDULER_TASK_IDS.dwd],
    contract: taskContract,
    durationMinutes: 5,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  const adsTask: SchedulerTaskDefinition = {
    taskId: BANKING_SCHEDULER_TASK_IDS.ads,
    label: 'ADS 发布经营分析结果',
    layer: 'ads',
    description: '把 DWS 结果发布给经营分析使用；本节不重新计算余额口径。',
    dependsOn: [BANKING_SCHEDULER_TASK_IDS.dws],
    contract: createTaskContract(
      BANKING_SCHEDULER_TASK_IDS.ads,
      [taskContract.outputTable],
      'ads_deposit_balance_result',
      [taskContract.outputTable],
    ),
    durationMinutes: 2,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  return [...sourceTasks, dwdTask, dwsTask, adsTask]
}

const bankingTasks = createBankingSchedulerTasks()

export const bankingSchedulerVisualization: SchedulerVisualization = {
  kind: 'scheduler',
  targetDate: BANKING_DEPOSIT_BALANCE_DATE,
  tasks: bankingTasks,
  taskContract: bankingDepositBalanceTaskContract,
  outputPreview: {
    beforeLateRows: depositBalancePreviewRows.length,
    beforeLateAmount: depositBalancePreviewRows.reduce((sum, row) => sum + row.balance, 0),
    afterLateRows: depositBalancePreviewRows.length,
    afterLateAmount:
      depositBalancePreviewRows.reduce((sum, row) => sum + row.balance, 0) +
      lateDepositBalancePreviewRow.balance,
  },
  lateDataArrivalAt: BANKING_DEPOSIT_BALANCE_ARRIVAL_AT,
  lateBusinessDate: BANKING_DEPOSIT_BALANCE_DATE,
  scheduledAt: BANKING_SCHEDULER_SCHEDULED_AT,
  deliverySlaAt: BANKING_DEPOSIT_BALANCE_SLA_AT,
  taskReferences: BANKING_SCHEDULER_TASK_REFERENCES,
}

export function createBankingSchedulerVisualization(
  lessonFocus: SchedulerLessonFocus,
): SchedulerVisualization {
  return { ...bankingSchedulerVisualization, lessonFocus }
}

export const BANKING_SCHEDULER_LAYER_LABELS: Record<SchedulerLayer, string> = {
  ods: '输入准备',
  dwd: '账户余额明细',
  dws: '余额主题',
  ads: '指标结果',
}
