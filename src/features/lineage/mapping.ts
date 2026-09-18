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
