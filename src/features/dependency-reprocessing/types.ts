/**
 * 依赖链重做专题 · 共享领域类型（Phase 1-A）。
 *
 * 本模块只描述「依赖链重做（reprocessing）」的只读影响分析：
 * - SQL 读写血缘与实际 Job / Plan 调度依赖分开建模；
 * - 影响范围按任务实例（业务日期 + 分区）计算，跨分区不误伤；
 * - 已执行实例进入重做集合，未首次执行实例进入等待集合；
 * - 本层不包含停止 / 重做执行、ODS 门禁与历史模式（Phase 1-B / 1-C）。
 *
 * 术语边界（docs/TERMINOLOGY.md）：
 * - `reprocessing` ≠ `refactoring`；
 * - `waiting` 表示输入 / 依赖尚未满足，不等于失败；
 * - `success` 只表示该任务实例执行完成，不代表质量、交付或消费端已恢复；
 * - 日志按时间记录，不引入“轮次 / generation”字段。
 */

export type ReprocessingLayer = 'ods' | 'dwd' | 'dws' | 'ads' | 'consumer'

/** 任务实例状态；每个状态都必须结合主体（实例）与范围理解。 */
export type TaskInstanceState =
  | 'waiting'
  | 'ready'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'success'
  | 'failed'
  | 'blocked'
  | 'skipped'

/** 该实例状态的来源：正常调度实例，或重做调度实例。 */
export type TaskRunSource = 'normal-schedule' | 'reprocessing'

export interface BusinessPartition {
  column: string
  value: string
}

/** 逻辑表引用；`partitionColumn` 为 null 表示该表不按业务日期分区。 */
export interface TableRef {
  table: string
  partitionColumn: string | null
}

/**
 * 一次读取的传播方式。
 *
 * `left-join` 与其它方式一样构成污染传播边：ODS 数据错误时，即使 LEFT JOIN
 * 的实际结果没有变化，该任务实例仍在血缘范围内，必须重做。
 */
export type LineageTransform = 'select' | 'join' | 'left-join' | 'aggregate' | 'union' | 'window'

/** 任务读取某张逻辑表的方式。 */
export interface TaskInputRef extends TableRef {
  transform: LineageTransform
  /** 教学解释用备注；不参与闭包计算。 */
  notes?: string
}

/** 任务定义：SQL 读写血缘与调度依赖分开声明。 */
export interface ReprocessingTaskDefinition {
  taskId: string
  label: string
  layer: ReprocessingLayer
  reads: readonly TaskInputRef[]
  writes: readonly TableRef[]
  /** 实际 Job / Plan 调度依赖（任务 id），与 reads 血缘相互独立。 */
  dependsOn: readonly string[]
}

/** 由任务读写关系派生的表级 SQL 血缘边。 */
export interface LineageEdge {
  edgeId: string
  taskId: string
  fromTable: string
  toTable: string
  transform: LineageTransform
}

export type ReprocessingLogEvent =
  'scheduled' | 'started' | 'succeeded' | 'failed' | 'stop-requested' | 'stopped' | 'waiting'

export interface ReprocessingInstanceLog {
  /** 按重做时的时分秒记录；没有轮次 / generation 字段。 */
  loggedAt: string
  event: ReprocessingLogEvent
  detail: string
  source: TaskRunSource
}

export interface ReprocessingTaskInstance {
  instanceId: string
  taskId: string
  businessDate: string
  partition: BusinessPartition
  state: TaskInstanceState
  source: TaskRunSource
  logs: readonly ReprocessingInstanceLog[]
}

/** 影响分析输入模型：任务定义 + 实例集合。 */
export interface ReprocessingModel {
  tasks: readonly ReprocessingTaskDefinition[]
  instances: readonly ReprocessingTaskInstance[]
}

/** 一条影响传播证据：为什么另一个实例被纳入影响范围。 */
export interface ImpactEvidence {
  fromInstanceId: string
  toInstanceId: string
  kind: 'lineage' | 'scheduler'
  detail: string
}

