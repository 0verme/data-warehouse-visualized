/**
 * 依赖链重做专题 · 影响分析纯函数（Phase 1-A）。
 *
 * 影响范围由两类关系取并集后去重：
 * 1. SQL 血缘：受影响任务写出的表被其他任务读取（LEFT JOIN 同样传播）；
 * 2. 调度依赖：实际 Job / Plan 中依赖受影响任务的下游任务（即使没有 SQL 血缘）。
 *
 * 分区守卫：只有同一业务日期 / 分区的实例才会被传播，跨分区不误伤；
 * 无关链路保持在 `unaffectedInstanceIds`。
 *
 * 本模块不包含停止 / 重做执行、ODS 门禁与历史模式；那些属于 Phase 1-B / 1-C。
 */

import type {
  ImpactAnalysis,
  ImpactEvidence,
  InstanceExecutionClass,
  LineageEdge,
  ReprocessingModel,
  ReprocessingTaskDefinition,
  ReprocessingTaskInstance,
  TaskInputRef,
  TaskInstanceState,
} from './types'

interface ModelIndex {
  taskById: ReadonlyMap<string, ReprocessingTaskDefinition>
  instanceById: ReadonlyMap<string, ReprocessingTaskInstance>
  instancesByTaskId: ReadonlyMap<string, readonly ReprocessingTaskInstance[]>
  tasksByReadTable: ReadonlyMap<string, readonly ReprocessingTaskDefinition[]>
  dependentTasksByTaskId: ReadonlyMap<string, readonly string[]>
}

function assertNever(value: never): never {
  throw new Error(`未处理的任务实例状态: ${String(value)}`)
}

/** 将实例状态划分为互斥的三类执行语义。 */
export function classifyInstanceExecution(state: TaskInstanceState): InstanceExecutionClass {
  switch (state) {
    case 'success':
    case 'failed':
    case 'stopped':
      return 'already-executed'
    case 'ready':
    case 'running':
    case 'stopping':
      return 'needs-stop'
    case 'waiting':
    case 'blocked':
    case 'skipped':
      return 'not-yet-executed'
    default:
      return assertNever(state)
  }
}

function buildIndex(model: ReprocessingModel): ModelIndex {
  const taskById = new Map<string, ReprocessingTaskDefinition>()
  for (const task of model.tasks) {
    if (taskById.has(task.taskId)) {
      throw new Error(`任务 id 重复: ${task.taskId}`)
    }
    taskById.set(task.taskId, task)
  }

  const instanceById = new Map<string, ReprocessingTaskInstance>()
  const instancesByTaskId = new Map<string, ReprocessingTaskInstance[]>()
  for (const instance of model.instances) {
    if (instanceById.has(instance.instanceId)) {
      throw new Error(`任务实例 id 重复: ${instance.instanceId}`)
    }
    if (!taskById.has(instance.taskId)) {
      throw new Error(`任务实例 ${instance.instanceId} 引用了未知任务 ${instance.taskId}`)
    }
    instanceById.set(instance.instanceId, instance)
    const list = instancesByTaskId.get(instance.taskId) ?? []
    list.push(instance)
    instancesByTaskId.set(instance.taskId, list)
  }

  const tasksByReadTable = new Map<string, ReprocessingTaskDefinition[]>()
  for (const task of model.tasks) {
    for (const read of task.reads) {
      const list = tasksByReadTable.get(read.table) ?? []
      list.push(task)
      tasksByReadTable.set(read.table, list)
    }
  }

  const dependentTasksByTaskId = new Map<string, string[]>()
  for (const task of model.tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskById.has(dependency)) {
        throw new Error(`任务 ${task.taskId} 依赖未知任务 ${dependency}`)
      }
      const list = dependentTasksByTaskId.get(dependency) ?? []
      list.push(task.taskId)
      dependentTasksByTaskId.set(dependency, list)
    }
  }

  return { taskById, instanceById, instancesByTaskId, tasksByReadTable, dependentTasksByTaskId }
}

/** 由任务读写关系派生表级 SQL 血缘边（每个 读表 → 写表 组合一条）。 */
export function deriveLineageEdges(model: ReprocessingModel): readonly LineageEdge[] {
  const edges: LineageEdge[] = []
  const seenEdgeIds = new Set<string>()

  for (const task of model.tasks) {
    for (const read of task.reads) {
      for (const write of task.writes) {
        const edgeId = `${task.taskId}:${read.table}->${write.table}`
        if (seenEdgeIds.has(edgeId)) continue
        seenEdgeIds.add(edgeId)
        edges.push({
          edgeId,
          taskId: task.taskId,
          fromTable: read.table,
          toTable: write.table,
          transform: read.transform,
        })
      }
    }
  }

  return edges
}

function partitionAllowsPropagation(
  current: ReprocessingTaskInstance,
  target: ReprocessingTaskInstance,
  read: TaskInputRef,
): boolean {
  if (read.partitionColumn === null) {
    return true
  }
  if (read.partitionColumn === current.partition.column) {
    return target.partition.value === current.partition.value
  }
  // 分区语义不同时不猜测映射，只允许同一业务日期内传播。
  return target.businessDate === current.businessDate
}

