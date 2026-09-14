export type TransformationScalar = string | number | null
export type TransformationRow = Record<string, TransformationScalar>

export type TransformationLayer = 'ods' | 'dwd' | 'dws' | 'ads'
export type TransformationGrain = 'order-item' | 'order' | 'day'

export type TransformationStepId =
  | 'deduplicate'
  | 'join-users'
  | 'wrong-join'
  | 'fix-join'
  | 'build-dws'
  | 'wrong-group-by'
  | 'build-ads'
  | 'late-data'

export type TransformationPrediction = 'increase' | 'decrease' | 'unchanged'
export type TransformationRowChangeKind =
  'same' | 'added' | 'removed' | 'merged' | 'duplicated' | 'updated'

export type TransformationEvidenceKind =
  | 'duplicate-event'
  | 'null-preserved'
  | 'many-to-many'
  | 'grain-mismatch'
  | 'time-boundary'
  | 'late-partition'

export interface OrderEvent {
  eventId: string
  orderId: string
  userId: string
  orderTime: string
  status: 'PAID' | 'PENDING'
  orderAmount: number
  updatedAt: string
  ingestedAt: string
}

export interface OrderItemEvent {
  itemId: string
  orderId: string
  product: string
  quantity: number
  unitPrice: number
  itemAmount: number
}

export interface UserRecord {
  userId: string
  userName: string
  city: string
}

export interface PaymentEvent {
  paymentId: string
  orderId: string
  transactionKey: string
  paidAt: string | null
  amount: number | null
  status: 'SUCCESS' | 'PENDING'
  updatedAt: string
  ingestedAt: string
}

export interface RefundEvent {
  refundId: string
  orderId: string
  refundedAt: string
  amount: number
  status: 'SUCCESS' | 'VOID'
}

export interface LateOrderBundle {
  order: OrderEvent
  item: OrderItemEvent
  payment: PaymentEvent
}

export interface TransformationDataset {
  targetDate: string
  orders: readonly OrderEvent[]
  orderItems: readonly OrderItemEvent[]
  users: readonly UserRecord[]
  payments: readonly PaymentEvent[]
  refunds: readonly RefundEvent[]
  lateOrder: LateOrderBundle
}

export interface TransformationTableSnapshot {
  id: string
  name: string
  grain: string
  columns: readonly string[]
  rows: readonly TransformationRow[]
  rowKey: readonly string[]
  amountColumn?: string
}

export interface TransformationLayerSnapshot {
  layer: TransformationLayer
  label: string
  title: string
  description: string
  tables: readonly TransformationTableSnapshot[]
}

export interface TransformationTaskContract {
  taskId: string
  inputTables: readonly string[]
  outputTable: string
  partition: {
    column: string
    value: string
  }
  dependencies: readonly string[]
  isIdempotent: boolean
  supportsPartialRerun: boolean
  rerunHint: string
}

export interface SqlTransformationVisualization {
  kind: 'sql-transformation'
  targetDate: string
  dataset: TransformationDataset
  taskContract: TransformationTaskContract
}

export interface TransformationStepDefinition {
  id: TransformationStepId
  number: string
  label: string
  title: string
  layer: string
  sql: string
  description: string
  expectedChange: TransformationPrediction
  expectedChangeLabel: string
}

export interface TransformationTableMetrics {
  rowCount: number
  amount: number
  amountColumn: string
  targetRowCount: number
  targetAmount: number
}

export interface TransformationRowChange {
  key: string
  kind: TransformationRowChangeKind
  beforeCount: number
  afterCount: number
}

export interface TransformationEvidence {
  kind: TransformationEvidenceKind
  title: string
  detail: string
  keys: readonly string[]
}

export interface TransformationStepResult {
  step: TransformationStepDefinition
  input: TransformationTableSnapshot
  output: TransformationTableSnapshot
  changes: readonly TransformationRowChange[]
  comparisonColumns: readonly string[]
  evidence: readonly TransformationEvidence[]
  inputMetrics: TransformationTableMetrics
  outputMetrics: TransformationTableMetrics
  actualChange: TransformationPrediction
}

export interface TransformationWorkbenchState {
  targetGrain: TransformationGrain | null
  activeStepId: TransformationStepId
  completedStepIds: readonly TransformationStepId[]
  predictions: Partial<Record<TransformationStepId, TransformationPrediction>>
}
