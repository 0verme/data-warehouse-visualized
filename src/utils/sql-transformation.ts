import type {
  OrderEvent,
  OrderItemEvent,
  PaymentEvent,
  RefundEvent,
  TransformationDataset,
  TransformationEvidence,
  TransformationGrain,
  TransformationLayerSnapshot,
  TransformationPrediction,
  TransformationRow,
  TransformationRowChangeKind,
  TransformationStepDefinition,
  TransformationStepId,
  TransformationStepResult,
  TransformationTableMetrics,
  TransformationTableSnapshot,
  TransformationWorkbenchState,
  UserRecord,
} from '../features/sql-transformation/types'

export const TRANSFORMATION_STEPS: readonly TransformationStepDefinition[] = [
  {
    id: 'deduplicate',
    number: '01',
    label: '去重事件',
    title: '重复事件要压平',
    layer: 'ODS → ODS',
    sql: `WITH ranked_orders AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY updated_at DESC
    ) AS rn
  FROM ods_order_event
)
SELECT * FROM ranked_orders WHERE rn = 1;`,
    description: '按业务键保留最新订单事件；支付事件暂时保留，用来观察粒度问题。',
    expectedChange: 'decrease',
    expectedChangeLabel: '行数减少，重复事件被合并',
  },
  {
    id: 'join-users',
    number: '02',
    label: '补全用户',
    title: '用 LEFT JOIN 补上用户属性',
    layer: 'ODS → DWD',
    sql: `SELECT
  i.order_id,
  i.item_id,
  o.user_id,
  u.user_name,
  u.city,
  i.item_amount
FROM clean_orders o
JOIN ods_order_item i ON o.order_id = i.order_id
LEFT JOIN dim_user u ON o.user_id = u.user_id;`,
    description: '用户维度只负责补充属性，不改变订单明细的粒度；找不到用户时保留 NULL。',
    expectedChange: 'unchanged',
    expectedChangeLabel: '行数和金额保持不变',
  },
  {
    id: 'wrong-join',
    number: '03',
    label: '故意错一次',
    title: '让多对多 JOIN 暴露出来',
    layer: 'DWD · 错误分支',
    sql: `SELECT
  i.order_id,
  i.item_id,
  i.item_amount,
  p.amount AS payment_amount,
  r.amount AS refund_amount
FROM dwd_order_item i
LEFT JOIN payment_event p ON i.order_id = p.order_id
LEFT JOIN refund_event r ON i.order_id = r.order_id;`,
    description:
      '订单明细、支付事件、退款事件都不是订单粒度；直接按 order_id 连接会产生笛卡尔式放大。',
    expectedChange: 'increase',
    expectedChangeLabel: '重复行增加，金额被放大',
  },
  {
    id: 'fix-join',
    number: '04',
    label: '修正 JOIN',
    title: '事件回到目标粒度后再 JOIN',
    layer: 'DWD · 正确分支',
    sql: `WITH one_payment AS (
  SELECT * FROM (
    SELECT p.*,
      ROW_NUMBER() OVER (
        PARTITION BY transaction_key
        ORDER BY updated_at DESC
      ) AS rn
    FROM payment_event p
  ) t WHERE rn = 1
), refund_by_order AS (
  SELECT order_id, SUM(amount) AS refund_amount
  FROM refund_event
  GROUP BY order_id
)
SELECT ... FROM clean_orders o
LEFT JOIN one_payment p ON o.order_id = p.order_id
LEFT JOIN refund_by_order r ON o.order_id = r.order_id;`,
    description: '支付去重、退款按订单汇总后再连接，输出重新对齐到所选目标粒度。',
    expectedChange: 'decrease',
    expectedChangeLabel: '重复行合并回目标粒度',
  },
  {
    id: 'build-dws',
    number: '05',
    label: '形成 DWS',
    title: '把明细汇总成销售主题',
    layer: 'DWD → DWS',
    sql: `SELECT
  paid_date,
  COUNT(DISTINCT order_id) AS order_count,
  SUM(gross_amount) AS gross_amount,
  SUM(refund_amount) AS refund_amount,
  SUM(net_amount) AS sales_amount
FROM dwd_order_detail
WHERE payment_status = 'PAID'
  AND paid_date IS NOT NULL
GROUP BY paid_date;`,
    description: 'DWS 一行代表一个支付日；待支付订单和没有支付时间的 NULL 不进入已支付销售额。',
    expectedChange: 'decrease',
    expectedChangeLabel: '多行明细合并成日粒度',
  },
  {
    id: 'wrong-group-by',
    number: '06',
    label: '检查 GROUP BY',
    title: '错误 GROUP BY 会留下错误粒度',
    layer: 'DWS · 错误分支',
    sql: `SELECT
  paid_date,
  item_id, -- 错误：日主题不应该保留明细键
  SUM(net_amount) AS sales_amount
FROM dwd_order_detail
WHERE payment_status = 'PAID'
GROUP BY paid_date, item_id;`,
    description: '金额可能仍然能加起来，但输出不再是“一天一行”；下游会把它误当成日汇总。',
    expectedChange: 'increase',
    expectedChangeLabel: '相对日汇总行数增加',
  },
  {
    id: 'build-ads',
    number: '07',
    label: '形成 ADS',
    title: '为“昨天”筛出目标指标',
    layer: 'DWS → ADS',
    sql: `SELECT
  dt,
  sales_amount,
  order_count
FROM dws_sales_daily
WHERE dt >= :data_date
  AND dt < DATEADD(day, 1, :data_date);`,
    description: '用 [data_date, next_date) 的半开区间处理时间边界，ADS 只服务当前问题。',
    expectedChange: 'decrease',
    expectedChangeLabel: '筛出一个数据分区',
  },
  {
    id: 'late-data',
    number: '08',
    label: '注入迟到数据',
    title: '迟到一条记录，哪个分区要重跑？',
    layer: 'ODS → ADS · 重跑提示',
    sql: `-- O1005 在 2026-09-14 才到达，但业务时间属于 2026-09-13
INSERT INTO ods_order_event (...) VALUES (...);

-- 需要按业务日期重跑，而不是只跑到数当天
-- WHERE dt = '2026-09-13';`,
    description: '数据到达时间晚于业务发生时间；补数必须按业务日期重跑历史分区，而不是跑当天。',
    expectedChange: 'unchanged',
    expectedChangeLabel: '同一分区金额更新',
  },
]

