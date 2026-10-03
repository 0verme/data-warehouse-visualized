/**
 * English search-intent domain for "why does a SQL JOIN duplicate rows".
 *
 * The fixture and every displayed count are computed here. The React island
 * only renders snapshots, so tests can assert the same numbers the user sees.
 */

export interface OrderRow {
  readonly id: string
  readonly orderId: string
  readonly amount: number
}

export interface PaymentRow {
  readonly id: string
  readonly orderId: string
  readonly paidAmount: number
  readonly paidOn: string
}

export interface ShipmentRow {
  readonly id: string
  readonly orderId: string
  readonly carrier: string
}

export interface AggregatedPayment {
  readonly id: string
  readonly orderId: string
  readonly paidTotal: number
  readonly paymentCount: number
}

export interface AggregatedShipment {
  readonly id: string
  readonly orderId: string
  readonly shipmentCount: number
}

export interface JoinResultRow {
  readonly id: string
  readonly orderId: string
  readonly orderAmount: number
  readonly paymentId: string | null
  readonly paidAmount: number | null
  readonly paymentCount: number | null
  readonly shipmentId: string | null
  readonly carrier: string | null
  readonly shipmentCount: number | null
}

export interface JoinMetrics {
  readonly joinedRows: number
  readonly distinctOrders: number
  readonly sumOrderAmount: number
  readonly expectedOrderTotal: number
  readonly overcountedAmount: number
}

export type JoinDemoMode = 'none' | 'payments' | 'payments-shipments' | 'aggregated' | 'exists'

export interface JoinDemoState {
  readonly mode: JoinDemoMode
  readonly orders: readonly OrderRow[]
  readonly payments: readonly PaymentRow[]
  readonly shipments: readonly ShipmentRow[]
  readonly aggregatedPayments: readonly AggregatedPayment[]
  readonly aggregatedShipments: readonly AggregatedShipment[]
  readonly resultRows: readonly JoinResultRow[]
  readonly metrics: JoinMetrics
}

export type JoinStepKind = 'observe' | 'expand' | 'diagnose' | 'distinct' | 'fix'

export interface JoinHighlight {
  readonly kind: JoinStepKind
  readonly activeTables: readonly ('orders' | 'payments' | 'shipments')[]
  readonly orderIds: readonly string[]
  readonly paymentIds: readonly string[]
  readonly shipmentIds: readonly string[]
  readonly resultRowIds: readonly string[]
  readonly risk: boolean
}
