import type { TransformationTaskContract } from '../sql-transformation/types'

export type SchedulerLayer = 'ods' | 'dwd' | 'dws' | 'ads'

export type SchedulerTaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'retry' | 'skipped'

export type SchedulerDependencyState = 'waiting' | 'ready' | 'satisfied' | 'blocked'
export type SchedulerSlaState = 'not-started' | 'on-time' | 'at-risk' | 'breached'
export type SchedulerOutputState = 'not-produced' | 'available' | 'stale' | 'duplicate'

export type SchedulerScenario = 'happy-path' | 'upstream-late' | 'dwd-retry' | 'dwd-blocked'
export type SchedulerRunTrigger = 'schedule' | 'partition-rerun' | 'full-rerun'
export type SchedulerRerunMode = 'partial' | 'full'
export type SchedulerRunStatus = 'queued' | 'running' | 'success' | 'failed'

export type SchedulerEventType =
  | 'schedule'
  | 'queue'
  | 'start'
  | 'success'
  | 'failure'
  | 'retry'
  | 'skip'
  | 'upstream-late'
  | 'rerun'
  | 'recovery'

export interface SchedulerTaskDefinition {
  taskId: string
  label: string
  layer: SchedulerLayer
  description: string
  dependsOn: readonly string[]
  contract: TransformationTaskContract
  durationMinutes: number
  maxAttempts: number
  slaMinutes: number
}

export interface SchedulerAttemptRecord {
  attempt: number
  status: Extract<SchedulerTaskStatus, 'running' | 'success' | 'failed'>
  queuedAt: string
  startedAt: string | null
  endedAt: string | null
  runtimeMinutes: number | null
  failureReason?: string
}

export interface SchedulerPartition {
  column: string
  value: string
}

export interface SchedulerTaskRunRecord {
  taskId: string
  runId: string
  businessDate: string
  partition: SchedulerPartition
  status: SchedulerTaskStatus
  dependencyState: SchedulerDependencyState
  dependencyTaskIds: readonly string[]
  attempt: number
  attempts: readonly SchedulerAttemptRecord[]
  queuedAt: string
  startedAt: string | null
  endedAt: string | null
  runtimeMinutes: number | null
  delayMinutes: number
  slaState: SchedulerSlaState
  outputState: SchedulerOutputState
  isReused: boolean
  failureReason?: string
}

export interface SchedulerEvent {
  eventId: string
  type: SchedulerEventType
  timestamp: string
  runId: string
  taskId?: string
  businessDate: string
  partition: SchedulerPartition
  attempt?: number
  status?: SchedulerTaskStatus
  dependencyState?: SchedulerDependencyState
  slaState?: SchedulerSlaState
  outputState?: SchedulerOutputState
  message: string
}

export interface SchedulerRunState {
  runId: string
  businessDate: string
  partition: SchedulerPartition
  trigger: SchedulerRunTrigger
  scenario: SchedulerScenario
  status: SchedulerRunStatus
  clock: string
  scheduledAt: string
  maxConcurrentTasks: number
  lateDataAvailableAt: string | null
  isLateDataAvailable: boolean
  recoveredTaskIds: readonly string[]
  tasks: readonly SchedulerTaskDefinition[]
  taskRuns: Readonly<Record<string, SchedulerTaskRunRecord>>
  events: readonly SchedulerEvent[]
}

export interface SchedulerRunOptions {
  businessDate: string
  scenario?: SchedulerScenario
  trigger?: SchedulerRunTrigger
  runId?: string
  scheduledAt?: string
  maxConcurrentTasks?: number
  rerunPlan?: SchedulerRerunPlan
}

export type SchedulerAction =
  | { type: 'advance' }
  | { type: 'start-task'; taskId: string }
  | { type: 'complete-task'; taskId: string }
  | { type: 'fail-task'; taskId: string; reason?: string }
  | { type: 'recover-task'; taskId: string }
  | { type: 'mark-late-data' }

export interface SchedulerRerunPlan {
  mode: SchedulerRerunMode
  businessDate: string
  partition: SchedulerPartition
  targetTaskId: string
  taskIds: readonly string[]
  reusedTaskIds: readonly string[]
  outputTables: readonly string[]
  reason: string
}

export interface SchedulerOutputComparison {
  writeMode: 'overwrite-partition' | 'append'
  isIdempotent: boolean
  firstRunRows: number
  rerunRows: number
  finalRows: number
  duplicateRows: number
  outputState: Extract<SchedulerOutputState, 'available' | 'duplicate'>
  explanation: string
}

export interface SchedulerRerunComparison {
  taskId: string
  outputTable: string
  idempotent: SchedulerOutputComparison
  nonIdempotent: SchedulerOutputComparison
}

export interface SchedulerOutputPreview {
  beforeLateRows: number
  beforeLateAmount: number
  afterLateRows: number
  afterLateAmount: number
}

export interface SchedulerVisualization {
  kind: 'scheduler'
  targetDate: string
  tasks: readonly SchedulerTaskDefinition[]
  taskContract: TransformationTaskContract
  outputPreview: SchedulerOutputPreview
  lateDataArrivalAt: string
  lateBusinessDate: string
}