export const TRANSFORMATION_LAYER_ORDER = ['ods', 'dwd', 'dws', 'ads'] as const

export function getTransformationStep(
  stepId: TransformationStepId,
): TransformationStepDefinition | undefined {
  return TRANSFORMATION_STEPS.find((step) => step.id === stepId)
}

export function getDatePart(timestamp: string | null | undefined): string | null {
  if (!timestamp) {
    return null
  }

  const datePart = timestamp.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/u.test(datePart) ? datePart : null
}

/**
 * 使用半开区间 [targetDate, nextDate) 的日期部分判断，避免把次日 00:00 算入昨天。
 */
export function isInDatePartition(
  timestamp: string | null | undefined,
  targetDate: string,
): boolean {
  return getDatePart(timestamp) === targetDate
}

function pickLatestByKey<T extends { updatedAt: string }>(
  rows: readonly T[],
  keySelector: (row: T) => string,
): T[] {
  const latestByKey = new Map<string, T>()

  for (const row of rows) {
    const key = keySelector(row)
    const current = latestByKey.get(key)

    if (!current || row.updatedAt > current.updatedAt) {
      latestByKey.set(key, row)
    }
  }

  return [...latestByKey.values()]
}

export function deduplicateOrderEvents(orders: readonly OrderEvent[]): OrderEvent[] {
  return pickLatestByKey(orders, (order) => order.orderId)
}

export function deduplicatePaymentEvents(payments: readonly PaymentEvent[]): PaymentEvent[] {
  return pickLatestByKey(payments, (payment) => payment.transactionKey)
}

export function getRefundTotals(refunds: readonly RefundEvent[]): Map<string, number> {
  const totals = new Map<string, number>()

  for (const refund of refunds) {
    if (refund.status !== 'SUCCESS') {
      continue
    }

    totals.set(refund.orderId, (totals.get(refund.orderId) ?? 0) + refund.amount)
  }

  return totals
}

