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

export type LineageEntityType = 'table' | 'field' | 'task' | 'metric'
export type LineageRelationType = 'transform' | 'depends_on' | 'derives' | 'consumes'
export type LineageEvidenceSource =
  'sql_transformation' | 'task_dependency' | 'manual_metadata' | 'metric_definition'
export type LineageConfidence = 'confirmed' | 'inferred' | 'manual'
export type LineageEventType =
  'field_change' | 'quality_alert' | 'task_failure' | 'sql_transformation'

export interface LineageEvidence {
  source: LineageEvidenceSource
  detail: string
}

export interface LineageNode {
  id: string
  label: string
  layer: string
  role: string
  x: number
  y: number
  /** Legacy table data may omit entityType; omitted values are treated as table nodes. */
  entityType?: LineageEntityType
}

export interface LineageEdge {
  source: string
  target: string
  relation?: LineageRelationType
  evidence?: LineageEvidence
  confidence?: LineageConfidence
}

export interface LineageInvestigationEvent {
  id: string
  sourceEntityId: string
  eventType: LineageEventType
  affectedEntityId: string
  evidence: LineageEvidence
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

export type LakehouseArchitecture = 'warehouse' | 'lake' | 'lakehouse'
export type LakehouseWorkload = 'bi' | 'exploration' | 'ml' | 'streaming'
export type LakehouseConstraint =
  'schema-change' | 'concurrent-writes' | 'history' | 'cost-sensitive' | 'governance'
export type LakehouseCapability =
  | 'flexible-storage'
  | 'schema-management'
  | 'transactions'
  | 'version-history'
  | 'stable-query'
  | 'ad-hoc-analysis'
  | 'ml-access'
  | 'streaming-writes'
  | 'governance'
  | 'compute-separation'
export type LakehouseCapabilityLevel = 'strong' | 'partial' | 'limited'
export type LakehouseDataVolumeCategory = 'small' | 'medium' | 'large'
export type LakehouseCell = string | number | boolean | null
export type LakehouseRow = Record<string, LakehouseCell>

export interface LakehouseDataSource {
  id: string
  label: string
  format: 'table' | 'event-log' | 'json-file'
  detail: string
  example: string
}

export interface LakehouseSnapshot {
  version: number
  id: string
  committedAt: string
  columns: string[]
  rows: LakehouseRow[]
  change: string
}

export interface LakehouseSchemaField {
  name: string
  label: string
  defaultValue: LakehouseCell
}

export interface LakehouseSnapshotCommit {
  committedAt: string
  change: string
  addedFields?: LakehouseSchemaField[]
  rows?: LakehouseRow[]
}

export interface LakehouseScenario {
  id: string
  label: string
  description: string
  workload: LakehouseWorkload
  constraints: LakehouseConstraint[]
  dataVolumeCategory: LakehouseDataVolumeCategory
}

export interface LakehouseVisualization {
  kind: 'lakehouse'
  dataSources: LakehouseDataSource[]
  scenarios: LakehouseScenario[]
  snapshots: LakehouseSnapshot[]
  evolutionCommit: LakehouseSnapshotCommit
}

export type LakehouseFlowStageId =
  'ingestion' | 'storage' | 'table-layer' | 'compute' | 'governance'

export interface LakehouseFlowStage {
  id: LakehouseFlowStageId
  label: string
  status: LakehouseCapabilityLevel
  title: string
  detail: string
}

export type LakehouseConsumerId = 'bi' | 'ad-hoc' | 'ml'

export interface LakehouseConsumerState {
  id: LakehouseConsumerId
  label: string
  status: LakehouseCapabilityLevel
  detail: string
}

export interface LakehouseArchitectureState {
  architecture: LakehouseArchitecture
  storageType: string
  computeSeparation: 'coupled' | 'partial' | 'separated'
  partitionFileLayoutHint: string
  workload: LakehouseWorkload
  dataVolumeCategory: LakehouseDataVolumeCategory
}

export type LakehouseCapabilityMatrix = Record<LakehouseCapability, LakehouseCapabilityLevel>

export interface LakehouseDecisionEvidence {
  kind: 'fit' | 'tradeoff' | 'risk'
  text: string
}

export interface LakehouseDecision {
  scores: Record<LakehouseArchitecture, number>
  recommendedArchitecture: LakehouseArchitecture
  evidence: LakehouseDecisionEvidence[]
}

export interface LakehouseDecisionRecord {
  workload: LakehouseWorkload
  constraints: LakehouseConstraint[]
  chosenArchitecture: LakehouseArchitecture
  benefits: string[]
  tradeoffs: string[]
  risks: string[]
  notSuitableWhen: string[]
}

export type GovernanceAssetType = 'table' | 'view' | 'dataset'
export type GovernanceLifecycle = 'active' | 'deprecated' | 'retiring'
export type GovernanceSensitivity = 'public' | 'internal' | 'sensitive' | 'restricted'
export type GovernanceDefinitionCompleteness = 'complete' | 'partial' | 'ambiguous'
export type GovernanceFreshnessStatus = 'current' | 'delayed' | 'unknown'
export type GovernanceOwnerStatus = 'assigned' | 'missing'

export interface GovernanceCatalogFilters {
  query: string
  tag: 'all' | string
  lifecycle: 'all' | GovernanceLifecycle
  sensitivity: 'all' | GovernanceSensitivity
  ownerStatus: 'all' | GovernanceOwnerStatus
}

export interface GovernanceFreshnessMetadata {
  lastUpdatedAt: string
  expectedRefresh: string
  observedDelayMinutes?: number
  status: GovernanceFreshnessStatus
}

export interface GovernanceBusinessDefinition {
  summary: string
  grain: string
  scope: string
  exclusions?: string
}

export interface GovernanceField {
  name: string
  label: string
  type: string
  description: string
  sensitivity: GovernanceSensitivity
  semanticStatus?: 'stable' | 'review-needed'
  maskingStrategy?: string
  lineageNodeId?: string
}

export interface GovernanceMetricReference {
  name: string
  definition: MetricDefinition
  sourceLessonSlug: string
  note: string
}

export interface GovernanceLineageEvidence {
  status: 'linked' | 'partial' | 'unavailable'
  nodeId?: string
  note: string
}

/**
 * Phase 1 deliberately keeps the quality boundary as an optional reference.
 * It is not a quality result and must not be rendered as pass/fail.
 */
export interface GovernanceQualityEvidenceReference {
  source: 'chapter-07'
  status: 'pending-integration'
  note: string
}

export interface GovernanceAsset {
  id: string
  technicalName: string
  businessName: string
  description: string
  assetType: GovernanceAssetType
  owner?: string
  steward?: string
  tags: string[]
  lifecycle: GovernanceLifecycle
  freshnessMetadata?: GovernanceFreshnessMetadata
  sensitivity: GovernanceSensitivity
  fields: GovernanceField[]
  businessDefinition: GovernanceBusinessDefinition
  definitionCompleteness: GovernanceDefinitionCompleteness
  metricDefinition?: GovernanceMetricReference
  lineageEvidence: GovernanceLineageEvidence
  qualityEvidence?: GovernanceQualityEvidenceReference
}

export type GovernanceRole = 'analyst' | 'marketing' | 'external-collaborator'
export type GovernancePurpose =
  'business-analysis' | 'user-outreach' | 'data-export' | 'external-sharing'
export type GovernancePolicyDecision = 'allow' | 'masked' | 'approval-required' | 'deny'

export interface GovernancePolicyFactor {
  label: string
  value: string
  implication: string
  tone: 'positive' | 'caution' | 'blocking'
}

export interface GovernancePolicyDecisionResult {
  assetId: string
  fieldName: string
  role: GovernanceRole
  purpose: GovernancePurpose
  decision: GovernancePolicyDecision
  reason: string
  evidence: string[]
  policyFactors: GovernancePolicyFactor[]
  remainingRisk: string
}

export type GovernanceRecommendation = 'recommended' | 'usable-with-caution' | 'not-recommended'

export interface GovernanceRecommendationFactor {
  label: string
  tone: 'positive' | 'caution' | 'blocking'
  detail: string
}

export interface GovernanceRecommendationResult {
  status: GovernanceRecommendation
  reasons: string[]
  factors: GovernanceRecommendationFactor[]
}

export type GovernanceLifecycleEventType =
  'owner-missing' | 'field-change' | 'asset-deprecated' | 'asset-retiring' | 'sensitivity-change'

export interface GovernanceLifecycleEvent {
  id: string
  assetId: string
  eventType: GovernanceLifecycleEventType
  label: string
  description: string
  sourceEntityId?: string
  affectedEntityId?: string
  fieldName?: string
  newFieldName?: string
  semanticChange?: string
  newSensitivity?: GovernanceSensitivity
  evidence: LineageEvidence
}

export interface GovernanceLifecycleResult {
  asset: GovernanceAsset
  changed: boolean
  message: string
}

export interface GovernanceImpactObject {
  id: string
  label: string
  entityType: LineageEntityType
  role: string
}

export interface GovernanceNotificationTarget {
  id: string
  label: string
  recipient: string
  reason: string
  priority: 'first' | 'next' | 'review'
}

export interface GovernanceLineageImpact {
  source?: GovernanceImpactObject
  directImpacts: GovernanceImpactObject[]
  transitiveImpacts: GovernanceImpactObject[]
  consumers: GovernanceImpactObject[]
  notificationTargets: GovernanceNotificationTarget[]
  suggestedOrder: GovernanceImpactObject[]
}

export interface GovernanceDecisionRecord {
  id: string
  recordedAt: string
  selectedAssetId: string
  selectedAssetName: string
  fieldName: string
  role: GovernanceRole
  purpose: GovernancePurpose
  recommendation: GovernanceRecommendation
  accessDecision: GovernancePolicyDecision
  decisionReason: string
  impactEventId?: string
  directImpact: string[]
  transitiveImpact: string[]
  consumers: string[]
  notifications: string[]
  remainingRisks: string[]
}

export interface GovernanceVisualization {
  kind: 'governance'
  assets: GovernanceAsset[]
  lineageNodes: LineageNode[]
  lineageEdges: LineageEdge[]
  events: GovernanceLifecycleEvent[]
}
