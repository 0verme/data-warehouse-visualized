/**
 * 生产实践案例 13-2 · 交付链调查 fixture。
 *
 * 教学场景：`AccountBalanceSnapshot` 的日批 Producer Job 在 2026-09-30
 * 执行 SUCCESS，数据文件也已经 final 并到达接收端；但同一批次的 completion
 * signal 没有按约定发布，Consumer 的触发条件不满足，于是既不消费也不报错。
 *
 * 这里只承载确定性状态与证据语义：Evidence Panel、五状态分类、artifact
 * validation 与 5 项端到端验证都由 model 中的纯函数计算，组件不硬编码结论。
 */

export interface DeliveryFixtureAccount {
  readonly accountId: string
  readonly balance: number
}

export interface DeliveryFixture {
  readonly producerTask: string
  readonly consumerTask: string
  readonly assetName: string
  /** 教学 Grain 声明：一行 = 一个账户在一个快照日的余额状态。 */
  readonly grain: string
  readonly businessDate: string
  readonly batchId: string
  readonly previousBusinessDate: string
  readonly previousBatchId: string
  readonly accounts: readonly DeliveryFixtureAccount[]
}

export interface AccountBalanceSnapshotRow {
  readonly accountId: string
  readonly snapshotDate: string
  readonly balance: number
}

/** Producer 侧产出的数据 artifact：临时文件 → 最终命名的确定性快照。 */
export interface ProducerArtifact {
  readonly tempFileName: string
  readonly tempFilePresent: boolean
  readonly dataFileName: string
  readonly renameCompleted: boolean
  readonly businessDate: string
  readonly batchId: string
  readonly rowCount: number
  readonly rows: readonly AccountBalanceSnapshotRow[]
}

/**
 * 交换区 / 接收端能观察到的文件。
 *
 * 数据文件承载数据行（rowCount 为行数）；completion signal 只声明完成，
 * 不承载数据行，rowCount 固定为 null。
 */
export interface ExchangedFile {
  readonly name: string
  readonly businessDate: string
  readonly batchId: string
  readonly readable: boolean
  readonly rowCount: number | null
}

export interface ExchangeState {
  readonly dataFiles: readonly ExchangedFile[]
  readonly signalFiles: readonly ExchangedFile[]
}

export interface ConsumerBatchRecord {
  readonly batchId: string
  readonly businessDate: string
  readonly rowCount: number
  readonly outcome: 'success' | 'failed'
}

/**
 * Consumer 证据。`triggerCondition` 说明启动条件；本批次是否发生过尝试、
 * 是否失败都由 records 按 batchId 计算，不额外维护可能互相矛盾的状态位。
 */
export interface ConsumerEvidence {
  readonly serviceStatus: 'running'
  readonly triggerCondition: string
  readonly records: readonly ConsumerBatchRecord[]
}

export type DeliveryBoundaryState =
  | 'not-produced'
  | 'produced-incomplete'
  | 'complete-not-transferred'
  | 'delivered-not-recognized'
  | 'recognized-not-consumed'

export interface DeliveryStateInput {
  readonly producerFilePresent: boolean
  readonly tempFilePresent: boolean
  readonly renameCompleted: boolean
  readonly producerRowCount: number
  readonly expectedRowCount: number
  readonly receiverFilePresent: boolean
  readonly receiverFileReadable: boolean
  readonly matchingSignalPresent: boolean
  readonly consumerFailedAttempts: number
}

export interface DeliveryStateLadderItem {
  readonly id: DeliveryBoundaryState
  readonly label: string
  readonly evidenceForm: string
  readonly status: 'current' | 'excluded' | 'open'
}

export interface DeliveryEliminationRow {
  readonly id: Exclude<
    DeliveryBoundaryState,
    'delivered-not-recognized' | 'recognized-not-consumed'
  >
  readonly label: string
  readonly eliminated: boolean
  readonly reason: string
}

export interface ArtifactValidationCheck {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly passed: boolean
}

export interface ArtifactValidation {
  readonly checks: readonly ArtifactValidationCheck[]
  readonly passed: boolean
}

export interface CompletionSignalRestore {
  readonly expectedSignalName: string
  readonly restored: boolean
  readonly alreadyPresent: boolean
  readonly blockedReason: string | null
  readonly exchange: ExchangeState
  readonly blastRadiusNote: string
}

export interface ConsumerEvaluation {
  readonly consumer: ConsumerEvidence
  readonly consumed: boolean
  readonly consumedRowCount: number | null
  readonly reason: string
}

export interface DeliveryVerificationCheck {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly passed: boolean
}

export interface DeliveryLocalization {
  readonly state: DeliveryBoundaryState
  readonly stateLabel: string
  readonly failureBoundary: string
  readonly expectedSignalName: string
  readonly observedSignalNames: readonly string[]
  readonly observedSignalBatchIds: readonly string[]
  readonly excludedState: DeliveryBoundaryState | null
  readonly excludedReason: string | null
  readonly batchIdentityMatches: boolean
}

export interface DeliveryBatchKeyRow {
  readonly id: 'business_date' | 'batch_id' | 'data_file' | 'completion_signal'
  readonly label: string
  readonly expected: string
  readonly observed: string
  readonly matches: boolean
}

export type DeliveryEvidenceState =
  'neutral' | 'success' | 'danger' | 'accent' | 'muted' | 'warning'

export type DeliveryEvidenceField =
  | 'Producer Job'
  | 'business_date'
  | 'batch_id'
  | 'Data File'
  | 'Row Count'
  | 'Completion Signal'
  | 'Receiver'
  | 'Consumer'

export interface DeliveryEvidenceRow {
  readonly field: DeliveryEvidenceField
  readonly value: string
  readonly state: DeliveryEvidenceState
}

export interface DeliveryConsumerObservation {
  readonly label: string
  readonly value: string
  readonly detail: string
}

export type DeliveryInvestigationStepKind =
  | 'symptom'
  | 'producer-evidence'
  | 'observation'
  | 'localization'
  | 'repair'
  | 'verification'
  | 'prevention'

export interface DeliveryReveal {
  readonly businessDate: boolean
  readonly batchId: boolean
  readonly producerArtifact: boolean
  readonly receiverObservation: boolean
  readonly consumerEvidence: boolean
  readonly completionObservation: boolean
  readonly elimination: boolean
  readonly stateLadder: boolean
  readonly localization: boolean
  readonly artifactValidation: boolean
  readonly repair: boolean
  readonly verification: boolean
  readonly contract: boolean
}

export interface DeliveryInvestigationHighlight {
  readonly kind: DeliveryInvestigationStepKind
  readonly focus: 'producer' | 'exchange' | 'consumer' | 'chain'
  readonly risk: boolean
  readonly reveal: DeliveryReveal
}

/** 每一步直接携带的确定性完整快照。 */
export interface DeliveryInvestigationState {
  readonly producer: ProducerArtifact
  readonly exchange: ExchangeState
  readonly consumer: ConsumerEvidence
  /** 基线消费记录，用于「无其他批次副作用」验证。 */
  readonly baseline: ConsumerEvidence
  readonly artifactValidation: ArtifactValidation | null
  readonly repair: CompletionSignalRestore | null
  readonly consumption: ConsumerEvaluation | null
  readonly localization: DeliveryLocalization | null
  readonly verification: readonly DeliveryVerificationCheck[]
}

export interface DeliveryContractField {
  readonly id: string
  readonly name: string
  readonly meaning: string
}

/** Lesson section payload：案例的 fixture 与 Step Kernel 自包含。 */
export interface DeliveryInvestigationVisualization {
  readonly kind: 'delivery-investigation'
}
