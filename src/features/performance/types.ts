export type PerformanceLessonFocus =
  'diagnosis' | 'scan-layout' | 'shuffle-skew' | 'first-seen' | 'tradeoffs'

export type PerformanceLayer = 'storage-execution' | 'calculation-plan' | 'business-semantics'

export type PerformanceStageId = 'scan' | 'join' | 'shuffle' | 'aggregate' | 'write'

export interface PerformanceTeachingCase {
  label: string
  description: string
  factObject: string
  factGrain: string
  businessDateField: string
  analysisKey: string
}

export interface PerformanceLayerDefinition {
  id: PerformanceLayer
  label: string
  description: string
}

export interface PerformanceEvidence {
  label: string
  value: string
  detail: string
}

export interface PerformanceStageObservation {
  id: PerformanceStageId
  label: string
  durationMinutes: number
  description: string
  evidence: readonly PerformanceEvidence[]
}

export interface PerformanceDiagnosisFinding {
  evidence: readonly string[]
  hypothesis: string
  nextAction: string
}

export interface PerformanceDiagnosisData {
  symptom: string
  stages: readonly PerformanceStageObservation[]
  totalRuntimeMinutes: number
  longestTask: {
    taskId: string
    label: string
    stage: PerformanceStageId
    durationMinutes: number
  }
  findings: Record<PerformanceStageId, PerformanceDiagnosisFinding>
  validation: {
    targetStage: PerformanceStageId
    beforeStageMinutes: number
    afterStageMinutes: number
    beforeRuntimeMinutes: number
    afterRuntimeMinutes: number
    change: string
    sideEffect: string
  }
}

export type PerformanceScanMode = 'full-history' | 'partition-pruning'
export type PerformanceFileLayout = 'fragmented' | 'compacted'
export type PerformancePartitionDay = 'ordinary' | 'double-11'

export interface PerformanceScanSnapshot {
  id: PerformanceScanMode
  label: string
  historyLabel: string
  partitionsTouched: number
  scanBytes: string
  fileCount: number
  relativeRuntime: string
  detail: string
}

export interface PerformanceFileLayoutSnapshot {
  id: PerformanceFileLayout
  label: string
  fileCount: number
  averageFileSize: string
  readDetail: string
  compactionDetail: string
  relativeRuntime: string
}

export interface PerformancePartitionSizeSnapshot {
  id: PerformancePartitionDay
  label: string
  size: string
  fileCount: number
  relativeRuntime: string
  detail: string
}

export interface PerformanceScanLayoutData {
  scanSnapshots: readonly PerformanceScanSnapshot[]
  fileLayouts: readonly PerformanceFileLayoutSnapshot[]
  partitionSizes: readonly PerformancePartitionSizeSnapshot[]
  targetWindow: string
  historyWindow: string
}

export type PerformanceSkewMode = 'date-partition' | 'shuffle-key'
export type PerformanceSkewStrategy =
  'none' | 'filter-early' | 'aggregate-early' | 'split-hot-key' | 'two-phase' | 'redistribute'

export interface PerformanceWorkerLoad {
  workerId: string
  loadGb: number
  detail: string
}

export interface PerformanceSkewScenario {
  id: PerformanceSkewMode
  label: string
  layer: PerformanceLayer
  title: string
  keyLabel: string
  keyValue: string
  detail: string
  workerLoads: readonly PerformanceWorkerLoad[]
  partitionRows: readonly PerformanceEvidence[]
}

export interface PerformanceSkewStrategyDefinition {
  id: PerformanceSkewStrategy
  label: string
  detail: string
}

export interface PerformanceSkewData {
  scenarios: readonly PerformanceSkewScenario[]
  strategies: readonly PerformanceSkewStrategyDefinition[]
}

export interface CounterpartyTransaction {
  transactionId: string
  businessDate: string
  customerId: string
  counterpartyId: string
  arrivedAt?: string
}

export interface DailyCounterpartyRelation {
  businessDate: string
  customerId: string
  counterpartyId: string
  transactionCount: number
}

export interface FirstSeenRecord {
  customerId: string
  counterpartyId: string
  firstSeenDate: string
}

export interface CustomerDayFeature {
  customerId: string
  businessDate: string
  historicalCounterpartyCount: number
  recent30DayCounterpartyCount: number
}

export interface FirstSeenEvaluation {
  relation: DailyCounterpartyRelation
  isFirstSeen: boolean
  firstSeenDate: string | null
  action: 'write' | 'keep'
}

export interface PerformanceStateData {
  existingFirstSeen: readonly FirstSeenRecord[]
  historicalTransactions: readonly CounterpartyTransaction[]
  todayTransactions: readonly CounterpartyTransaction[]
  todayBusinessDate: string
  recent30DayRelations: readonly DailyCounterpartyRelation[]
  featureRows: readonly CustomerDayFeature[]
  grainNotes: readonly PerformanceEvidence[]
}

export type PerformanceAcceptanceCheckId =
  'correctness' | 'sla-freshness' | 'cost' | 'maintainability'

export interface PerformanceEngineeringMetric {
  id: string
  label: string
  before: string
  after: string
  detail: string
}

export interface PerformanceLateDataCase {
  receivedAt: string
  businessDate: string
  customerId: string
  counterpartyId: string
  currentFirstSeenDate: string
  correctedFirstSeenDate: string
  affectedFeatureRange: string
  repairActions: readonly string[]
}

export interface PerformanceOptimizationChoice {
  id: 'worth-it' | 'not-worth-it'
  label: string
  originalRuntime: string
  optimizedRuntime: string
  sla: string
  addedCost: string
  conclusion: string
}

export interface PerformanceTradeoffData {
  beforeAfter: readonly PerformanceEngineeringMetric[]
  acceptanceChecks: readonly PerformanceEvidence[]
  lateData: PerformanceLateDataCase
  choices: readonly PerformanceOptimizationChoice[]
  reflectionQuestion: string
  reflectionHints: readonly string[]
}

interface PerformanceVisualizationBase {
  kind: 'performance-lab'
  case: PerformanceTeachingCase
  simulationNote: string
}

export interface PerformanceDiagnosisVisualization extends PerformanceVisualizationBase {
  focus: 'diagnosis'
  diagnosis: PerformanceDiagnosisData
}

export interface PerformanceScanLayoutVisualization extends PerformanceVisualizationBase {
  focus: 'scan-layout'
  scanLayout: PerformanceScanLayoutData
}

export interface PerformanceShuffleSkewVisualization extends PerformanceVisualizationBase {
  focus: 'shuffle-skew'
  skew: PerformanceSkewData
}

export interface PerformanceFirstSeenVisualization extends PerformanceVisualizationBase {
  focus: 'first-seen'
  state: PerformanceStateData
}

export interface PerformanceTradeoffsVisualization extends PerformanceVisualizationBase {
  focus: 'tradeoffs'
  tradeoffs: PerformanceTradeoffData
}

export type PerformanceVisualization =
  | PerformanceDiagnosisVisualization
  | PerformanceScanLayoutVisualization
  | PerformanceShuffleSkewVisualization
  | PerformanceFirstSeenVisualization
  | PerformanceTradeoffsVisualization