function getOrderItemsByOrder(items: readonly OrderItemEvent[]): Map<string, OrderItemEvent[]> {
  const grouped = new Map<string, OrderItemEvent[]>()

  for (const item of items) {
    const current = grouped.get(item.orderId) ?? []
    current.push(item)
    grouped.set(item.orderId, current)
  }

  return grouped
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function allocateRefunds(
  items: readonly OrderItemEvent[],
  refundTotal: number,
): Map<string, number> {
  const allocations = new Map<string, number>()
  const itemTotal = items.reduce((total, item) => total + item.itemAmount, 0)

  if (refundTotal === 0 || itemTotal === 0 || items.length === 0) {
    for (const item of items) {
      allocations.set(item.itemId, 0)
    }
    return allocations
  }

  let allocated = 0
  items.forEach((item, index) => {
    const isLast = index === items.length - 1
    const amount = isLast
      ? roundCurrency(refundTotal - allocated)
      : roundCurrency((refundTotal * item.itemAmount) / itemTotal)
    allocations.set(item.itemId, amount)
    allocated += amount
  })

  return allocations
}

function getUser(users: readonly UserRecord[], userId: string): UserRecord | undefined {
  return users.find((user) => user.userId === userId)
}

function getPaymentByOrder(payments: readonly PaymentEvent[]): Map<string, PaymentEvent> {
  const paymentsByOrder = new Map<string, PaymentEvent>()

  for (const payment of deduplicatePaymentEvents(payments)) {
    const current = paymentsByOrder.get(payment.orderId)
    if (!current || payment.updatedAt > current.updatedAt) {
      paymentsByOrder.set(payment.orderId, payment)
    }
  }

  return paymentsByOrder
}

export function getCanonicalOrders(dataset: TransformationDataset): OrderEvent[] {
  return deduplicateOrderEvents(dataset.orders)
}

export function getCanonicalPayments(dataset: TransformationDataset): PaymentEvent[] {
  return deduplicatePaymentEvents(dataset.payments)
}

export function buildOrderItemRows(dataset: TransformationDataset): TransformationRow[] {
  const canonicalOrders = getCanonicalOrders(dataset)
  const itemsByOrder = getOrderItemsByOrder(dataset.orderItems)
  const paymentsByOrder = getPaymentByOrder(dataset.payments)
  const refundTotals = getRefundTotals(dataset.refunds)
  const rows: TransformationRow[] = []

  for (const order of canonicalOrders) {
    const items = itemsByOrder.get(order.orderId) ?? []
    const payment = paymentsByOrder.get(order.orderId)
    const user = getUser(dataset.users, order.userId)
    const refundAllocation = allocateRefunds(items, refundTotals.get(order.orderId) ?? 0)

    for (const item of items) {
      const refundAmount = refundAllocation.get(item.itemId) ?? 0
      rows.push({
        order_id: order.orderId,
        item_id: item.itemId,
        user_id: order.userId,
        user_name: user?.userName ?? null,
        user_city: user?.city ?? null,
        product: item.product,
        order_time: order.orderTime,
        paid_at: payment?.paidAt ?? null,
        paid_date: getDatePart(payment?.paidAt),
        payment_status: payment?.status === 'SUCCESS' ? 'PAID' : 'UNPAID',
        item_amount: item.itemAmount,
        refund_amount: refundAmount,
        net_amount: roundCurrency(item.itemAmount - refundAmount),
      })
    }
  }

  return rows
}

export function buildOrderRows(dataset: TransformationDataset): TransformationRow[] {
  const canonicalOrders = getCanonicalOrders(dataset)
  const itemsByOrder = getOrderItemsByOrder(dataset.orderItems)
  const paymentsByOrder = getPaymentByOrder(dataset.payments)
  const refundTotals = getRefundTotals(dataset.refunds)

  return canonicalOrders.map((order) => {
    const items = itemsByOrder.get(order.orderId) ?? []
    const payment = paymentsByOrder.get(order.orderId)
    const user = getUser(dataset.users, order.userId)
    const grossAmount = items.reduce((total, item) => total + item.itemAmount, 0)
    const refundAmount = refundTotals.get(order.orderId) ?? 0

    return {
      order_id: order.orderId,
      user_id: order.userId,
      user_name: user?.userName ?? null,
      user_city: user?.city ?? null,
      order_time: order.orderTime,
      paid_at: payment?.paidAt ?? null,
      paid_date: getDatePart(payment?.paidAt),
      payment_status: payment?.status === 'SUCCESS' ? 'PAID' : 'UNPAID',
      gross_amount: grossAmount,
      refund_amount: refundAmount,
      net_amount: roundCurrency(grossAmount - refundAmount),
    }
  })
}

function buildDailyRows(dataset: TransformationDataset): TransformationRow[] {
  const grouped = new Map<
    string,
    { orderIds: Set<string>; grossAmount: number; refundAmount: number; netAmount: number }
  >()

  for (const row of buildOrderRows(dataset)) {
    const paidDate = row.paid_date
    if (typeof paidDate !== 'string' || row.payment_status !== 'PAID') {
      continue
    }

    const current = grouped.get(paidDate) ?? {
      orderIds: new Set<string>(),
      grossAmount: 0,
      refundAmount: 0,
      netAmount: 0,
    }
    current.orderIds.add(String(row.order_id))
    current.grossAmount += Number(row.gross_amount)
    current.refundAmount += Number(row.refund_amount)
    current.netAmount += Number(row.net_amount)
    grouped.set(paidDate, current)
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([paidDate, values]) => ({
      paid_date: paidDate,
      order_count: values.orderIds.size,
      gross_amount: values.grossAmount,
      refund_amount: values.refundAmount,
      sales_amount: roundCurrency(values.netAmount),
    }))
}

function buildWrongGroupedRows(dataset: TransformationDataset): TransformationRow[] {
  return buildOrderItemRows(dataset)
    .filter((row) => row.payment_status === 'PAID' && typeof row.paid_date === 'string')
    .map((row) => ({
      paid_date: row.paid_date,
      item_id: row.item_id,
      order_count: 1,
      sales_amount: row.net_amount,
    }))
}

function buildTable(
  table: Omit<TransformationTableSnapshot, 'rows'> & { rows: readonly TransformationRow[] },
): TransformationTableSnapshot {
  return table
}

export function getOdsSnapshot(dataset: TransformationDataset): TransformationLayerSnapshot {
  return {
    layer: 'ods',
    label: 'ODS',
    title: '原始事件落地后再处理',
    description: '保留来源上下文，重复订单事件、重复支付事件和 NULL 都在这里可见。',
    tables: [
      buildTable({
        id: 'ods-orders',
        name: 'ods_order_event',
        grain: '一行 = 一次订单事件',
        columns: [
          'event_id',
          'order_id',
          'user_id',
          'order_time',
          'status',
          'order_amount',
          'updated_at',
        ],
        rowKey: ['order_id'],
        amountColumn: 'order_amount',
        rows: dataset.orders.map((order) => ({
          event_id: order.eventId,
          order_id: order.orderId,
          user_id: order.userId,
          order_time: order.orderTime,
          status: order.status,
          order_amount: order.orderAmount,
          updated_at: order.updatedAt,
        })),
      }),
      buildTable({
        id: 'ods-order-items',
        name: 'ods_order_item',
        grain: '一行 = 一个订单商品事件',
        columns: ['item_id', 'order_id', 'product', 'quantity', 'unit_price', 'item_amount'],
        rowKey: ['order_id', 'item_id'],
        amountColumn: 'item_amount',
        rows: dataset.orderItems.map((item) => ({
          item_id: item.itemId,
          order_id: item.orderId,
          product: item.product,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          item_amount: item.itemAmount,
        })),
      }),
      buildTable({
        id: 'ods-users',
        name: 'ods_user',
        grain: '一行 = 一个用户当前记录',
        columns: ['user_id', 'user_name', 'city'],
        rowKey: ['user_id'],
        rows: dataset.users.map((user) => ({
          user_id: user.userId,
          user_name: user.userName,
          city: user.city,
        })),
      }),
      buildTable({
        id: 'ods-payments',
        name: 'ods_payment_event',
        grain: '一行 = 一次支付事件',
        columns: [
          'payment_id',
          'order_id',
          'transaction_key',
          'paid_at',
          'status',
          'amount',
          'updated_at',
        ],
        rowKey: ['transaction_key'],
        amountColumn: 'amount',
        rows: dataset.payments.map((payment) => ({
          payment_id: payment.paymentId,
          order_id: payment.orderId,
          transaction_key: payment.transactionKey,
          paid_at: payment.paidAt,
          status: payment.status,
          amount: payment.amount,
          updated_at: payment.updatedAt,
        })),
      }),
      buildTable({
        id: 'ods-refunds',
        name: 'ods_refund_event',
        grain: '一行 = 一次退款事件',
        columns: ['refund_id', 'order_id', 'refunded_at', 'status', 'amount'],
        rowKey: ['refund_id'],
        amountColumn: 'amount',
        rows: dataset.refunds.map((refund) => ({
          refund_id: refund.refundId,
          order_id: refund.orderId,
          refunded_at: refund.refundedAt,
          status: refund.status,
          amount: refund.amount,
        })),
      }),
    ],
  }
}

function getCleanOrdersTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'clean-orders',
    name: 'ods_order_clean',
    grain: '一行 = 一个订单（按 order_id 去重）',
    columns: ['order_id', 'user_id', 'order_time', 'status', 'order_amount', 'updated_at'],
    rowKey: ['order_id'],
    amountColumn: 'order_amount',
    rows: getCanonicalOrders(dataset).map((order) => ({
      order_id: order.orderId,
      user_id: order.userId,
      order_time: order.orderTime,
      status: order.status,
      order_amount: order.orderAmount,
      updated_at: order.updatedAt,
    })),
  })
}

