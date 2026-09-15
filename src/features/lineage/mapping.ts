import { SCHEDULER_TASK_IDS } from '../../utils/scheduler'

/** Stable mapping from the production Scheduler identity to the existing graph node. */
export const LINEAGE_TASK_NODE_IDS: Readonly<Record<string, string>> = {
  [SCHEDULER_TASK_IDS.odsOrders]: 'task-load-order',
  [SCHEDULER_TASK_IDS.dwd]: 'task-build-order-detail',
  [SCHEDULER_TASK_IDS.dws]: 'task-build-sales',
  [SCHEDULER_TASK_IDS.ads]: 'task-publish-report',
}

/** Quality targets use the same table names as the SQL and Scheduler lesson chain. */
export const LINEAGE_TABLE_NODE_IDS: Readonly<Record<string, string>> = {
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
