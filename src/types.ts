import type {
  QualityCheckResult,
  QualityEvent,
  QualityEvidence,
  QualityReleaseDecision,
  QualitySample,
} from './features/data-quality/types'

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

export interface LayerEvolutionSource {
  id: string
  label: string
  detail: string
}

export interface LayerEvolutionConsumer {
  id: string
  label: string
  detail: string
}

export interface LayerEvolutionDemand {
  id: string
  label: string
  title: string
  description: string
  architecture: 'direct' | 'shared'
  consumers: LayerEvolutionConsumer[]
  repeatedWork: string[]
}

export interface LayerEvolutionStage {
  id: string
  label: string
  title: string
  detail: string
  output: string
}

export interface LayerEvolutionVisualization {
  kind: 'layer-evolution'
  sources: LayerEvolutionSource[]
  demands: LayerEvolutionDemand[]
  sharedStages: LayerEvolutionStage[]
}

export interface ReportMetricJourneyStep {
  id: string
  label: string
  title: string
  detail: string
  value?: string
}

export interface ReportMetricJourneyVisualization {
  kind: 'report-metric-journey'
  metricLabel: string
  formula: string
  result: string
  steps: ReportMetricJourneyStep[]
}

export type WarehouseTermId = 'oltp' | 'etl' | 'elt' | 'olap' | 'data-warehouse'

export interface WarehouseTermDefinition {
  id: WarehouseTermId
  group: string
  groupLabel: string
  term: string
  chinese: string
  fullName: string
  solves: string
  relation: string
}

export interface WarehouseTermScenario {
  id: string
  label: string
  prompt: string
  answerLabel: string
  answerTermIds: WarehouseTermId[]
  explanation: string
}

export interface WarehouseTermsVisualization {
  kind: 'warehouse-terms'
  terms: WarehouseTermDefinition[]
  scenarios: WarehouseTermScenario[]
}

export type LineageEntityType = 'table' | 'field' | 'task' | 'metric'
export type LineageRelationType = 'transform' | 'depends_on' | 'derives' | 'consumes'
export type LineageEvidenceSource =
  | 'sql_transformation'
  | 'task_dependency'
  | 'manual_metadata'
  | 'metric_definition'
  | 'quality_event'

/** A relationship can be confirmed by its evidence or remain pending verification. */
export type LineageVerificationStatus = 'confirmed' | 'pending'

/** @deprecated Use LineageVerificationStatus; retained for legacy consumers only. */
export type LineageConfidence = 'confirmed' | 'inferred' | 'manual'
export type LineageEventType =
  'field_change' | 'quality_alert' | 'task_failure' | 'sql_transformation'