function getUserEnrichedTable(dataset: TransformationDataset): TransformationTableSnapshot {
  const canonicalOrders = getCanonicalOrders(dataset)
  const rows: TransformationRow[] = []

  for (const item of dataset.orderItems) {
    const order = canonicalOrders.find((candidate) => candidate.orderId === item.orderId)
    if (!order) {
      continue
    }

    const user = getUser(dataset.users, order.userId)
    rows.push({
      order_id: order.orderId,
      item_id: item.itemId,
      user_id: order.userId,
      user_name: user?.userName ?? null,
      user_city: user?.city ?? null,
      order_time: order.orderTime,
      item_amount: item.itemAmount,
    })
  }

  return buildTable({
    id: 'user-enriched',
    name: 'dwd_order_item_user',
    grain: '一行 = 一个订单商品（用户属性已补全）',
    columns: [
      'order_id',
      'item_id',
      'user_id',
      'user_name',
      'user_city',
      'order_time',
      'item_amount',
    ],
    rowKey: ['order_id', 'item_id'],
    amountColumn: 'item_amount',
    rows,
  })
}

function getWrongJoinTable(dataset: TransformationDataset): TransformationTableSnapshot {
  const canonicalOrders = getCanonicalOrders(dataset)
  const itemsByOrder = getOrderItemsByOrder(dataset.orderItems)
  const rows: TransformationRow[] = []

  for (const order of canonicalOrders) {
    const items = itemsByOrder.get(order.orderId) ?? []
    const payments = dataset.payments.filter(
      (payment) => payment.orderId === order.orderId && payment.status === 'SUCCESS',
    )
    const refunds = dataset.refunds.filter(
      (refund) => refund.orderId === order.orderId && refund.status === 'SUCCESS',
    )
    const paymentMatches: Array<PaymentEvent | null> = payments.length > 0 ? payments : [null]
    const refundMatches: Array<RefundEvent | null> = refunds.length > 0 ? refunds : [null]

    for (const item of items) {
      for (const payment of paymentMatches) {
        for (const refund of refundMatches) {
          const refundAmount = refund?.amount ?? 0
          rows.push({
            order_id: order.orderId,
            item_id: item.itemId,
            payment_id: payment?.paymentId ?? null,
            refund_id: refund?.refundId ?? null,
            paid_at: payment?.paidAt ?? null,
            paid_date: getDatePart(payment?.paidAt),
            item_amount: item.itemAmount,
            refund_amount: refundAmount,
            net_amount: roundCurrency(item.itemAmount - refundAmount),
          })
        }
      }
    }
  }

  return buildTable({
    id: 'wrong-many-to-many',
    name: 'dwd_order_item_wrong_join',
    grain: '一行 = 明细 × 支付事件 × 退款事件（错误）',
    columns: [
      'order_id',
      'item_id',
      'payment_id',
      'refund_id',
      'paid_at',
      'paid_date',
      'item_amount',
      'refund_amount',
      'net_amount',
    ],
    rowKey: ['order_id', 'item_id'],
    amountColumn: 'net_amount',
    rows,
  })
}

