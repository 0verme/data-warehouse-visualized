import { SCHEDULER_TASK_IDS } from '../../utils/scheduler'

/** Scheduler identity → 血缘任务节点；只登记第 05/06 章真实的生产任务。 */
export const LINEAGE_TASK_NODE_IDS: Readonly<Record<string, string>> = {
  [SCHEDULER_TASK_IDS.accountBalanceSnapshot]: 'task-load-balance',
  [SCHEDULER_TASK_IDS.dwd]: 'task-build-deposit-detail',
  [SCHEDULER_TASK_IDS.dws]: 'task-build-deposit-topic',
  [SCHEDULER_TASK_IDS.ads]: 'task-publish-deposit-balance',
}

/** Quality targets use the same table names as the SQL and Scheduler lesson chain. */
export const LINEAGE_TABLE_NODE_IDS: Readonly<Record<string, string>> = {
  dwd_deposit_balance_detail: 'dwd-deposit-balance',
  dws_deposit_balance_daily: 'dws-deposit-balance',
  dws_deposit_balance_daily_staging: 'dws-deposit-balance',
  ads_deposit_balance_daily: 'ads-deposit-balance',
  /** Legacy table names remain mapped for external quality events during migration. */
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
