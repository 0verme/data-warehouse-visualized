import type {
  AggregatedPayment,
  AggregatedShipment,
  JoinDemoMode,
  JoinDemoState,
  JoinMetrics,
  JoinResultRow,
  OrderRow,
  PaymentRow,
  ShipmentRow,
} from './types'

/**
 * Minimal deterministic fixture for the English JOIN duplicate-rows page.
 *
 * - `orders.order_id` is unique (2 rows).
 * - `payments.order_id` repeats: O-1001 has two payments.
 * - `shipments.order_id` repeats: O-1001 has two shipments.
 *
 * The two O-1001 payments intentionally share amount and date but not
 * `payment_id`, so the DISTINCT discussion stays honest: hiding columns can
 * make a query look correct while it drops a real second payment.
 */
export const joinOrders: readonly OrderRow[] = [
  { id: 'O-1001', orderId: 'O-1001', amount: 300 },
  { id: 'O-1002', orderId: 'O-1002', amount: 500 },
]

export const joinPayments: readonly PaymentRow[] = [
  { id: 'P-01', orderId: 'O-1001', paidAmount: 100, paidOn: '2026-02-01' },
  { id: 'P-02', orderId: 'O-1001', paidAmount: 100, paidOn: '2026-02-01' },
  { id: 'P-03', orderId: 'O-1002', paidAmount: 200, paidOn: '2026-02-03' },
]

export const joinShipments: readonly ShipmentRow[] = [
  { id: 'S-01', orderId: 'O-1001', carrier: 'DHL' },
  { id: 'S-02', orderId: 'O-1001', carrier: 'UPS' },
  { id: 'S-03', orderId: 'O-1002', carrier: 'DHL' },
]

export const joinExpectedOrderTotal = joinOrders.reduce((total, order) => total + order.amount, 0)

/** `orders ⋈ payments` on `order_id`: each matching pair becomes one row. */
export function joinOrdersToPayments(
  orders: readonly OrderRow[],
  payments: readonly PaymentRow[],
): JoinResultRow[] {
  const paymentsByOrder = new Map<string, PaymentRow[]>()
  for (const payment of payments) {
    const bucket = paymentsByOrder.get(payment.orderId) ?? []
    bucket.push(payment)
    paymentsByOrder.set(payment.orderId, bucket)
  }

  const rows: JoinResultRow[] = []
  for (const order of orders) {
    for (const payment of paymentsByOrder.get(order.orderId) ?? []) {
      rows.push({
        id: `${order.id}/${payment.id}`,
        orderId: order.orderId,
        orderAmount: order.amount,
        paymentId: payment.id,
        paidAmount: payment.paidAmount,
        paymentCount: null,
        shipmentId: null,
        carrier: null,
        shipmentCount: null,
      })
    }
  }

  return rows
}

/**
 * `orders ⋈ payments ⋈ shipments` on the same `order_id`.
 *
 * Both child tables repeat for O-1001, so one order produces 2 × 2 = 4 rows
 * and `order_amount` is copied four times.
 */
export function joinOrdersToPaymentsToShipments(
  orders: readonly OrderRow[],
  payments: readonly PaymentRow[],
  shipments: readonly ShipmentRow[],
): JoinResultRow[] {
  const paymentsByOrder = new Map<string, PaymentRow[]>()
  for (const payment of payments) {
    const bucket = paymentsByOrder.get(payment.orderId) ?? []
    bucket.push(payment)
    paymentsByOrder.set(payment.orderId, bucket)
  }

  const shipmentsByOrder = new Map<string, ShipmentRow[]>()
  for (const shipment of shipments) {
    const bucket = shipmentsByOrder.get(shipment.orderId) ?? []
    bucket.push(shipment)
    shipmentsByOrder.set(shipment.orderId, bucket)
  }

  const rows: JoinResultRow[] = []
  for (const order of orders) {
    for (const payment of paymentsByOrder.get(order.orderId) ?? []) {
      for (const shipment of shipmentsByOrder.get(order.orderId) ?? []) {
        rows.push({
          id: `${order.id}/${payment.id}/${shipment.id}`,
          orderId: order.orderId,
          orderAmount: order.amount,
          paymentId: payment.id,
          paidAmount: payment.paidAmount,
          paymentCount: null,
          shipmentId: shipment.id,
          carrier: shipment.carrier,
          shipmentCount: null,
        })
      }
    }
  }

  return rows
}

/** Collapse one-to-many child rows to the order grain before joining. */
export function aggregatePaymentsByOrder(payments: readonly PaymentRow[]): AggregatedPayment[] {
  const buckets = new Map<string, { paidTotal: number; paymentCount: number }>()
  for (const payment of payments) {
    const bucket = buckets.get(payment.orderId) ?? { paidTotal: 0, paymentCount: 0 }
    bucket.paidTotal += payment.paidAmount
    bucket.paymentCount += 1
    buckets.set(payment.orderId, bucket)
  }

  return [...buckets.entries()].map(([orderId, bucket]) => ({
    id: `PAY-${orderId}`,
    orderId,
    paidTotal: bucket.paidTotal,
    paymentCount: bucket.paymentCount,
  }))
}

