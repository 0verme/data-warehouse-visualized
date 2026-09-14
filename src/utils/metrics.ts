import type {
  MetricConfig,
  MetricDefinition,
  MetricOrder,
  MetricOrderDetail,
  MetricVisualization,
} from '../types'

export const DEFAULT_METRIC_CONFIG: MetricConfig = {
  statusRule: 'paid',
  refundRule: 'gross',
  timeField: 'orderTime',
  grainMode: 'correct',
}

export type MetricExclusionReason = 'not-paid' | 'missing-time' | 'date-mismatch'

export interface MetricOrderEvaluation {
  order: MetricOrder
  included: boolean
  exclusionReason?: MetricExclusionReason
  contribution: number | null
  detailCount: number
}

export interface MetricCalculation {
  total: number
  evaluations: MetricOrderEvaluation[]
  definition: MetricDefinition
}

function getOrderDate(order: MetricOrder, timeField: MetricConfig['timeField']): string | null {
  const timestamp = order[timeField]
  return timestamp ? timestamp.slice(0, 10) : null
}

function getExclusionReason(
  order: MetricOrder,
  targetDate: string,
  config: MetricConfig,
): MetricExclusionReason | undefined {
  if (config.statusRule === 'paid' && order.status !== 'PAID') {
    return 'not-paid'
  }

  const orderDate = getOrderDate(order, config.timeField)

  if (!orderDate) {
    return 'missing-time'
  }

  if (orderDate !== targetDate) {
    return 'date-mismatch'
  }

  return undefined
}

/**
 * 只根据状态和时间口径筛选订单，不改变传入数据，也不处理金额粒度。
 */
export function getIncludedOrders(
  orders: readonly MetricOrder[],
  targetDate: string,
  config: MetricConfig,
): MetricOrder[] {
  return orders.filter((order) => !getExclusionReason(order, targetDate, config))
}

/**
 * 计算一笔订单在当前退款和粒度规则下对指标的贡献。
 */
export function getOrderContribution(
  order: MetricOrder,
  config: MetricConfig,
  detailRows: readonly MetricOrderDetail[] = [],
): number {
  const measuredAmount =
    config.refundRule === 'net' ? order.orderAmount - order.refundAmount : order.orderAmount

  if (config.grainMode === 'duplicated') {
    const detailCount = detailRows.filter((row) => row.orderId === order.id).length
    return measuredAmount * Math.max(detailCount, 1)
  }

  return measuredAmount
}

export function getMetricDefinition(config: MetricConfig): MetricDefinition {
  const isPaid = config.statusRule === 'paid'
  const isNet = config.refundRule === 'net'
  const usesOrderTime = config.timeField === 'orderTime'
  const usesCorrectGrain = config.grainMode === 'correct'

  return {
    name: isPaid ? '支付 GMV' : '订单 GMV',
    businessProcess: '订单',
    subject: isPaid ? '支付成功订单' : '所有订单',
    statusRule: isPaid ? '支付成功' : '统计所有订单',
    grain: usesCorrectGrain ? '订单' : '订单明细（错误演示）',
    timeField: usesOrderTime ? '下单时间' : '支付时间',
    measure: isNet ? '订单金额 - 退款金额' : '订单金额',
    refundRule: isNet ? '扣除退款金额' : '退款不扣除',
    period: '自然日',
  }
}

export function calculateMetric(
  visualization: Pick<MetricVisualization, 'orders' | 'detailRows' | 'targetDate'>,
  config: MetricConfig,
): MetricCalculation {
  const evaluations = visualization.orders.map((order) => {
    const exclusionReason = getExclusionReason(order, visualization.targetDate, config)
    const detailCount = visualization.detailRows.filter((row) => row.orderId === order.id).length

    return {
      order,
      included: exclusionReason === undefined,
      ...(exclusionReason ? { exclusionReason } : {}),
      contribution:
        exclusionReason === undefined
          ? getOrderContribution(order, config, visualization.detailRows)
          : null,
      detailCount,
    }
  })

  return {
    total: evaluations.reduce((total, evaluation) => total + (evaluation.contribution ?? 0), 0),
    evaluations,
    definition: getMetricDefinition(config),
  }
}
