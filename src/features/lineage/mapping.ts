import { BANKING_LINEAGE_NODE_IDS, BANKING_LINEAGE_TASK_NODE_IDS } from './banking'
import { BANKING_SCHEDULER_TASK_IDS } from '../scheduler/banking'
import { SCHEDULER_TASK_IDS } from '../../utils/scheduler'

/** Stable mapping from Scheduler identities to lineage task nodes. */
export const LINEAGE_TASK_NODE_IDS: Readonly<Record<string, string>> = {
  [SCHEDULER_TASK_IDS.odsOrders]: 'task-load-order',
  [SCHEDULER_TASK_IDS.dwd]: 'task-build-order-detail',
  [SCHEDULER_TASK_IDS.dws]: 'task-build-sales',
  [SCHEDULER_TASK_IDS.ads]: 'task-publish-report',
  [BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot]:
    BANKING_LINEAGE_TASK_NODE_IDS.accountBalanceSnapshot,
  [BANKING_SCHEDULER_TASK_IDS.account]: BANKING_LINEAGE_TASK_NODE_IDS.account,
  [BANKING_SCHEDULER_TASK_IDS.customer]: BANKING_LINEAGE_TASK_NODE_IDS.customer,
  [BANKING_SCHEDULER_TASK_IDS.product]: BANKING_LINEAGE_TASK_NODE_IDS.product,
  [BANKING_SCHEDULER_TASK_IDS.branch]: BANKING_LINEAGE_TASK_NODE_IDS.branch,
  [BANKING_SCHEDULER_TASK_IDS.dwd]: BANKING_LINEAGE_TASK_NODE_IDS.dwd,
  [BANKING_SCHEDULER_TASK_IDS.dws]: BANKING_LINEAGE_TASK_NODE_IDS.dws,
  [BANKING_SCHEDULER_TASK_IDS.ads]: BANKING_LINEAGE_TASK_NODE_IDS.ads,
}

/** Quality targets use the same table names as their owning lesson's chain. */
export const LINEAGE_TABLE_NODE_IDS: Readonly<Record<string, string>> = {
  dwd_order_item: 'dwd-order-detail',
  dws_sales_daily: 'dws-sales',
  ads_yesterday_sales: 'ads-report',
  AccountBalanceSnapshot: BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
  Account: BANKING_LINEAGE_NODE_IDS.account,
  Customer: BANKING_LINEAGE_NODE_IDS.customer,
  Product: BANKING_LINEAGE_NODE_IDS.product,
  Branch: BANKING_LINEAGE_NODE_IDS.branch,
  dwd_account_balance_detail: BANKING_LINEAGE_NODE_IDS.dwd,
  dws_deposit_balance_daily: BANKING_LINEAGE_NODE_IDS.dws,
  ads_deposit_balance: BANKING_LINEAGE_NODE_IDS.ads,
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