function getDwdTable(
  dataset: TransformationDataset,
  grain: TransformationGrain,
): TransformationTableSnapshot {
  if (grain === 'order') {
    return buildTable({
      id: 'dwd-order',
      name: 'dwd_order',
      grain: '一行 = 一个订单（支付、退款已回到订单粒度）',
      columns: [
        'order_id',
        'user_id',
        'user_name',
        'user_city',
        'order_time',
        'paid_at',
        'paid_date',
        'payment_status',
        'gross_amount',
        'refund_amount',
        'net_amount',
      ],
      rowKey: ['order_id'],
      amountColumn: 'net_amount',
      rows: buildOrderRows(dataset),
    })
  }

  if (grain === 'day') {
    return buildTable({
      id: 'dwd-sales-day',
      name: 'dwd_sales_day_preview',
      grain: '一行 = 一个支付日（过早聚合，明细不可回溯）',
      columns: ['paid_date', 'order_count', 'gross_amount', 'refund_amount', 'sales_amount'],
      rowKey: ['paid_date'],
      amountColumn: 'sales_amount',
      rows: buildDailyRows(dataset),
    })
  }

  return buildTable({
    id: 'dwd-order-item',
    name: 'dwd_order_item',
    grain: '一行 = 一个订单商品（退款按明细金额分摊）',
    columns: [
      'order_id',
      'item_id',
      'user_id',
      'user_name',
      'user_city',
      'order_time',
      'paid_at',
      'paid_date',
      'payment_status',
      'item_amount',
      'refund_amount',
      'net_amount',
    ],
    rowKey: ['order_id', 'item_id'],
    amountColumn: 'net_amount',
    rows: buildOrderItemRows(dataset),
  })
}

function getDwsTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'dws-sales-daily',
    name: 'dws_sales_daily',
    grain: '一行 = 一个支付日',
    columns: ['paid_date', 'order_count', 'gross_amount', 'refund_amount', 'sales_amount'],
    rowKey: ['paid_date'],
    amountColumn: 'sales_amount',
    rows: buildDailyRows(dataset),
  })
}