export interface LineageEvidence {
  /** The provenance of the relationship, not its verification state. */
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
  /** Explicit provenance fields keep evidence source separate from verification state. */
  evidenceSource?: LineageEvidenceSource
  verificationStatus?: LineageVerificationStatus
  /** @deprecated Legacy graph data may still provide the old three-value field. */
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

export type TeachingTableCell = string | number
export type TeachingTableRow = Record<string, TeachingTableCell>

export interface TeachingTableData {
  columns: string[]
  rows: TeachingTableRow[]
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

export type LoanProcessStepId = 'contract' | 'disbursement' | 'repayment' | 'settlement'

export interface LoanProcessStep {
  id: LoanProcessStepId
  title: string
  objectName: string
  event: string
  businessProcess: string
  analysisObject: string
  recordCount: number
  detail: string
}

export type LoanProcessMeasureId =
  'contract-amount' | 'disbursed-principal' | 'new-note-principal' | 'current-balance'

export interface LoanProcessMeasure {
  id: LoanProcessMeasureId
  label: string
  field: string
  displayValue: string
  description: string
}

export interface LoanBusinessProcessVisualization {
  kind: 'loan-business-process'
  customerLabel: string
  contractLabel: string
  steps: LoanProcessStep[]
  measures: LoanProcessMeasure[]
  defaultStepId: LoanProcessStepId
}

export type LoanGrainId = 'contract' | 'loan-note' | 'repayment'

export interface LoanGrainOption {
  id: LoanGrainId
  label: string
  statement: string
  identity: string
  primaryKey: string
  rowMeaning: string
  columns: string[]
  rows: TeachingTableRow[]
  amountField: string
  amountLabel: string
  amountValue: string
  canAnswer: string[]
  cannotAnswer: string[]
}

export interface LoanGrainErrorDemo {
  wrongColumns: string[]
  wrongRows: TeachingTableRow[]
  fixedColumns: string[]
  fixedRows: TeachingTableRow[]
  actualContractAmount: number
  wrongMeasure: string
  fixedMeasure: string
  wrongSql: string
  fixedSql: string
}

export interface LoanGrainVisualization {
  kind: 'loan-grain'
  contractId: string
  contractAmount: number
  options: LoanGrainOption[]
  errorDemo: LoanGrainErrorDemo
}

export type BankingSchemaFieldGroupRole = 'event' | 'angle' | 'measure'

export interface BankingSchemaFieldGroup {
  id: string
  label: string
  role: BankingSchemaFieldGroupRole
  tone: StarSchemaTone
  fields: string[]
  explanation: string
}

export interface BankingSchemaTable {
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

export interface BankingSchemaObservation {
  id: string
  label: string
  dimensionId: string
  question: string
  answer: string
  detail: string
}

export interface BankingSnowflakeComparison {
  starLabel: string
  starDetail: string
  snowflakeLabel: string
  snowflakeDetail: string
  decision: string
}

export interface BankingStarSchemaVisualization {
  kind: 'banking-star-schema'
  rawTable: TeachingTableData
  fieldGroups: BankingSchemaFieldGroup[]
  tables: BankingSchemaTable[]
  observations: BankingSchemaObservation[]
  snowflake: BankingSnowflakeComparison
}

export type BankingFactTypeId = 'transaction' | 'periodic-snapshot' | 'accumulating-snapshot'

export interface BankingFactTypeDefinition {
  id: BankingFactTypeId
  label: string
  englishName: string
  rowMeaning: string
  trigger: string
  timeSemantics: string
  canAnswer: string
  cannotAnswer: string
  columns: string[]
  rows: TeachingTableRow[]
}

export interface LoanNoteLifecycleMilestone {
  id: string
  label: string
  field: string
  date: string
  status: string
  description: string
}

export interface LoanNoteLifecycleDefinition {
  noteId: string
  milestones: LoanNoteLifecycleMilestone[]
}

export interface BankingFactTypesVisualization {
  kind: 'banking-fact-types'
  factTypes: BankingFactTypeDefinition[]
  loanNoteLifecycle: LoanNoteLifecycleDefinition
}

export interface BankingCustomerVersion {
  customerSk: number
  customerId: string
  level: string
  branch: string
  effectiveFrom: string
  effectiveTo: string
  isCurrent: boolean
}

export type BankingCustomerAttributeUpdate = Partial<
  Pick<BankingCustomerVersion, 'level' | 'branch'>
>

export interface BankingCustomerHistoryChange extends BankingCustomerAttributeUpdate {
  customerSk: number
  effectiveFrom: string
}

export interface BankingCustomerLoanNote {
  noteId: string
  customerId: string
  disbursedDate: string
  disbursedPrincipal: number
}

export type BankingCustomerTimelinePointKind = 'start' | 'loan-note' | 'change' | 'now'

export interface BankingCustomerTimelinePoint {
  date: string
  label: string
  detail: string
  kind: BankingCustomerTimelinePointKind
}

export interface BankingCustomerHistoryVisualization {
  kind: 'banking-customer-history'
  initialVersion: BankingCustomerVersion
  change: BankingCustomerHistoryChange
  loanNote: BankingCustomerLoanNote
  timeline: BankingCustomerTimelinePoint[]
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

export type BankingMetricCustomerScope = 'all' | 'individual' | 'corporate' | 'small-business'
export type BankingMetricCustomerCategory = Exclude<BankingMetricCustomerScope, 'all'>
export type BankingMetricProduct = 'demand' | 'term' | 'negotiated' | 'margin'
export type BankingMetricProductScope = 'all' | BankingMetricProduct
export type BankingMetricBranch = 'hangzhou' | 'shanghai'
export type BankingMetricBranchScope = 'all' | BankingMetricBranch
export type BankingMetricCurrency = 'CNY' | 'USD'

export interface BankingMetricAccountSnapshot {
  accountId: string
  snapshotDate: string
  customerScope: BankingMetricCustomerCategory
  product: BankingMetricProduct
  branch: BankingMetricBranch
  currency: BankingMetricCurrency
  status: 'active' | 'closed'
  balance: number
}

export interface BankingMetricBalanceFilter {
  snapshotDate: string
  customerScope: BankingMetricCustomerScope
  productScope: BankingMetricProductScope
  branch: BankingMetricBranchScope
  currency: BankingMetricCurrency
  excludedProducts?: BankingMetricProduct[]
}

export interface BankingMetricScopeScenario {
  id: string
  label: string
  title: string
  description: string
  filter: BankingMetricBalanceFilter
}

export interface BankingMetricDefinition {
  name: string
  businessMeaning: string
  statisticTime: string
  subject: string
  measure: string
  customerScope: string
  productScope: string
  branch: string
  currency: string
  unit: string
  requiredFilters: string
  grain: string
}

export type BankingMetricDefinitionStageId = 'name-only' | 'whole-bank' | 'specific-scope'

export interface BankingMetricDefinitionStage {
  id: BankingMetricDefinitionStageId
  label: string
  description: string
  definition: BankingMetricDefinition
}

export interface BankingMetricScopeVisualization {
  kind: 'banking-metric-scope'
  targetDate: string
  snapshots: BankingMetricAccountSnapshot[]
  scenarios: BankingMetricScopeScenario[]
}

export interface BankingMetricDefinitionVisualization {
  kind: 'banking-metric-definition'
  stages: BankingMetricDefinitionStage[]
}

export type BankingMetricTimeMode = 'as-of' | 'period'

export interface BankingMetricSnapshotRow {
  accountId: string
  snapshotDate: string
  balance: number
}

export type BankingMetricTransactionType = 'deposit' | 'withdrawal'

export interface BankingMetricTransactionEvent {
  transactionId: string
  accountId: string
  eventDate: string
  type: BankingMetricTransactionType
  amount: number
}

export interface BankingMetricTimeVisualization {
  kind: 'banking-metric-time'
  asOfDate: string
  periodStart: string
  periodEnd: string
  snapshots: BankingMetricSnapshotRow[]
  transactions: BankingMetricTransactionEvent[]
}

export interface BankingMetricDerivationVisualization {
  kind: 'banking-metric-derivations'
  snapshots: BankingMetricAccountSnapshot[]
  defaultFilter: BankingMetricBalanceFilter
}

export type LakehouseArchitecture = 'warehouse' | 'lake' | 'lakehouse'
export type LakehouseWorkload = 'bi' | 'exploration' | 'ml' | 'streaming'
export type LakehouseDataVolumeCategory = 'small' | 'medium' | 'large'
export type LakehouseLessonFocus = 'lake-first' | 'replication' | 'table-layer' | 'unity'
export type LakehouseDemandId =
  'high-frequency-bi' | 'low-frequency-history' | 'detail-retention' | 'sla-query'
export type LakehouseReplicaStatus = 'lake-only' | 'lake-and-warehouse'
export type LakehouseAtomicCommitStatus = 'idle' | 'failed' | 'committed'
export type LakehouseUnityMode = 'heterogeneous' | 'shared-table'
export type LakehouseUnityDimensionId =
  'storage' | 'data-copy' | 'table-semantics' | 'metadata' | 'catalog' | 'compute' | 'governance'
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

export interface LakehouseLakeFirstDemand {
  id: LakehouseDemandId
  label: string
  description: string
  accessFrequency: string
  querySla: string
  queryComplexity: string
  consumer: string
  warehouseSourceIds: string[]
  warehouseReason: string
  lakeOnlyReason: string
}

export interface LakehouseLakeFirstVisualization {
  demands: LakehouseLakeFirstDemand[]
  defaultDemandId: LakehouseDemandId
}

export interface LakehouseLakeFirstAssessmentItem {
  sourceId: string
  status: LakehouseReplicaStatus
  reason: string
}

export interface LakehouseLakeFirstAssessment {
  demand: LakehouseLakeFirstDemand
  items: LakehouseLakeFirstAssessmentItem[]
  warehouseCount: number
  summary: string
}

export interface LakehouseReplicationDataset {
  id: string
  label: string
  identity: string
  grain: string
  rowCount: number
  version: string
  schema: string[]
}

export interface LakehouseReplicationConfig {
  dataset: LakehouseReplicationDataset
  syncDuration: string
  syncedAt: string
  warehouseVersion: string
  warehouseSchema: string[]
  responsibilities: string[]
}

export interface LakehouseReplicationState {
  syncStatus: 'pending' | 'synced'
  replicaCount: number
  lakeVersion: string
  warehouseVersion: string | null
  lakeSchema: string[]
  warehouseSchema: string[] | null
  syncDelay: string
  responsibilities: string[]
}

export interface LakehouseTableLayerConfig {
  tableName: string
  fileCount: number
  failureAt: number
  openTableFormats: string[]
  evolutionSummary: string
}

export interface LakehouseAtomicCommitState {
  status: LakehouseAtomicCommitStatus
  fileCount: number
  failureAt: number
  /** 已写入存储的文件数。已写入不等于已提交，也不等于读者可见。 */
  writtenFileCount: number
  /** 已被 Commit 纳入新 Snapshot 的文件数。 */
  committedFileCount: number
  /** 本次批次中读者可见的文件数。只有 committed 状态大于 0。 */
  visibleFileCount: number
  message: string
}

export type LakehouseVisibilityStepId = 'files' | 'metadata' | 'pointer' | 'reader'

/**
 * 可见性因果链每一步的真实状态。empty / pending 都是“还没有形成可见版本”，
 * committed 表示这一步已经完成，unchanged 表示仍停留在旧版本
 * （指针未移动或读者仍读旧版本），time-travel 表示本次查询读取历史 Snapshot。
 */
export type LakehouseVisibilityStepState =
  'empty' | 'pending' | 'committed' | 'unchanged' | 'time-travel'

export interface LakehouseVisibilityStep {
  id: LakehouseVisibilityStepId
  label: string
  state: LakehouseVisibilityStepState
  value: string
  detail: string
}

/**
 * Snapshot Pointer 状态：把「正式发布状态」与「本次查询目标」分开表达。
 * published* 只来自已提交的 snapshots；queryTarget* 是一次读取的目标。
 */
export interface LakehouseSnapshotPointerState {
  publishedVersion: number
  publishedSnapshotId: string
  publishedCommittedAt: string
  previousPublishedVersion: number | null
  pointerMoved: boolean
  queryTargetVersion: number
  queryTargetSnapshotId: string
  queryTargetIsPublished: boolean
  readerVersion: number
  metadataStatus: 'not-started' | 'uncommitted' | 'committed'
  metadataVersion: number
  visibilitySteps: LakehouseVisibilityStep[]
  summary: string
}

export interface LakehouseUnityDimension {
  id: LakehouseUnityDimensionId
  label: string
  heterogeneous: string
  sharedTable: string
}

export interface LakehouseUnityConfig {
  defaultMode: LakehouseUnityMode
  dimensions: LakehouseUnityDimension[]
  responsibilities: Record<LakehouseUnityMode, string[]>
}

export interface LakehouseUnityState {
  mode: LakehouseUnityMode
  modeLabel: string
  replicaCount: number
  dimensions: Array<LakehouseUnityDimension & { value: string }>
  responsibilities: string[]
}

interface LakehouseVisualizationBase {
  kind: 'lakehouse'
  dataSources: LakehouseDataSource[]
  snapshots: LakehouseSnapshot[]
  evolutionCommit: LakehouseSnapshotCommit
}

export type LakehouseVisualization =
  | (LakehouseVisualizationBase & {
      focus: 'lake-first'
      lakeFirst: LakehouseLakeFirstVisualization
    })
  | (LakehouseVisualizationBase & {
      focus: 'replication'
      replication: LakehouseReplicationConfig
    })
  | (LakehouseVisualizationBase & {
      focus: 'table-layer'
      tableLayer: LakehouseTableLayerConfig
    })
  | (LakehouseVisualizationBase & {
      focus: 'unity'
      unity: LakehouseUnityConfig
    })

export interface LakehouseArchitectureState {
  architecture: LakehouseArchitecture
  storageType: string
  computeSeparation: 'coupled' | 'partial' | 'separated'
  partitionFileLayoutHint: string
  workload: LakehouseWorkload
  dataVolumeCategory: LakehouseDataVolumeCategory
}

export type GovernanceAssetType = 'table' | 'view' | 'dataset'
export type GovernanceLifecycle = 'active' | 'deprecated' | 'retiring'
export type GovernanceSensitivity = 'public' | 'internal' | 'sensitive' | 'restricted'
export type GovernanceDefinitionCompleteness = 'complete' | 'partial' | 'ambiguous'
export type GovernanceFreshnessStatus = 'current' | 'delayed' | 'unknown'
export type GovernanceQualityStatus = 'pass' | 'unknown'
export type GovernanceOwnerStatus = 'assigned' | 'missing'
export type GovernanceLessonFocus =
  'asset-selection' | 'evidence-check' | 'field-access' | 'lifecycle' | 'change-responsibility'

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
  maskingSample?: string
  lineageNodeId?: string
}

export type GovernanceFieldAccessOutcome = 'direct' | 'masked' | 'unavailable'

export interface GovernanceFieldAccessResult {
  outcome: GovernanceFieldAccessOutcome
  label: string
  reason: string
  value?: string
  evidence: string[]
}

export interface GovernanceQualityCase {
  id: string
  label: string
  assetId: string
  semanticMatch: boolean
  grainMatch: boolean
  qualityStatus: GovernanceQualityStatus
  freshnessLabel: string
  freshnessStatus: GovernanceFreshnessStatus
  evidence: string[]
}

export interface GovernanceEvidenceDecision {
  status: 'recommended' | 'not-recommended'
  headline: '建议使用' | '暂不建议使用'
  evidence: string[]
  reason: string
}

export type GovernanceResponsibilityKind = 'source' | 'asset' | 'consumer'

export interface GovernanceResponsibilityItem {
  id: string
  kind: GovernanceResponsibilityKind
  label: string
  assetId?: string
  owner: string
  action: string
}

export interface GovernanceChangeImpact {
  evidenceLabel: string
  changedField: string
  path: string[]
  responsibilities: GovernanceResponsibilityItem[]
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
 * A small governance projection of the chapter 06 Quality Contract.
 * Governance owns the summary; the quality domain still owns the full event/check model.
 */
export interface GovernanceQualitySample {
  sampleId: QualitySample['sampleId']
  rowKey: QualitySample['rowKey']
  values: QualitySample['values']
  reason: QualitySample['reason']
}

export interface GovernanceQualityEvidenceItem {
  evidenceId: QualityEvidence['evidenceId']
  kind: QualityEvidence['kind']
  detail: QualityEvidence['detail']
  observedValue: QualityEvidence['observed']
  expectedValue: QualityEvidence['expected']
  expectedLabel: string
  samples: GovernanceQualitySample[]
}

export interface GovernanceQualityEvidence {
  source: 'chapter-06'
  status: QualityCheckResult['status']
  severity?: QualityEvent['severity']
  eventId?: QualityEvent['eventId']
  ruleId: QualityEvent['ruleId']
  ruleName?: string
  target: QualityEvent['target']
  observedValue: number
  expectedValue: number
  expectedLabel: string
  evidence: GovernanceQualityEvidenceItem[]
  failedSampleCount: number
  lastCheckedAt: string
  schedulerTaskId: QualityEvent['schedulerContext']['taskId']
  schedulerRunId: QualityEvent['schedulerContext']['runId']
  taskStatus: QualityEvent['schedulerContext']['taskStatus']
  releaseDecision: {
    action: QualityReleaseDecision['action']
    status: QualityReleaseDecision['status']
    isBlocked: QualityReleaseDecision['isBlocked']
    affectedOutputs: readonly string[]
  }
  remainingRisk: string
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
  qualityEvidence?: GovernanceQualityEvidence
  qualityStatus?: GovernanceQualityStatus
  qualityNote?: string
  replacementAssetId?: string
}

export type GovernanceRole = 'analyst' | 'marketing' | 'external-collaborator'
export type GovernancePurpose =
  'business-analysis' | 'customer-service' | 'user-outreach' | 'data-export' | 'external-sharing'
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
  evidence?: LineageEvidence[]
  confidence?: LineageConfidence
}

export type GovernanceNotificationPriority = 'urgent' | 'first' | 'next' | 'review'
export type GovernanceRiskLevel = 'standard' | 'elevated' | 'critical'

export interface GovernanceNotificationTarget {
  id: string
  label: string
  recipient: string
  reason: string
  priority: GovernanceNotificationPriority
}

export interface GovernanceLineageImpact {
  source?: GovernanceImpactObject
  upstreamImpacts: GovernanceImpactObject[]
  directImpacts: GovernanceImpactObject[]
  transitiveImpacts: GovernanceImpactObject[]
  consumers: GovernanceImpactObject[]
  notificationTargets: GovernanceNotificationTarget[]
  suggestedOrder: GovernanceImpactObject[]
  riskLevel: GovernanceRiskLevel
  riskReason: string
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
  lifecycle: GovernanceLifecycle
  owner?: string
  sensitivity: GovernanceSensitivity
  qualityEvidenceUsed: string[]
  lineageEvidenceUsed: string[]
  impactEventId?: string
  directImpact: string[]
  transitiveImpact: string[]
  consumers: string[]
  notifications: string[]
  remainingRisks: string[]
}

export interface GovernanceVisualization {
  kind: 'governance'
  focus: GovernanceLessonFocus
  assets: GovernanceAsset[]
  lineageNodes: LineageNode[]
  lineageEdges: LineageEdge[]
  events: GovernanceLifecycleEvent[]
  qualityCases?: GovernanceQualityCase[]
  changeImpact?: GovernanceChangeImpact
}