function sameSchedulerSlot(
  current: ReprocessingTaskInstance,
  target: ReprocessingTaskInstance,
): boolean {
  if (current.businessDate !== target.businessDate) {
    return false
  }
  if (current.partition.column === target.partition.column) {
    return current.partition.value === target.partition.value
  }
  return true
}

/**
 * 计算以 `sourceInstanceId` 为起点的依赖链重做影响范围。
 *
 * - `affectedInstanceIds`：血缘闭包 + 调度依赖闭包，按实例去重；
 * - `redoInstanceIds`：已执行（success / failed / stopped）→ 必须重做；
 * - `stopRequiredInstanceIds`：运行中 / 就绪 → 先停止或阻断；
 * - `waitingInstanceIds`：未首次执行 → 等待依赖，不伪称为“已经重做”；
 * - `evidence`：每条影响边为什么被纳入（含 LEFT JOIN 与调度依赖）。
 */
export function analyzeReprocessingImpact(
  model: ReprocessingModel,
  sourceInstanceId: string,
): ImpactAnalysis {
  const index = buildIndex(model)
  const source = index.instanceById.get(sourceInstanceId)
  if (!source) {
    throw new Error(`未知的任务实例: ${sourceInstanceId}`)
  }

  const affected = new Set<string>([source.instanceId])
  const evidence: ImpactEvidence[] = []
  const queue: ReprocessingTaskInstance[] = [source]
  let cursor = 0

  const markAffected = (target: ReprocessingTaskInstance): void => {
    if (affected.has(target.instanceId)) return
    affected.add(target.instanceId)
    queue.push(target)
  }

  while (cursor < queue.length) {
    const current = queue[cursor]
    cursor += 1
    if (!current) break
    const currentTask = index.taskById.get(current.taskId)
    if (!currentTask) continue

    // 1. SQL 血缘传播：当前实例写出的表被其他任务读取。
    for (const write of currentTask.writes) {
      for (const readerTask of index.tasksByReadTable.get(write.table) ?? []) {
        const read = readerTask.reads.find((candidate) => candidate.table === write.table)
        if (!read) continue
        for (const reader of index.instancesByTaskId.get(readerTask.taskId) ?? []) {
          if (reader.instanceId === current.instanceId) continue
          if (!partitionAllowsPropagation(current, reader, read)) continue
          evidence.push({
            fromInstanceId: current.instanceId,
            toInstanceId: reader.instanceId,
            kind: 'lineage',
            detail: `读取 ${write.table}@${current.partition.value}（${read.transform}）`,
          })
          markAffected(reader)
        }
      }
    }

    // 2. 调度依赖传播：依赖当前任务的下游实例，即使没有 SQL 血缘。
    for (const dependentTaskId of index.dependentTasksByTaskId.get(current.taskId) ?? []) {
      for (const dependent of index.instancesByTaskId.get(dependentTaskId) ?? []) {
        if (dependent.instanceId === current.instanceId) continue
        if (!sameSchedulerSlot(current, dependent)) continue
        evidence.push({
          fromInstanceId: current.instanceId,
          toInstanceId: dependent.instanceId,
          kind: 'scheduler',
          detail: `${dependentTaskId} 调度依赖 ${current.taskId}`,
        })
        markAffected(dependent)
      }
    }
  }

  const affectedInstances = model.instances.filter((instance) => affected.has(instance.instanceId))
  const redoInstanceIds: string[] = []
  const waitingInstanceIds: string[] = []
  const stopRequiredInstanceIds: string[] = []
  const consumerInstanceIds: string[] = []

  for (const instance of affectedInstances) {
    const execution = classifyInstanceExecution(instance.state)
    if (execution === 'already-executed') {
      redoInstanceIds.push(instance.instanceId)
    } else if (execution === 'needs-stop') {
      stopRequiredInstanceIds.push(instance.instanceId)
    } else {
      waitingInstanceIds.push(instance.instanceId)
    }

    if (index.taskById.get(instance.taskId)?.layer === 'consumer') {
      consumerInstanceIds.push(instance.instanceId)
    }
  }

  const deduplicatedTaskIds: string[] = []
  const seenTaskIds = new Set<string>()
  for (const instance of affectedInstances) {
    if (seenTaskIds.has(instance.taskId)) continue
    seenTaskIds.add(instance.taskId)
    deduplicatedTaskIds.push(instance.taskId)
  }

  const unaffectedInstanceIds = model.instances
    .filter((instance) => !affected.has(instance.instanceId))
    .map((instance) => instance.instanceId)

  return {
    sourceInstanceId: source.instanceId,
    affectedInstanceIds: affectedInstances.map((instance) => instance.instanceId),
    redoInstanceIds,
    waitingInstanceIds,
    stopRequiredInstanceIds,
    consumerInstanceIds,
    unaffectedInstanceIds,
    deduplicatedTaskIds,
    evidence,
  }
}

export function findInstance(
  model: ReprocessingModel,
  instanceId: string,
): ReprocessingTaskInstance | undefined {
  return model.instances.find((instance) => instance.instanceId === instanceId)
}

export function listTaskInstances(
  model: ReprocessingModel,
  taskId: string,
  businessDate?: string,
): readonly ReprocessingTaskInstance[] {
  return model.instances.filter(
    (instance) =>
      instance.taskId === taskId &&
      (businessDate === undefined || instance.businessDate === businessDate),
  )
}