/**
 * 实例执行类别：影响集合必须互斥且完备。
 *
 * - `already-executed`：已经执行过（success / failed / stopped）→ 必须重做；
 * - `needs-stop`：正常调度仍在运行 / 就绪（ready / running / stopping）→ 先停止或阻断；
 * - `not-yet-executed`：尚未首次执行（waiting / blocked / skipped）→ 等待依赖，
 *   不伪称为“已经重做”。
 */
export type InstanceExecutionClass = 'already-executed' | 'needs-stop' | 'not-yet-executed'

export interface ImpactAnalysis {
  sourceInstanceId: string
  affectedInstanceIds: readonly string[]
  /** 受影响且已经执行 → 必须重做。 */
  redoInstanceIds: readonly string[]
  /** 受影响且尚未首次执行 → 等待依赖。 */
  waitingInstanceIds: readonly string[]
  /** 受影响且正常调度仍在运行 / 就绪 → 先停止或阻断。 */
  stopRequiredInstanceIds: readonly string[]
  /** 受影响的消费方实例。 */
  consumerInstanceIds: readonly string[]
  /** 不在此次影响范围、不应被误停的实例。 */
  unaffectedInstanceIds: readonly string[]
  /** 受影响实例涉及的任务（首次出现顺序去重）。 */
  deduplicatedTaskIds: readonly string[]
  evidence: readonly ImpactEvidence[]
}

/* ------------------------------------------------------------------ *
 * Phase 1-B：止损 / 等待 / 自动重做 / ODS 门禁与二次修复
 * ------------------------------------------------------------------ */

/** ODS 修复验证的单项检查。 */
export interface ReprocessingOdsCheck {
  id: string
  label: string
  passed: boolean
  detail: string
}

/** ODS 修复验证结果；只有全部通过且至少有一项检查才放行依赖链重做。 */
export interface OdsValidationResult {
  businessDate: string
  checks: readonly ReprocessingOdsCheck[]
  validated: boolean
  blockedReason: string | null
}

/** 重做计划中每个实例的动作语义。 */
export type RedoScheduleItemAction = 'redo-after-stop' | 'redo-executed' | 'run-waiting'

export interface RedoScheduleItem {
  instanceId: string
  taskId: string
  action: RedoScheduleItemAction
}

export interface RedoSchedule {
  /**
   * 模拟器内部标识：仅用于演示本次重做计划与正常 Job / Plan 的隔离，
   * 不是生产平台的批次号或轮次机制。
   */
  simulatorPlanId: string
  businessDate: string
  sourceInstanceId: string
  /** 按依赖顺序排列：上游先于下游。 */
  items: readonly RedoScheduleItem[]
}

/** 正常调度与重做调度之间的互斥冲突。 */
export interface MutualExclusionViolation {
  instanceId: string
  taskId: string
  state: TaskInstanceState
  reason: string
}

export interface MutualExclusionResult {
  ok: boolean
  violations: readonly MutualExclusionViolation[]
}

export type RedoScheduleResult =
  | {
      status: 'blocked'
      reason: string
      schedule: null
      violations: readonly MutualExclusionViolation[]
    }
  | {
      status: 'ready'
      reason: null
      schedule: RedoSchedule
      violations: readonly MutualExclusionViolation[]
    }

/** 由控制器施加到具体实例上的状态转换动作。 */
export type ReprocessingExecutionAction =
  | { type: 'request-stop'; instanceId: string; at: string; reason: string }
  | { type: 'confirm-stop'; instanceId: string; at: string; sideEffectDisposition: string }
  | { type: 'wait'; instanceId: string; at: string; reason: string }
  | { type: 'start-redo'; instanceId: string; at: string }
  | { type: 'complete-redo'; instanceId: string; at: string }
  | { type: 'fail-redo'; instanceId: string; at: string; reason: string }

export interface StopAndWaitResult {
  model: ReprocessingModel
  /** 经过 running → stopping → stopped → waiting 的实例。 */
  stoppedInstanceIds: readonly string[]
  /** 原本 ready、尚未开始执行就被阻断为 waiting 的实例。 */
  blockedInstanceIds: readonly string[]
}

/** ODS 再次修复后的失效结果：受影响 SUCCESS 被清空并重新等待。 */
export interface InvalidationResult {
  model: ReprocessingModel
  invalidatedInstanceIds: readonly string[]
}