function getAdsTable(dataset: TransformationDataset): TransformationTableSnapshot {
  const dailyRows = buildDailyRows(dataset)
  const targetRow = dailyRows.find((row) => row.paid_date === dataset.targetDate)

  return buildTable({
    id: 'ads-yesterday-sales',
    name: 'ads_yesterday_sales',
    grain: '一行 = 统计日的销售额指标',
    columns: ['dt', 'metric', 'order_count', 'sales_amount', 'definition'],
    rowKey: ['dt', 'metric'],
    amountColumn: 'sales_amount',
    rows: [
      {
        dt: dataset.targetDate,
        metric: 'net_sales',
        order_count: targetRow?.order_count ?? 0,
        sales_amount: targetRow?.sales_amount ?? 0,
        definition: '支付成功 · paid_at · [dt, next_dt) · 扣退款',
      },
    ],
  })
}

function getWrongGroupTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'wrong-group-by',
    name: 'dws_sales_daily_wrong_group',
    grain: '一行 = 一个支付日 × 一个商品（错误）',
    columns: ['paid_date', 'item_id', 'order_count', 'sales_amount'],
    rowKey: ['paid_date', 'item_id'],
    amountColumn: 'sales_amount',
    rows: buildWrongGroupedRows(dataset),
  })
}

export function appendLateData(dataset: TransformationDataset): TransformationDataset {
  if (dataset.orders.some((order) => order.orderId === dataset.lateOrder.order.orderId)) {
    return dataset
  }

  return {
    ...dataset,
    orders: [...dataset.orders, dataset.lateOrder.order],
    orderItems: [...dataset.orderItems, dataset.lateOrder.item],
    payments: [...dataset.payments, dataset.lateOrder.payment],
  }
}

export function getLayerSnapshots(
  dataset: TransformationDataset,
  grain: TransformationGrain,
  includeLateData = false,
): TransformationLayerSnapshot[] {
  const effectiveDataset = includeLateData ? appendLateData(dataset) : dataset

  return [
    getOdsSnapshot(effectiveDataset),
    {
      layer: 'dwd',
      label: 'DWD',
      title: '明细标准层',
      description: '去重、补维度、聚合支付和退款，再把每一行对齐到目标粒度。',
      tables: [getDwdTable(effectiveDataset, grain)],
    },
    {
      layer: 'dws',
      label: 'DWS',
      title: '销售主题汇总',
      description: '按支付日期聚合；日期边界和 NULL 处理在这里会直接改变销售额。',
      tables: [getDwsTable(effectiveDataset)],
    },
    {
      layer: 'ads',
      label: 'ADS',
      title: '昨天的销售额',
      description: '面向昨天销售额的报表结果，避免每张报表重复实现明细逻辑。',
      tables: [getAdsTable(effectiveDataset)],
    },
  ]
}

function getRowDate(row: TransformationRow): string | null {
  const dateFields = ['dt', 'paid_date', 'stat_date', 'order_time', 'paid_at', 'refunded_at']

  for (const field of dateFields) {
    const value = row[field]
    if (typeof value === 'string') {
      const date = getDatePart(value)
      if (date) {
        return date
      }
    }
  }

  return null
}

function sumAmount(rows: readonly TransformationRow[], amountColumn: string): number {
  return roundCurrency(
    rows.reduce((total, row) => {
      const value = row[amountColumn]
      return typeof value === 'number' && Number.isFinite(value) ? total + value : total
    }, 0),
  )
}

export function getTableMetrics(
  table: TransformationTableSnapshot,
  targetDate: string,
): TransformationTableMetrics {
  const amountColumn = table.amountColumn ?? '—'
  const targetRows = table.rows.filter((row) => getRowDate(row) === targetDate)

  return {
    rowCount: table.rows.length,
    amount: amountColumn === '—' ? 0 : sumAmount(table.rows, amountColumn),
    amountColumn,
    targetRowCount: targetRows.length,
    targetAmount: amountColumn === '—' ? 0 : sumAmount(targetRows, amountColumn),
  }
}

function rowKey(row: TransformationRow, columns: readonly string[]): string {
  return columns
    .map((column) => {
      const value =
        column === 'paid_date' && !Object.prototype.hasOwnProperty.call(row, 'paid_date')
          ? row.dt
          : column === 'dt' && !Object.prototype.hasOwnProperty.call(row, 'dt')
            ? row.paid_date
            : row[column]
      return `${column}=${String(value ?? 'NULL')}`
    })
    .join('|')
}

function rowSignature(row: TransformationRow): string {
  return Object.keys(row)
    .sort()
    .map((key) => `${key}=${String(row[key] ?? 'NULL')}`)
    .join('|')
}

