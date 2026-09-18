import { BANKING_SCHEDULER_TASK_IDS } from '../scheduler/banking'
import { BANKING_LINEAGE_NODE_IDS, BANKING_LINEAGE_TASK_NODE_IDS } from './banking'

/** Scheduler identity → canonical Banking Teaching Domain lineage task node. */
export const LINEAGE_TASK_NODE_IDS: Readonly<Record<string, string>> = {
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

/** Current main's pre-PR72 banking graph remains available to production adapters. */
export const LEGACY_BANKING_LINEAGE_TASK_NODE_IDS: Readonly<Record<string, string>> = {
  [BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.account]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.customer]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.product]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.branch]: 'task-load-balance',
  [BANKING_SCHEDULER_TASK_IDS.dwd]: 'task-build-deposit-detail',
  [BANKING_SCHEDULER_TASK_IDS.dws]: 'task-build-deposit-topic',
  [BANKING_SCHEDULER_TASK_IDS.ads]: 'task-publish-deposit-balance',
}

/** The preserved e-commerce lineage fixture is keyed by current Scheduler task IDs. */
export const LEGACY_ECOMMERCE_LINEAGE_TASK_NODE_IDS: Readonly<Record<string, string>> = {
  [BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot]: 'task-load-order',
  [BANKING_SCHEDULER_TASK_IDS.account]: 'task-load-order',
  [BANKING_SCHEDULER_TASK_IDS.customer]: 'task-load-order',
  [BANKING_SCHEDULER_TASK_IDS.product]: 'task-load-order',
  [BANKING_SCHEDULER_TASK_IDS.branch]: 'task-load-order',
  [BANKING_SCHEDULER_TASK_IDS.dwd]: 'task-build-order-detail',
  [BANKING_SCHEDULER_TASK_IDS.dws]: 'task-build-sales',
  [BANKING_SCHEDULER_TASK_IDS.ads]: 'task-publish-report',
}

/** Quality targets use the canonical Banking Teaching Domain lineage graph. */
export const LINEAGE_TABLE_NODE_IDS: Readonly<Record<string, string>> = {
  AccountBalanceSnapshot: BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
  Account: BANKING_LINEAGE_NODE_IDS.account,
  Customer: BANKING_LINEAGE_NODE_IDS.customer,
  Product: BANKING_LINEAGE_NODE_IDS.product,
  Branch: BANKING_LINEAGE_NODE_IDS.branch,
  account_balance_snapshot: BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
  dwd_deposit_balance_detail: BANKING_LINEAGE_NODE_IDS.dwd,
  dwd_deposit_account_balance: BANKING_LINEAGE_NODE_IDS.dwd,
  dws_deposit_balance_daily: BANKING_LINEAGE_NODE_IDS.dws,
  dws_deposit_balance_daily_staging: BANKING_LINEAGE_NODE_IDS.dws,
  ads_deposit_balance: BANKING_LINEAGE_NODE_IDS.ads,
  ads_deposit_balance_daily: BANKING_LINEAGE_NODE_IDS.ads,
  ads_deposit_balance_metric: BANKING_LINEAGE_NODE_IDS.metric,
  ods_behavior_event: BANKING_LINEAGE_NODE_IDS.ads,
  /** Legacy e-commerce table names remain mapped to the preserved legacy graph. */
  dwd_order_item: 'dwd-order-detail',
  dws_sales_daily: 'dws-sales',
  ads_yesterday_sales: 'ads-report',
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
