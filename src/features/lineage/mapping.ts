import { BANKING_SCHEDULER_TASK_IDS } from '../scheduler/banking'
import { LEGACY_SCHEDULER_TASK_IDS, SCHEDULER_TASK_IDS } from '../../utils/scheduler'

/** Scheduler identity → 血缘任务节点；兼容第 05/06 章的两套任务标识。 */
export const LINEAGE_TASK_NODE_IDS: Readonly<Record<string, string>> = {
  [SCHEDULER_TASK_IDS.accountBalanceSnapshot]: 'task-load-balance',
  [SCHEDULER_TASK_IDS.account]: 'task-load-balance',
  [SCHEDULER_TASK_IDS.customer]: 'task-load-balance',
  [SCHEDULER_TASK_IDS.product]: 'task-load-balance',
  [SCHEDULER_TASK_IDS.branch]: 'task-load-balance',
  [SCHEDULER_TASK_IDS.dwd]: 'task-build-deposit-detail',
  [SCHEDULER_TASK_IDS.dws]: 'task-build-deposit-topic',
  [SCHEDULER_TASK_IDS.ads]: 'task-publish-deposit-balance',
  [BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.account]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.customer]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.product]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.branch]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.dwd]: 'task-build-deposit-detail',
  [BANKING_SCHEDULER_TASK_IDS.dws]: 'task-build-deposit-topic',
  [BANKING_SCHEDULER_TASK_IDS.ads]: 'task-publish-deposit-balance',
  [LEGACY_SCHEDULER_TASK_IDS.odsOrders]: 'task-load-balance',
  [LEGACY_SCHEDULER_TASK_IDS.odsOrderItems]: 'task-load-balance',
  [LEGACY_SCHEDULER_TASK_IDS.odsUsers]: 'task-load-balance',
  [LEGACY_SCHEDULER_TASK_IDS.odsPayments]: 'task-load-balance',
  [LEGACY_SCHEDULER_TASK_IDS.odsRefunds]: 'task-load-balance',
  [LEGACY_SCHEDULER_TASK_IDS.dwd]: 'task-build-deposit-detail',
  [LEGACY_SCHEDULER_TASK_IDS.dws]: 'task-build-deposit-topic',
  [LEGACY_SCHEDULER_TASK_IDS.ads]: 'task-publish-deposit-balance',
}

/** Quality targets use the current Banking Teaching Domain lineage graph through compatibility maps. */
export const LINEAGE_TABLE_NODE_IDS: Readonly<Record<string, string>> = {
  account_balance_snapshot: 'ods-account-balance',
  dwd_deposit_balance_detail: 'dwd-deposit-balance',
  dwd_deposit_account_balance: 'dwd-deposit-balance',
  dws_deposit_balance_daily: 'dws-deposit-balance',
  dws_deposit_balance_daily_staging: 'dws-deposit-balance',
  ads_deposit_balance_daily: 'ads-deposit-balance',
  ads_deposit_balance_metric: 'ads-deposit-balance',
  ods_behavior_event: 'ads-deposit-balance',
  /** Legacy table names remain mapped during migration. */
  dwd_order_item: 'dwd-deposit-balance',
  dws_sales_daily: 'dws-deposit-balance',
  ads_yesterday_sales: 'ads-deposit-balance',
}

export function getLineageTaskNodeId(taskId: string): string {
  const nodeId = LINEAGE_TASK_NODE_IDS[taskId]
  if (!nodeId) {
    throw new Error(`血缘映射没有为 Scheduler task 配置节点: ${taskId}`)
  }

  return nodeId
}

export function getLineageTableNodeId(tableName: string): string {
  const nodeId = LINEAGE_TABLE_NODE_IDS[tableName]
  if (!nodeId) {
    throw new Error(`血缘映射没有为质量目标表配置节点: ${tableName}`)
  }

  return nodeId
}
