export interface SourceSystem {
  id: string
  name: string
  detail: string
  volume: string
}

export interface FlowOutput {
  name: string
  detail: string
}

export interface PipelineStage {
  id: string
  layer: string
  title: string
  description: string
  work: string
  output: string
}

export interface LineageNode {
  id: string
  label: string
  layer: string
  role: string
  x: number
  y: number
}

export interface LineageEdge {
  source: string
  target: string
}

export type StarSchemaFieldRole = 'key' | 'attribute' | 'measure'
export type StarSchemaTableType = 'fact' | 'dimension'
export type StarSchemaTone = 'blue' | 'teal' | 'amber' | 'violet' | 'navy'
export type GrainId = 'order' | 'order-item' | 'user-day'

export type StarSchemaCell = string | number
export type StarSchemaRow = Record<string, StarSchemaCell>

export interface StarSchemaTableData {
  columns: string[]
  rows: StarSchemaRow[]
}

export interface StarSchemaField {
  name: string
  label: string
  role: StarSchemaFieldRole
}

export interface StarSchemaTable {
  id: string
  name: string
  type: StarSchemaTableType
  rowMeaning: string
  key: {
    label: string
    value: string
  }
  fields: StarSchemaField[]
  responsibility: string
}

export interface StarSchemaFieldGroup {
  id: string
  label: string
  tone: StarSchemaTone
  fields: string[]
}

export interface GrainOption {
  id: GrainId
  label: string
  statement: string
  description: string
  columns: string[]
  rows: StarSchemaRow[]
  useCase: string
  boundary: string
  recommended: boolean
}

export interface GrainErrorDemo {
  wrongColumns: string[]
  wrongRows: StarSchemaRow[]
  fixedColumns: string[]
  fixedRows: StarSchemaRow[]
  actualAmount: number
  wrongMeasure: string
  fixedMeasure: string
  wrongSql: string
  fixedSql: string
}

export interface StarSchemaVisualization {
  kind: 'star-schema'
  rawTable: StarSchemaTableData
  rawFieldGroups: StarSchemaFieldGroup[]
  tables: StarSchemaTable[]
  grains: GrainOption[]
  errorDemo: GrainErrorDemo
}

export type ModelingFieldRole = 'process-key' | 'dimension' | 'fact'
export type ModelingFieldTone = 'blue' | 'teal' | 'amber' | 'violet' | 'navy'

export interface ModelingFieldGroup {
  id: string
  label: string
  role: ModelingFieldRole
  tone: ModelingFieldTone
  fields: string[]
  explanation: string
}

export interface ModelingOutputTable {
  id: string
  name: string
  type: 'fact' | 'dimension'
  rowMeaning: string
  fields: string[]
}

export interface ModelingIntroStep {
  id: string
  title: string
  description: string
  example: string
}

export interface ModelingIntroVisualization {
  kind: 'modeling-intro'
  rawTable: StarSchemaTableData
  steps: ModelingIntroStep[]
  fieldGroups: ModelingFieldGroup[]
  outputTables: ModelingOutputTable[]
}

export interface ScdDimensionVersion {
  userId: string
  city: string
  memberLevel: string
  effectiveFrom: string
  effectiveTo: string
  isCurrent: boolean
}

export type ScdAttributeUpdate = Partial<Pick<ScdDimensionVersion, 'city' | 'memberLevel'>>

export interface ScdDimensionChange extends ScdAttributeUpdate {
  effectiveFrom: string
}

export interface ScdOrder {
  id: string
  label: string
  orderTime: string
  amount: number
}

export interface ScdVisualization {
  kind: 'scd'
  initialVersion: ScdDimensionVersion
  change: ScdDimensionChange
  orders: ScdOrder[]
  timelineLabels?: string[]
}

export type MetricStatusRule = 'all' | 'paid'
export type MetricRefundRule = 'gross' | 'net'
export type MetricTimeField = 'orderTime' | 'payTime'
export type MetricGrainMode = 'correct' | 'duplicated'
export type MetricOrderStatus = 'PAID' | 'PENDING'

export interface MetricConfig {
  statusRule: MetricStatusRule
  refundRule: MetricRefundRule
  timeField: MetricTimeField
  grainMode: MetricGrainMode
}

export interface MetricOrder {
  id: string
  orderTime: string
  payTime: string | null
  status: MetricOrderStatus
  orderAmount: number
  refundAmount: number
}

export interface MetricOrderDetail {
  orderId: string
  product: string
  orderAmount: number
}

export interface MetricDefinition {
  name: string
  businessProcess: string
  subject: string
  statusRule: string
  grain: string
  timeField: string
  measure: string
  refundRule: string
  period: string
}

export interface MetricVisualization {
  kind: 'metric-definition'
  targetDate: string
  orders: MetricOrder[]
  detailRows: MetricOrderDetail[]
}
