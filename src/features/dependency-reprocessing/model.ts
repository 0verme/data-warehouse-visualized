/**
 * 依赖链重做专题 · 领域纯函数。
 *
 * Phase 1-A 影响分析：影响范围由两类关系取并集后去重：
 * 1. SQL 血缘：受影响任务写出的表被其他任务读取（LEFT JOIN 同样传播）；
 * 2. 调度依赖：实际 Job / Plan 中依赖受影响任务的下游任务（即使没有 SQL 血缘）。
 *
 * Phase 1-B 止损与重做：
 * - running → stopping → stopped → waiting，ready 未开始直接阻断为 waiting；
 * - 正常调度与重做调度互斥；ODS 验证通过后才放行；
 * - 重做失败与正常生产失败同语义；ODS 再次修复时受影响 SUCCESS 失效重建等待；
 * - 执行日志只按时间追加，不引入轮次 / generation。
 *
 * 分区守卫：只有同一业务日期 / 分区的实例才会被传播，跨分区不误伤；
 * 无关链路保持在 `unaffectedInstanceIds`。历史模式、版本兼容与下游闭环属于 Phase 1-C。
 */

import type {
  ImpactAnalysis,
  ImpactEvidence,
  InstanceExecutionClass,
  InvalidationResult,
  LineageEdge,
  MutualExclusionResult,
  MutualExclusionViolation,
  OdsValidationResult,
  RedoScheduleItemAction,
  RedoScheduleResult,
  ReprocessingExecutionAction,
  ReprocessingInstanceLog,
  ReprocessingModel,
  ReprocessingOdsCheck,
  ReprocessingTaskDefinition,
  ReprocessingTaskInstance,
  StopAndWaitResult,
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

/* ------------------------------------------------------------------ *
 * Phase 1-B：止损 / 等待 / 自动重做 / ODS 门禁与二次修复
 * ------------------------------------------------------------------ */

function replaceInstance(
  model: ReprocessingModel,
  updated: ReprocessingTaskInstance,
): ReprocessingModel {
  return {
    ...model,
    instances: model.instances.map((instance) =>
      instance.instanceId === updated.instanceId ? updated : instance,
    ),
  }
}

function appendLog(
  instance: ReprocessingTaskInstance,
  log: ReprocessingInstanceLog,
): ReprocessingTaskInstance {
  return { ...instance, logs: [...instance.logs, log] }
}

function requireInstance(model: ReprocessingModel, instanceId: string): ReprocessingTaskInstance {
  const instance = model.instances.find((candidate) => candidate.instanceId === instanceId)
  if (!instance) {
    throw new Error(`未知的任务实例: ${instanceId}`)
  }
  return instance
}

/** 在 `YYYY-MM-DD HH:mm:ss` 时间上增加秒数，保证日志严格递增。 */
export function shiftTimestamp(at: string, seconds: number): string {
  const parsed = new Date(`${at.replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`时间格式无效: ${at}`)
  }
  parsed.setUTCSeconds(parsed.getUTCSeconds() + seconds)
  const iso = parsed.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
}

/**
 * 施加一次显式状态转换。
 *
 * - `running → stopping → stopped → waiting`；ready 尚未开始，直接阻断为 waiting；
 * - 停止确认必须说明副作用处置；进入 waiting 后等待 ODS 验证通过；
 * - 重做执行 `waiting/blocked/skipped/failed/stopped/success → running → success | failed`；
 * - 重做失败与正常生产失败同语义，不引入专题私有状态；
 * - 非法转换显式抛错；幂等重复请求（stopping / stopped / waiting）返回原模型。
 */
export function applyReprocessingAction(
  model: ReprocessingModel,
  action: ReprocessingExecutionAction,
): ReprocessingModel {
  const instance = requireInstance(model, action.instanceId)
  const log = (
    event: ReprocessingInstanceLog['event'],
    detail: string,
  ): ReprocessingInstanceLog => ({
    loggedAt: action.at,
    event,
    detail,
    source: 'reprocessing',
  })

  switch (action.type) {
    case 'request-stop': {
      if (instance.state === 'running') {
        return replaceInstance(
          model,
          appendLog(
            { ...instance, state: 'stopping' },
            log('stop-requested', `停止请求已发出：${action.reason}`),
          ),
        )
      }
      if (instance.state === 'ready') {
        return replaceInstance(
          model,
          appendLog(
            { ...instance, state: 'waiting' },
            log('stop-requested', `${action.reason}（排队实例尚未开始执行，直接阻断为等待）`),
          ),
        )
      }
      if (
        instance.state === 'stopping' ||
        instance.state === 'waiting' ||
        instance.state === 'stopped'
      ) {
        return model
      }
      throw new Error(`request-stop 不支持的状态: ${instance.instanceId} = ${instance.state}`)
    }
    case 'confirm-stop': {
      if (instance.state === 'stopping') {
        return replaceInstance(
          model,
          appendLog(
            { ...instance, state: 'stopped' },
            log('stopped', `停止已确认；副作用处置：${action.sideEffectDisposition}`),
          ),
        )
      }
      if (instance.state === 'stopped') {
        return model
      }
      throw new Error(`confirm-stop 不支持的状态: ${instance.instanceId} = ${instance.state}`)
    }
    case 'wait': {
      if (instance.state === 'stopped') {
        return replaceInstance(
          model,
          appendLog({ ...instance, state: 'waiting' }, log('waiting', action.reason)),
        )
      }
      if (instance.state === 'waiting') {
        return model
      }
      throw new Error(`wait 不支持的状态: ${instance.instanceId} = ${instance.state}`)
    }
    case 'start-redo': {
      const startable: readonly TaskInstanceState[] = [
        'waiting',
        'blocked',
        'skipped',
        'failed',
        'stopped',
        'success',
      ]
      if (!startable.includes(instance.state)) {
        throw new Error(`start-redo 不支持的状态: ${instance.instanceId} = ${instance.state}`)
      }
      return replaceInstance(
        model,
        appendLog(
          { ...instance, state: 'running', source: 'reprocessing' },
          log('started', '重做调度开始执行'),
        ),
      )
    }
    case 'complete-redo': {
      if (instance.state !== 'running') {
        throw new Error(`complete-redo 不支持的状态: ${instance.instanceId} = ${instance.state}`)
      }
      return replaceInstance(
        model,
        appendLog(
          { ...instance, state: 'success', source: 'reprocessing' },
          log('succeeded', '重做实例执行完成'),
        ),
      )
    }
    case 'fail-redo': {
      if (instance.state !== 'running') {
        throw new Error(`fail-redo 不支持的状态: ${instance.instanceId} = ${instance.state}`)
      }
      return replaceInstance(
        model,
        appendLog(
          { ...instance, state: 'failed', source: 'reprocessing' },
          log('failed', `重做实例执行失败：${action.reason}`),
        ),
      )
    }
  }
}

export interface ApplyStopAndWaitOptions {
  sideEffectDisposition?: string
}

/**
 * 对影响范围内的正常调度实例执行“先停止 / 阻断，再等待”：
 * running / stopping → stopping → stopped → waiting；ready → waiting。
 * 返回的模型只改变受影响实例，无关链路保持原状态。
 */
export function applyAffectedStopAndWait(
  model: ReprocessingModel,
  analysis: ImpactAnalysis,
  at: string,
  options: ApplyStopAndWaitOptions = {},
): StopAndWaitResult {
  const sideEffectDisposition =
    options.sideEffectDisposition ?? '确认无未完成文件落盘、无外部推送需要撤回'
  const stoppedInstanceIds: string[] = []
  const blockedInstanceIds: string[] = []
  let next = model
  let offset = 0

  for (const instanceId of analysis.stopRequiredInstanceIds) {
    const instance = requireInstance(next, instanceId)

    if (
      instance.state === 'waiting' ||
      instance.state === 'blocked' ||
      instance.state === 'skipped'
    ) {
      continue
    }

    if (instance.state === 'stopped') {
      next = applyReprocessingAction(next, {
        type: 'wait',
        instanceId,
        at: shiftTimestamp(at, offset),
        reason: '等待 ODS 修复验证通过后由重做调度重新执行',
      })
      offset += 1
      stoppedInstanceIds.push(instanceId)
      continue
    }

    if (instance.state === 'ready') {
      next = applyReprocessingAction(next, {
        type: 'request-stop',
        instanceId,
        at: shiftTimestamp(at, offset),
        reason: '受影响的正常调度实例尚未开始执行',
      })
      offset += 1
      blockedInstanceIds.push(instanceId)
      continue
    }

    next = applyReprocessingAction(next, {
      type: 'request-stop',
      instanceId,
      at: shiftTimestamp(at, offset),
      reason: '受影响的正常调度实例正在运行，需要先停止',
    })
    next = applyReprocessingAction(next, {
      type: 'confirm-stop',
      instanceId,
      at: shiftTimestamp(at, offset + 1),
      sideEffectDisposition,
    })
    next = applyReprocessingAction(next, {
      type: 'wait',
      instanceId,
      at: shiftTimestamp(at, offset + 2),
      reason: '等待 ODS 修复验证通过后由重做调度重新执行',
    })
    offset += 3
    stoppedInstanceIds.push(instanceId)
  }

  return { model: next, stoppedInstanceIds, blockedInstanceIds }
}

/** 评估 ODS 修复验证：全部检查通过才放行依赖链重做。 */
export function evaluateOdsValidation(
  businessDate: string,
  checks: readonly ReprocessingOdsCheck[],
): OdsValidationResult {
  const failedChecks = checks.filter((check) => !check.passed)
  const validated = checks.length > 0 && failedChecks.length === 0

  return {
    businessDate,
    checks,
    validated,
    blockedReason: validated
      ? null
      : checks.length === 0
        ? '没有可用的 ODS 验证检查，不能放行依赖链重做'
        : `ODS 验证未通过：${failedChecks.map((check) => check.label).join('、')}`,
  }
}

/**
 * 检查正常调度与重做调度是否互斥：
 * - 受控实例仍处于 running / stopping / ready → 必须停止或阻断；
 * - 其他正在运行实例写入重做任务的目标表 → 写入冲突，不能同时运行。
 */
export function checkRedoMutualExclusion(
  model: ReprocessingModel,
  instanceIds: readonly string[],
): MutualExclusionResult {
  const index = buildIndex(model)
  const scheduled = new Set(instanceIds)
  const violations: MutualExclusionViolation[] = []
  const scheduledWriteTables = new Set<string>()

  for (const instanceId of instanceIds) {
    const instance = index.instanceById.get(instanceId)
    if (!instance) {
      throw new Error(`未知的任务实例: ${instanceId}`)
    }
    for (const write of index.taskById.get(instance.taskId)?.writes ?? []) {
      scheduledWriteTables.add(write.table)
    }
    if (
      instance.state === 'running' ||
      instance.state === 'stopping' ||
      instance.state === 'ready'
    ) {
      violations.push({
        instanceId,
        taskId: instance.taskId,
        state: instance.state,
        reason: '受控实例仍处于正常调度运行 / 就绪状态，必须先停止或阻断',
      })
    }
  }

  for (const instance of model.instances) {
    if (scheduled.has(instance.instanceId)) continue
    if (instance.state !== 'running' && instance.state !== 'stopping') continue
    const task = index.taskById.get(instance.taskId)
    const conflict = task?.writes.some((write) => scheduledWriteTables.has(write.table)) ?? false
    if (conflict) {
      violations.push({
        instanceId: instance.instanceId,
        taskId: instance.taskId,
        state: instance.state,
        reason: '与重做任务的写入目标冲突，正常调度与重做调度不能同时运行',
      })
    }
  }

  return { ok: violations.length === 0, violations }
}

function classifyRedoScheduleAction(instance: ReprocessingTaskInstance): RedoScheduleItemAction {
  if (instance.state === 'stopped') return 'redo-after-stop'
  if (instance.state === 'success' || instance.state === 'failed') return 'redo-executed'
  if (
    instance.state === 'waiting' ||
    instance.state === 'blocked' ||
    instance.state === 'skipped'
  ) {
    return 'run-waiting'
  }
  throw new Error(`实例 ${instance.instanceId} 不能进入重做计划，当前状态: ${instance.state}`)
}

/** 按依赖顺序排列受影响实例：上游先于下游；同任务按实例声明顺序。 */
function orderAffectedInstances(
  model: ReprocessingModel,
  analysis: ImpactAnalysis,
): readonly ReprocessingTaskInstance[] {
  const affectedTaskIds = analysis.deduplicatedTaskIds
  const affectedTaskSet = new Set(affectedTaskIds)
  const taskById = new Map(model.tasks.map((task) => [task.taskId, task]))
  const taskOrder = new Map(model.tasks.map((task, index) => [task.taskId, index]))

  const edges = new Map<string, Set<string>>()
  const indegree = new Map<string, number>()
  for (const taskId of affectedTaskIds) {
    edges.set(taskId, new Set())
    indegree.set(taskId, 0)
  }

  const addEdge = (fromTaskId: string, toTaskId: string): void => {
    if (fromTaskId === toTaskId) return
    if (!affectedTaskSet.has(fromTaskId) || !affectedTaskSet.has(toTaskId)) return
    const out = edges.get(fromTaskId)
    if (!out || out.has(toTaskId)) return
    out.add(toTaskId)
    indegree.set(toTaskId, (indegree.get(toTaskId) ?? 0) + 1)
  }

  const writersByTable = new Map<string, string[]>()
  for (const taskId of affectedTaskIds) {
    for (const write of taskById.get(taskId)?.writes ?? []) {
      const writers = writersByTable.get(write.table) ?? []
      writers.push(taskId)
      writersByTable.set(write.table, writers)
    }
  }

  for (const taskId of affectedTaskIds) {
    const task = taskById.get(taskId)
    if (!task) continue
    for (const dependency of task.dependsOn) {
      addEdge(dependency, taskId)
    }
    for (const read of task.reads) {
      for (const writer of writersByTable.get(read.table) ?? []) {
        addEdge(writer, taskId)
      }
    }
  }

  const byTaskOrder = (left: string, right: string): number =>
    (taskOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (taskOrder.get(right) ?? Number.MAX_SAFE_INTEGER)

  const ready = affectedTaskIds
    .filter((taskId) => (indegree.get(taskId) ?? 0) === 0)
    .sort(byTaskOrder)
  const orderedTaskIds: string[] = []

  while (ready.length > 0) {
    const taskId = ready.shift()
    if (!taskId) break
    orderedTaskIds.push(taskId)
    for (const nextTaskId of edges.get(taskId) ?? []) {
      const remaining = (indegree.get(nextTaskId) ?? 0) - 1
      indegree.set(nextTaskId, remaining)
      if (remaining === 0) {
        ready.push(nextTaskId)
        ready.sort(byTaskOrder)
      }
    }
  }

  if (orderedTaskIds.length !== affectedTaskIds.length) {
    throw new Error('受影响任务的依赖关系存在环，无法生成安全的重做顺序')
  }

  const orderByTaskId = new Map(orderedTaskIds.map((taskId, index) => [taskId, index]))
  const affectedInstanceIds = new Set(analysis.affectedInstanceIds)
  const affectedInstances = model.instances.filter((instance) =>
    affectedInstanceIds.has(instance.instanceId),
  )

  return [...affectedInstances].sort(
    (left, right) =>
      (orderByTaskId.get(left.taskId) ?? 0) - (orderByTaskId.get(right.taskId) ?? 0) ||
      model.instances.indexOf(left) - model.instances.indexOf(right),
  )
}

export interface CreateRedoScheduleOptions {
  validation: OdsValidationResult
  /** 模拟器内部标识，可选；默认由业务日期与源实例推导。 */
  simulatorPlanId?: string
}

/**
 * 生成重做计划：
 * 1. ODS 验证未通过 → blocked；
 * 2. 正常调度与重做调度存在互斥冲突 → blocked；
 * 3. 通过后按依赖顺序输出实例清单，供自动依赖调用执行。
 */
export function createRedoSchedule(
  model: ReprocessingModel,
  analysis: ImpactAnalysis,
  options: CreateRedoScheduleOptions,
): RedoScheduleResult {
  if (!options.validation.validated) {
    return {
      status: 'blocked',
      reason: options.validation.blockedReason ?? 'ODS 验证未通过，不能放行依赖链重做',
      schedule: null,
      violations: [],
    }
  }

  const mutualExclusion = checkRedoMutualExclusion(model, analysis.affectedInstanceIds)
  if (!mutualExclusion.ok) {
    return {
      status: 'blocked',
      reason: '正常调度与重做调度存在互斥冲突，必须先停止或阻断受控实例',
      schedule: null,
      violations: mutualExclusion.violations,
    }
  }

  const source = model.instances.find(
    (instance) => instance.instanceId === analysis.sourceInstanceId,
  )
  if (!source) {
    throw new Error(`未知的任务实例: ${analysis.sourceInstanceId}`)
  }

  const items = orderAffectedInstances(model, analysis).map((instance) => ({
    instanceId: instance.instanceId,
    taskId: instance.taskId,
    action: classifyRedoScheduleAction(instance),
  }))

  return {
    status: 'ready',
    reason: null,
    schedule: {
      simulatorPlanId:
        options.simulatorPlanId ?? `SIM-PLAN:${source.businessDate}:${analysis.sourceInstanceId}`,
      businessDate: source.businessDate,
      sourceInstanceId: analysis.sourceInstanceId,
      items,
    },
    violations: [],
  }
}

/**
 * ODS 再次修复后，将影响范围内仍为 SUCCESS 的实例置回 WAITING；
 * 只追加日志、保留历史执行记录，不引入轮次。
 */
export function invalidateAffectedSuccess(
  model: ReprocessingModel,
  analysis: ImpactAnalysis,
  at: string,
  reason: string,
): InvalidationResult {
  const invalidatedInstanceIds: string[] = []
  let next = model

  for (const instanceId of analysis.affectedInstanceIds) {
    const instance = requireInstance(next, instanceId)
    if (instance.state !== 'success') continue
    next = replaceInstance(
      next,
      appendLog(
        { ...instance, state: 'waiting' },
        {
          loggedAt: at,
          event: 'waiting',
          detail: reason,
          source: 'reprocessing',
        },
      ),
    )
    invalidatedInstanceIds.push(instanceId)
  }

  return { model: next, invalidatedInstanceIds }
}