export function aggregateShipmentsByOrder(shipments: readonly ShipmentRow[]): AggregatedShipment[] {
  const counts = new Map<string, number>()
  for (const shipment of shipments) {
    counts.set(shipment.orderId, (counts.get(shipment.orderId) ?? 0) + 1)
  }

  return [...counts.entries()].map(([orderId, shipmentCount]) => ({
    id: `SHIP-${orderId}`,
    orderId,
    shipmentCount,
  }))
}

/**
 * Fixed pattern: pre-aggregate both one-to-many tables to the order grain,
 * then join. The result is one row per order and `SUM(order_amount)` is safe.
 */
export function joinOrdersToAggregatedChildren(
  orders: readonly OrderRow[],
  aggregatedPayments: readonly AggregatedPayment[],
  aggregatedShipments: readonly AggregatedShipment[],
): JoinResultRow[] {
  const paymentsByOrder = new Map(aggregatedPayments.map((payment) => [payment.orderId, payment]))
  const shipmentsByOrder = new Map(
    aggregatedShipments.map((shipment) => [shipment.orderId, shipment]),
  )

  return orders.map((order) => {
    const payment = paymentsByOrder.get(order.orderId)
    const shipment = shipmentsByOrder.get(order.orderId)

    return {
      id: `${order.id}/AGG`,
      orderId: order.orderId,
      orderAmount: order.amount,
      paymentId: payment?.id ?? null,
      paidAmount: payment?.paidTotal ?? null,
      paymentCount: payment?.paymentCount ?? null,
      shipmentId: shipment?.id ?? null,
      carrier: shipment ? `${shipment.shipmentCount} shipments` : null,
      shipmentCount: shipment?.shipmentCount ?? null,
    }
  })
}

/**
 * Fixed pattern for filters: `EXISTS` checks the child table without adding
 * a column, so the order grain and its measures survive unchanged.
 */
export function createExistsRows(orders: readonly OrderRow[]): JoinResultRow[] {
  return orders.map((order) => ({
    id: `${order.id}/EXISTS`,
    orderId: order.orderId,
    orderAmount: order.amount,
    paymentId: null,
    paidAmount: null,
    paymentCount: null,
    shipmentId: null,
    carrier: null,
    shipmentCount: null,
  }))
}

export function createJoinMetrics(
  orders: readonly OrderRow[],
  resultRows: readonly JoinResultRow[],
): JoinMetrics {
  const distinctOrders = new Set(resultRows.map((row) => row.orderId)).size
  const sumOrderAmount = resultRows.reduce((total, row) => total + row.orderAmount, 0)
  const expectedOrderTotal = orders.reduce((total, order) => total + order.amount, 0)

  return {
    joinedRows: resultRows.length,
    distinctOrders,
    sumOrderAmount,
    expectedOrderTotal,
    overcountedAmount: sumOrderAmount - expectedOrderTotal,
  }
}

/**
 * Deterministic full snapshot per mode. Every step that renders the same mode
 * gets the exact same computed numbers, with no replay.
 */
export function createJoinDemoState(mode: JoinDemoMode): JoinDemoState {
  const aggregatedPayments = aggregatePaymentsByOrder(joinPayments)
  const aggregatedShipments = aggregateShipmentsByOrder(joinShipments)

  switch (mode) {
    case 'none': {
      return {
        mode,
        orders: joinOrders,
        payments: joinPayments,
        shipments: joinShipments,
        aggregatedPayments,
        aggregatedShipments,
        resultRows: [],
        metrics: createJoinMetrics(joinOrders, []),
      }
    }
    case 'payments': {
      const resultRows = joinOrdersToPayments(joinOrders, joinPayments)
      return {
        mode,
        orders: joinOrders,
        payments: joinPayments,
        shipments: joinShipments,
        aggregatedPayments,
        aggregatedShipments,
        resultRows,
        metrics: createJoinMetrics(joinOrders, resultRows),
      }
    }
    case 'payments-shipments': {
      const resultRows = joinOrdersToPaymentsToShipments(joinOrders, joinPayments, joinShipments)
      return {
        mode,
        orders: joinOrders,
        payments: joinPayments,
        shipments: joinShipments,
        aggregatedPayments,
        aggregatedShipments,
        resultRows,
        metrics: createJoinMetrics(joinOrders, resultRows),
      }
    }
    case 'aggregated': {
      const resultRows = joinOrdersToAggregatedChildren(
        joinOrders,
        aggregatedPayments,
        aggregatedShipments,
      )
      return {
        mode,
        orders: joinOrders,
        payments: joinPayments,
        shipments: joinShipments,
        aggregatedPayments,
        aggregatedShipments,
        resultRows,
        metrics: createJoinMetrics(joinOrders, resultRows),
      }
    }
    case 'exists': {
      const resultRows = createExistsRows(joinOrders)
      return {
        mode,
        orders: joinOrders,
        payments: joinPayments,
        shipments: joinShipments,
        aggregatedPayments,
        aggregatedShipments,
        resultRows,
        metrics: createJoinMetrics(joinOrders, resultRows),
      }
    }
  }
}