export function compareTableRows(
  before: TransformationTableSnapshot,
  after: TransformationTableSnapshot,
  comparisonColumns: readonly string[] = before.rowKey,
): { key: string; kind: TransformationRowChangeKind; beforeCount: number; afterCount: number }[] {
  const beforeRows = new Map<string, TransformationRow[]>()
  const afterRows = new Map<string, TransformationRow[]>()

  for (const row of before.rows) {
    const key = rowKey(row, comparisonColumns)
    beforeRows.set(key, [...(beforeRows.get(key) ?? []), row])
  }

  for (const row of after.rows) {
    const key = rowKey(row, comparisonColumns)
    afterRows.set(key, [...(afterRows.get(key) ?? []), row])
  }

  const keys = [...new Set([...beforeRows.keys(), ...afterRows.keys()])]

  return keys.map((key) => {
    const previous = beforeRows.get(key) ?? []
    const next = afterRows.get(key) ?? []
    let kind: TransformationRowChangeKind

    if (previous.length === 0) {
      kind = 'added'
    } else if (next.length === 0) {
      kind = 'removed'
    } else if (next.length > previous.length) {
      kind = 'duplicated'
    } else if (next.length < previous.length) {
      kind = 'merged'
    } else if (previous.some((row, index) => rowSignature(row) !== rowSignature(next[index]!))) {
      kind = 'updated'
    } else {
      kind = 'same'
    }

    return { key, kind, beforeCount: previous.length, afterCount: next.length }
  })
}

function createEvidence(
  kind: TransformationEvidence['kind'],
  title: string,
  detail: string,
  keys: readonly string[],
): TransformationEvidence {
  return { kind, title, detail, keys }
}

function createStepResult(
  dataset: TransformationDataset,
  stepId: TransformationStepId,
  input: TransformationTableSnapshot,
  output: TransformationTableSnapshot,
  evidence: readonly TransformationEvidence[],
  comparisonColumns: readonly string[] = input.rowKey,
): TransformationStepResult {
  const step = getTransformationStep(stepId)
  if (!step) {
    throw new Error(`未知的数据加工步骤: ${stepId}`)
  }

  const inputMetrics = getTableMetrics(input, dataset.targetDate)
  const outputMetrics = getTableMetrics(output, dataset.targetDate)
  const actualChange =
    outputMetrics.rowCount > inputMetrics.rowCount
      ? 'increase'
      : outputMetrics.rowCount < inputMetrics.rowCount
        ? 'decrease'
        : 'unchanged'

  return {
    step,
    input,
    output,
    changes: compareTableRows(input, output, comparisonColumns),
    comparisonColumns,
    evidence,
    inputMetrics,
    outputMetrics,
    actualChange,
  }
}

