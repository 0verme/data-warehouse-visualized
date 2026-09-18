export type TransformationScalar = string | number | null
export type TransformationRow = Record<string, TransformationScalar>

export type TransformationLayer = 'ods' | 'dwd' | 'dws' | 'ads'
export type TransformationFocus = 'plan' | 'cleaning' | 'join' | 'layers' | 'contract'
export type TransformationGrain = 'account-day' | 'business-scope-day'

export type TransformationStepId =
  'plan' | 'clean-detail' | 'join-fanout' | 'aggregate-layers' | 'contract'

export type TransformationPrediction = 'increase' | 'decrease' | 'unchanged'
export type TransformationRowChangeKind =
  'same' | 'added' | 'removed' | 'merged' | 'duplicated' | 'updated'

export type TransformationEvidenceKind =
  | 'duplicate-snapshot'
  | 'missing-dimension'
  | 'currency-normalized'
  | 'one-to-many'
  | 'grain-mismatch'
  | 'target-scope'

export interface AccountBalanceSnapshot {
  snapshotDate: string
  accountId: string
  balance: number
  currency: string
  updatedAt: string
  ingestedAt: string
}

export interface Account {
  accountId: string
  customerId: string
  productId: string
  branchId: string
}

export interface Customer {
  customerId: string
  customerName: string
  customerScope: string
}

export interface Product {
  productId: string
  productName: string
  productType: string
}

export interface Branch {
  branchId: string
  branchName: string
}

/** 教学辅助对象：一个账户可以关联多个账户介质，用于观察错误 Join 的放大。 */
export interface AccountMedium {
  mediumId: string
  accountId: string
  mediumType: 'CARD' | 'PASSBOOK'
}

export interface TransformationDataset {
  targetDate: string
  accountBalanceSnapshots: readonly AccountBalanceSnapshot[]
  accounts: readonly Account[]
  customers: readonly Customer[]
  products: readonly Product[]
  branches: readonly Branch[]
  accountMedia: readonly AccountMedium[]
}

export interface TransformationTaskContract {
  taskId: string
  inputTables: readonly string[]
  outputTable: string
  outputGrain: string
  businessDate: string
  partition: {
    column: string
    value: string
  }
  dependencies: readonly string[]
  repeatExecution: string
  /** 第 05 章调度实验继续消费的运行属性；第 04 章正文不把它们当作重点。 */
  isIdempotent: boolean
  supportsPartialRerun: boolean
  rerunHint: string
}

export interface SqlTransformationVisualization {
  kind: 'sql-transformation'
  focus: TransformationFocus
  targetDate: string
  dataset: TransformationDataset
  taskContract: TransformationTaskContract
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

export interface TransformationJoinMatch {
  key: string
  leftCount: number
  rightCount: number
  outputCount: number
}

export interface TransformationJoinAnalysis {
  leftTable: string
  rightTable: string
  joinKey: string
  leftRows: number
  rightRows: number
  outputRows: number
  correctOutputRows: number
  correctOutputAmount: number
  wrongTargetAmount: number
  correctTargetAmount: number
  matches: readonly TransformationJoinMatch[]
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
  joinAnalysis?: TransformationJoinAnalysis
}

export interface TransformationWorkbenchState {
  targetGrain: TransformationGrain | null
  activeStepId: TransformationStepId
  completedStepIds: readonly TransformationStepId[]
  predictions: Partial<Record<TransformationStepId, TransformationPrediction>>
}