export function getTransformationStepResult(
  dataset: TransformationDataset,
  grain: TransformationGrain,
  stepId: TransformationStepId,
): TransformationStepResult {
  const ods = getOdsSnapshot(dataset)
  const cleanOrders = getCleanOrdersTable(dataset)
  const userEnriched = getUserEnrichedTable(dataset)
  const wrongJoin = getWrongJoinTable(dataset)
  const dwd = getDwdTable(dataset, grain)
  const dws = getDwsTable(dataset)
  const ads = getAdsTable(dataset)

  switch (stepId) {
    case 'deduplicate':
      return createStepResult(dataset, stepId, ods.tables[0]!, cleanOrders, [
        createEvidence(
          'duplicate-event',
          'O1002 的重复订单事件被合并',
          'ods_order_event 中 order_id = O1002 有 2 行；按 updated_at 保留最新事件后，目标粒度回到一行订单。',
          ['O1002'],
        ),
      ])
    case 'join-users':
      return createStepResult(dataset, stepId, ods.tables[1]!, userEnriched, [
        createEvidence(
          'null-preserved',
          '找不到用户也不能悄悄丢行',
          'O1003 的 user_id = U404 不在用户表；LEFT JOIN 保留订单明细，并把 user_name、user_city 留为 NULL。',
          ['O1003', 'U404'],
        ),
      ])
    case 'wrong-join':
      return createStepResult(
        dataset,
        stepId,
        userEnriched,
        wrongJoin,
        [
          createEvidence(
            'many-to-many',
            'O1002 被 JOIN 成 8 行',
            'O1002 有 2 个订单明细、2 个支付事件和 2 条退款事件；按 order_id 直接 JOIN 得到 2 × 2 × 2 = 8 行，净金额被重复累计。',
            ['O1002', '2 items × 2 payments × 2 refunds'],
          ),
        ],
        ['order_id'],
      )
    case 'fix-join':
      return createStepResult(
        dataset,
        stepId,
        wrongJoin,
        dwd,
        [
          createEvidence(
            'grain-mismatch',
            '事件表先回到订单粒度',
            '支付事件按 transaction_key 去重、退款按 order_id 汇总，再与订单或订单明细连接；O1002 的 8 行回到目标粒度。',
            ['O1002', grain],
          ),
        ],
        grain === 'order'
          ? ['order_id']
          : grain === 'day'
            ? ['paid_date']
            : ['order_id', 'item_id'],
      )
    case 'build-dws':
      return createStepResult(
        dataset,
        stepId,
        dwd,
        dws,
        [
          createEvidence(
            'grain-mismatch',
            'DWS 明确变成一天一行',
            'DWD 保留订单或订单商品；DWS 只按 paid_date 聚合，order_id、item_id 不再作为输出粒度。',
            [dataset.targetDate],
          ),
          createEvidence(
            'time-boundary',
            'O1003 被放到次日',
            'O1003 在 9 月 13 日下单，但 paid_at 是 2026-09-14 00:03；按支付日期统计时不会进入昨天。',
            ['O1003', '2026-09-14'],
          ),
        ],
        ['paid_date'],
      )
    case 'wrong-group-by':
      return createStepResult(
        dataset,
        stepId,
        dws,
        getWrongGroupTable(dataset),
        [
          createEvidence(
            'grain-mismatch',
            'item_id 让日汇总重新裂开',
            '正确 DWS 对目标日期只保留 1 行；GROUP BY paid_date, item_id 后，O1002 的两个商品各自占一行，金额虽能相加，粒度已经不是日。',
            [dataset.targetDate, 'I1002-A', 'I1002-B'],
          ),
        ],
        ['paid_date'],
      )
    case 'build-ads':
      return createStepResult(
        dataset,
        stepId,
        dws,
        ads,
        [
          createEvidence(
            'time-boundary',
            '昨天使用半开时间区间',
            '只取 [2026-09-13 00:00, 2026-09-14 00:00)；O1003 的次日支付和 O1004 的 NULL paid_at 都不会混入支付销售额。',
            ['2026-09-13', 'O1003', 'O1004'],
          ),
        ],
        ['paid_date'],
      )
    case 'late-data': {
      const lateDataset = appendLateData(dataset)
      return createStepResult(
        dataset,
        stepId,
        ads,
        getAdsTable(lateDataset),
        [
          createEvidence(
            'late-partition',
            'O1005 到达晚，但属于昨天分区',
            'O1005 的 ingested_at 是 2026-09-14 02:00，业务 paid_at 属于 2026-09-13；因此需要重跑 dt = 2026-09-13，而不是只处理到达日期。',
            ['O1005', dataset.targetDate],
          ),
        ],
        ['paid_date'],
      )
    }
  }
}

export function createInitialTransformationState(): TransformationWorkbenchState {
  return {
    targetGrain: null,
    activeStepId: 'deduplicate',
    completedStepIds: [],
    predictions: {},
  }
}

export function selectTransformationGrain(
  state: TransformationWorkbenchState,
  grain: TransformationGrain,
): TransformationWorkbenchState {
  return {
    targetGrain: grain,
    activeStepId: 'deduplicate',
    completedStepIds: [],
    predictions: {},
  }
}

export function selectTransformationStep(
  state: TransformationWorkbenchState,
  stepId: TransformationStepId,
): TransformationWorkbenchState {
  const stepIndex = TRANSFORMATION_STEPS.findIndex((step) => step.id === stepId)
  const nextStepIndex = state.completedStepIds.length

  if (stepIndex < 0 || stepIndex > nextStepIndex) {
    return state
  }

  return { ...state, activeStepId: stepId }
}

export function setTransformationPrediction(
  state: TransformationWorkbenchState,
  prediction: TransformationPrediction,
): TransformationWorkbenchState {
  if (!state.targetGrain) {
    return state
  }

  return {
    ...state,
    predictions: {
      ...state.predictions,
      [state.activeStepId]: prediction,
    },
  }
}

export function canExecuteTransformationStep(state: TransformationWorkbenchState): boolean {
  const nextStep = TRANSFORMATION_STEPS[state.completedStepIds.length]
  return Boolean(
    state.targetGrain &&
    nextStep &&
    nextStep.id === state.activeStepId &&
    state.predictions[state.activeStepId],
  )
}

export function executeTransformationStep(
  state: TransformationWorkbenchState,
): TransformationWorkbenchState {
  if (!canExecuteTransformationStep(state)) {
    return state
  }

  const completedStepIds = [...state.completedStepIds, state.activeStepId]
  const nextStep = TRANSFORMATION_STEPS[completedStepIds.length]

  return {
    ...state,
    completedStepIds,
    activeStepId: nextStep?.id ?? state.activeStepId,
  }
}

export function getTransformationStepIndex(stepId: TransformationStepId): number {
  return TRANSFORMATION_STEPS.findIndex((step) => step.id === stepId)
}
