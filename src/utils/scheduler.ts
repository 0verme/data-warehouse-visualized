import type {
  SchedulerAction,
  SchedulerAttemptRecord,
  SchedulerDependencyState,
  SchedulerEvent,
  SchedulerEventType,
  SchedulerOutputComparison,
  SchedulerOutputState,
  SchedulerRerunComparison,
  SchedulerRerunMode,
  SchedulerRerunPlan,
  SchedulerRunOptions,
  SchedulerRunState,
  SchedulerRunStatus,
  SchedulerScenario,
  SchedulerSlaState,
  SchedulerTaskDefinition,
  SchedulerTaskRunRecord,
} from '../features/scheduler/types'
import type { TransformationTaskContract } from '../features/sql-transformation/types'

export const SCHEDULER_TASK_IDS = {
  accountBalanceSnapshot: 'ingest.account-balance.daily.v1',
  account: 'ingest.account.snapshot.v1',
  customer: 'ingest.customer.snapshot.v1',
  product: 'ingest.product.snapshot.v1',
  branch: 'ingest.branch.snapshot.v1',
  dwd: 'transform.deposit-balance.detail.v1',
  dws: 'transform.deposit-balance.topic.v1',
  ads: 'transform.deposit-balance.daily.v1',
  /** 旧调度测试和外部示例使用的别名，值仍指向银行存款任务，不再代表电商表。 */
  odsOrders: 'ingest.account-balance.daily.v1',
  odsOrderItems: 'ingest.account.snapshot.v1',
  odsUsers: 'ingest.customer.snapshot.v1',
  odsPayments: 'ingest.product.snapshot.v1',
  odsRefunds: 'ingest.branch.snapshot.v1',
} as const

/** 原电商调度调用使用过的 task ID；新任务 identity 仍以 SCHEDULER_TASK_IDS 为准。 */
export const LEGACY_SCHEDULER_TASK_IDS = {
  odsOrders: 'ingest.orders.daily.v1',
  odsOrderItems: 'ingest.order-items.daily.v1',
  odsUsers: 'ingest.users.snapshot.v1',
  odsPayments: 'ingest.payments.daily.v1',
  odsRefunds: 'ingest.refunds.daily.v1',
  dwd: 'transform.order-item.daily.v1',
  dws: 'transform.sales.topic.daily.v1',
  ads: 'transform.sales.daily.v1',
} as const

export const LEGACY_TASK_ID_ALIASES: Readonly<Record<string, string>> = {
  [LEGACY_SCHEDULER_TASK_IDS.odsOrders]: SCHEDULER_TASK_IDS.accountBalanceSnapshot,
  [LEGACY_SCHEDULER_TASK_IDS.odsOrderItems]: SCHEDULER_TASK_IDS.account,
  [LEGACY_SCHEDULER_TASK_IDS.odsUsers]: SCHEDULER_TASK_IDS.customer,
  [LEGACY_SCHEDULER_TASK_IDS.odsPayments]: SCHEDULER_TASK_IDS.product,
  [LEGACY_SCHEDULER_TASK_IDS.odsRefunds]: SCHEDULER_TASK_IDS.branch,
  [LEGACY_SCHEDULER_TASK_IDS.dwd]: SCHEDULER_TASK_IDS.dwd,
  [LEGACY_SCHEDULER_TASK_IDS.dws]: SCHEDULER_TASK_IDS.dws,
  [LEGACY_SCHEDULER_TASK_IDS.ads]: SCHEDULER_TASK_IDS.ads,
}

export function getCanonicalSchedulerTaskId(taskId: string): string {
  return LEGACY_TASK_ID_ALIASES[taskId] ?? taskId
}

export const SCHEDULER_DEFAULT_SCHEDULED_AT = '2026-10-01 06:00'
export const SCHEDULER_LATE_DATA_ARRIVAL_AT = '2026-10-01 06:20'
export const SCHEDULER_DEFAULT_MAX_CONCURRENT_TASKS = 2

function isLateDataScenario(scenario: SchedulerScenario): boolean {
  return (
    scenario === 'upstream-late' || scenario === 'upstream-signal' || scenario === 'ftp-detection'
  )
}

function getTaskOrThrow(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): SchedulerTaskDefinition {
  const canonicalTaskId = getCanonicalSchedulerTaskId(taskId)
  const task = tasks.find((candidate) => candidate.taskId === canonicalTaskId)
  if (!task) {
    throw new Error(`未知的调度任务: ${taskId}`)
  }

  return task
}

export function getSchedulerTask(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): SchedulerTaskDefinition | undefined {
  const canonicalTaskId = getCanonicalSchedulerTaskId(taskId)
  return tasks.find((task) => task.taskId === canonicalTaskId)
}

/** 使用 Kahn 算法返回稳定拓扑序；同层任务按定义顺序保持确定性。 */
export function getTopologicalTaskIds(tasks: readonly SchedulerTaskDefinition[]): string[] {
  const taskIds = new Set<string>()
  const taskOrder = new Map<string, number>()
  const indegree = new Map<string, number>()
  const downstream = new Map<string, string[]>()

  tasks.forEach((task, index) => {
    if (taskIds.has(task.taskId)) {
      throw new Error(`DAG 存在重复 taskId: ${task.taskId}`)
    }

    taskIds.add(task.taskId)
    taskOrder.set(task.taskId, index)
    indegree.set(task.taskId, task.dependsOn.length)
    downstream.set(task.taskId, [])
  })

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      if (!taskIds.has(dependencyId)) {
        throw new Error(`${task.taskId} 依赖了不存在的任务: ${dependencyId}`)
      }
      downstream.get(dependencyId)!.push(task.taskId)
    }
  }

  const ready = tasks.filter((task) => indegree.get(task.taskId) === 0).map((task) => task.taskId)
  const result: string[] = []

  while (ready.length > 0) {
    ready.sort((left, right) => taskOrder.get(left)! - taskOrder.get(right)!)
    const current = ready.shift()!
    result.push(current)

    for (const childId of downstream.get(current) ?? []) {
      const nextIndegree = indegree.get(childId)! - 1
      indegree.set(childId, nextIndegree)
      if (nextIndegree === 0) {
        ready.push(childId)
      }
    }
  }

  if (result.length !== tasks.length) {
    throw new Error('DAG 存在循环依赖，无法生成拓扑顺序')
  }

  return result
}

export function getDownstreamTaskIds(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): string[] {
  const canonicalTaskId = getCanonicalSchedulerTaskId(taskId)
  getTaskOrThrow(tasks, canonicalTaskId)
  const selected = new Set<string>([canonicalTaskId])
  let changed = true

  while (changed) {
    changed = false
    for (const task of tasks) {
      if (
        task.dependsOn.some((dependencyId) => selected.has(dependencyId)) &&
        !selected.has(task.taskId)
      ) {
        selected.add(task.taskId)
        changed = true
      }
    }
  }

  return getTopologicalTaskIds(tasks).filter((candidate) => selected.has(candidate))
}

export function getDependencyState(
  task: SchedulerTaskDefinition,
  taskRuns: Readonly<Record<string, SchedulerTaskRunRecord>>,
): SchedulerDependencyState {
  const dependencies = task.dependsOn.map((dependencyId) => taskRuns[dependencyId])

  if (
    dependencies.some(
      (dependency) =>
        !dependency || dependency.status === 'failed' || dependency.status === 'skipped',
    )
  ) {
    return 'blocked'
  }

  return dependencies.every((dependency) => dependency.status === 'success') ? 'ready' : 'waiting'
}

function parseSchedulerTimestamp(timestamp: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/u.exec(timestamp)
  if (!match) {
    throw new Error(`无法解析调度时间: ${timestamp}`)
  }

  const [, year, month, day, hour, minute] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
}

function formatSchedulerTimestamp(value: number): string {
  const date = new Date(value)
  const parts = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ]

  return `${String(parts[0]).padStart(4, '0')}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')} ${String(parts[3]).padStart(2, '0')}:${String(parts[4]).padStart(2, '0')}`
}

export function addSchedulerMinutes(timestamp: string, minutes: number): string {
  return formatSchedulerTimestamp(parseSchedulerTimestamp(timestamp) + minutes * 60_000)
}

export function getSchedulerMinutesBetween(start: string, end: string): number {
  return Math.max(
    0,
    Math.round((parseSchedulerTimestamp(end) - parseSchedulerTimestamp(start)) / 60_000),
  )
}

export interface SlaEvaluationInput {
  scheduledAt: string
  currentTime: string
  slaMinutes: number
  status: SchedulerTaskRunRecord['status']
  startedAt?: string | null
  endedAt?: string | null
}

export function getSlaState({
  scheduledAt,
  currentTime,
  slaMinutes,
  status,
  startedAt,
  endedAt,
}: SlaEvaluationInput): SchedulerSlaState {
  if (status === 'skipped') {
    return 'not-started'
  }

  const completionTime = status === 'success' || status === 'failed' ? endedAt : null
  const referenceTime = completionTime ?? currentTime
  const elapsed = getSchedulerMinutesBetween(scheduledAt, referenceTime)

  if (completionTime) {
    return elapsed > slaMinutes ? 'breached' : 'on-time'
  }

  if (elapsed >= slaMinutes) {
    return 'breached'
  }

  if (startedAt && elapsed >= slaMinutes * 0.75) {
    return 'at-risk'
  }

  return startedAt ? 'on-time' : 'not-started'
}

function createTaskRun(
  task: SchedulerTaskDefinition,
  runId: string,
  businessDate: string,
  partition: { column: string; value: string },
  scheduledAt: string,
  isLateDataAvailable: boolean,
  scenario: SchedulerScenario,
  lateDataTaskId: string,
): SchedulerTaskRunRecord {
  const isLateSource =
    isLateDataScenario(scenario) && task.taskId === lateDataTaskId && !isLateDataAvailable
  const dependencyState = isLateSource
    ? 'waiting'
    : task.dependsOn.length === 0
      ? 'ready'
      : 'waiting'

  return {
    taskId: task.taskId,
    runId,
    businessDate,
    partition,
    status: 'queued',
    dependencyState,
    dependencyTaskIds: task.dependsOn,
    attempt: 0,
    attempts: [],
    queuedAt: scheduledAt,
    startedAt: null,
    endedAt: null,
    runtimeMinutes: null,
    delayMinutes: 0,
    slaState: 'not-started',
    outputState: 'not-produced',
    isReused: false,
  }
}

function createReusedTaskRun(
  taskRun: SchedulerTaskRunRecord,
  scheduledAt: string,
): SchedulerTaskRunRecord {
  const attempt: SchedulerAttemptRecord = {
    attempt: 1,
    status: 'success',
    queuedAt: scheduledAt,
    startedAt: scheduledAt,
    endedAt: scheduledAt,
    runtimeMinutes: 0,
  }

  return {
    ...taskRun,
    status: 'success',
    dependencyState: 'satisfied',
    attempt: 1,
    attempts: [attempt],
    startedAt: scheduledAt,
    endedAt: scheduledAt,
    runtimeMinutes: 0,
    delayMinutes: 0,
    slaState: 'on-time',
    outputState: 'available',
    isReused: true,
  }
}

function createEvent(
  state: SchedulerRunState,
  type: SchedulerEventType,
  timestamp: string,
  message: string,
  taskRun?: SchedulerTaskRunRecord,
): SchedulerEvent {
  return {
    eventId: `${state.runId}-event-${String(state.events.length + 1).padStart(3, '0')}`,
    type,
    timestamp,
    runId: state.runId,
    taskId: taskRun?.taskId,
    businessDate: state.businessDate,
    partition: state.partition,
    attempt: taskRun && taskRun.attempt > 0 ? taskRun.attempt : undefined,
    status: taskRun?.status,
    dependencyState: taskRun?.dependencyState,
    slaState: taskRun?.slaState,
    outputState: taskRun?.outputState,
    message,
  }
}

function appendEvent(
  state: SchedulerRunState,
  type: SchedulerEventType,
  timestamp: string,
  message: string,
  taskRun?: SchedulerTaskRunRecord,
): SchedulerRunState {
  return {
    ...state,
    events: [...state.events, createEvent(state, type, timestamp, message, taskRun)],
  }
}

function getTaskSlaState(
  task: SchedulerTaskDefinition,
  state: SchedulerRunState,
  taskRun: SchedulerTaskRunRecord,
): SchedulerSlaState {
  return getSlaState({
    scheduledAt: state.scheduledAt,
    currentTime: state.clock,
    slaMinutes: task.slaMinutes,
    status: taskRun.status,
    startedAt: taskRun.startedAt,
    endedAt: taskRun.endedAt,
  })
}

function getTaskDelay(state: SchedulerRunState, taskRun: SchedulerTaskRunRecord): number {
  return getSchedulerMinutesBetween(state.scheduledAt, taskRun.startedAt ?? state.clock)
}

function syncTaskRuns(state: SchedulerRunState, skipBlocked = true): SchedulerRunState {
  let nextState = state
  const taskIds = getTopologicalTaskIds(state.tasks)
  const nextTaskRuns: Record<string, SchedulerTaskRunRecord> = { ...state.taskRuns }

  for (const taskId of taskIds) {
    const task = getTaskOrThrow(state.tasks, taskId)
    const current = nextTaskRuns[taskId]
    if (!current) {
      continue
    }

    const dependencyState = getDependencyState(task, nextTaskRuns)
    const isLateSource =
      isLateDataScenario(state.scenario) &&
      taskId === state.lateDataTaskId &&
      !state.isLateDataAvailable

    if (
      skipBlocked &&
      (current.status === 'queued' || current.status === 'retry') &&
      dependencyState === 'blocked'
    ) {
      const skipped: SchedulerTaskRunRecord = {
        ...current,
        status: 'skipped',
        dependencyState: 'blocked',
        outputState: 'not-produced',
        slaState: 'not-started',
        delayMinutes: getTaskDelay(nextState, current),
        failureReason: undefined,
      }
      nextTaskRuns[taskId] = skipped
      nextState = appendEvent(
        { ...nextState, taskRuns: nextTaskRuns },
        'skip',
        nextState.clock,
        `${task.label} 因上游失败或跳过，被阻断为 skipped。`,
        skipped,
      )
      continue
    }

    const visibleDependencyState =
      isLateSource && (current.status === 'queued' || current.status === 'retry')
        ? 'waiting'
        : current.status === 'success'
          ? 'satisfied'
          : current.status === 'skipped'
            ? 'blocked'
            : dependencyState

    nextTaskRuns[taskId] = {
      ...current,
      dependencyState: visibleDependencyState,
      delayMinutes: getTaskDelay(nextState, current),
      slaState:
        current.status === 'skipped'
          ? 'not-started'
          : getTaskSlaState(task, nextState, {
              ...current,
              dependencyState: visibleDependencyState,
            }),
    }
  }

  return updateRunStatus({ ...nextState, taskRuns: nextTaskRuns })
}

function updateRunStatus(state: SchedulerRunState): SchedulerRunState {
  const taskRuns = Object.values(state.taskRuns)
  const hasRunning = taskRuns.some(
    (taskRun) => taskRun.status === 'running' || taskRun.status === 'retry',
  )
  const hasQueued = taskRuns.some((taskRun) => taskRun.status === 'queued')
  const hasFailure = taskRuns.some(
    (taskRun) => taskRun.status === 'failed' || taskRun.status === 'skipped',
  )
  const allSuccess =
    taskRuns.length > 0 && taskRuns.every((taskRun) => taskRun.status === 'success')
  let status: SchedulerRunStatus

  if (allSuccess) {
    status = 'success'
  } else if (hasFailure && !hasRunning && !hasQueued) {
    status = 'failed'
  } else if (hasRunning) {
    status = 'running'
  } else {
    status = 'queued'
  }

  return { ...state, status }
}

function createRunId(businessDate: string, trigger: SchedulerRunOptions['trigger']): string {
  const normalizedDate = businessDate.replace(/-/gu, '')
  const suffix =
    trigger === 'partition-rerun' ? 'partition' : trigger === 'full-rerun' ? 'full' : 'schedule'
  return `run.deposit-balance.daily.${normalizedDate}.${suffix}.001`
}

export function createInitialSchedulerRun(
  tasks: readonly SchedulerTaskDefinition[],
  options: SchedulerRunOptions,
): SchedulerRunState {
  if (tasks.length === 0) {
    throw new Error('至少需要一个调度任务才能创建 DAG Run')
  }

  const topologicalTaskIds = getTopologicalTaskIds(tasks)
  const trigger = options.trigger ?? 'schedule'
  const scheduledAt = options.scheduledAt ?? SCHEDULER_DEFAULT_SCHEDULED_AT
  const partition = {
    column: getTaskOrThrow(tasks, topologicalTaskIds[topologicalTaskIds.length - 1]!).contract
      .partition.column,
    value: options.businessDate,
  }
  const runId = options.runId ?? createRunId(options.businessDate, trigger)
  const scenario = options.scenario ?? 'happy-path'
  const defaultLateDataTaskId =
    tasks.find((task) =>
      task.contract.inputTables.some((table) => table === 'AccountBalanceSnapshot'),
    )?.taskId ?? SCHEDULER_TASK_IDS.odsPayments
  const defaultFailureTaskId =
    tasks.find((task) => task.layer === 'dwd')?.taskId ?? SCHEDULER_TASK_IDS.dwd
  const lateDataTaskId = options.lateDataTaskId ?? defaultLateDataTaskId
  const failureTaskId = options.failureTaskId ?? defaultFailureTaskId
  const lateDataAvailableAt = isLateDataScenario(scenario)
    ? (options.lateDataAvailableAt ?? SCHEDULER_LATE_DATA_ARRIVAL_AT)
    : null
  const lateDataDetectedAt = isLateDataScenario(scenario)
    ? (options.lateDataDetectedAt ?? lateDataAvailableAt)
    : null
  const initialTaskRuns = Object.fromEntries(
    tasks.map((task) => [
      task.taskId,
      createTaskRun(
        task,
        runId,
        options.businessDate,
        partition,
        scheduledAt,
        false,
        scenario,
        lateDataTaskId,
      ),
    ]),
  ) as Record<string, SchedulerTaskRunRecord>

  let state: SchedulerRunState = {
    runId,
    businessDate: options.businessDate,
    partition,
    trigger,
    scenario,
    status: 'queued',
    clock: scheduledAt,
    scheduledAt,
    maxConcurrentTasks: Math.max(
      1,
      options.maxConcurrentTasks ?? SCHEDULER_DEFAULT_MAX_CONCURRENT_TASKS,
    ),
    lateDataAvailableAt,
    lateDataDetectedAt,
    lateDataTaskId: isLateDataScenario(scenario) ? lateDataTaskId : null,
    failureTaskId,
    isLateDataAvailable: !isLateDataScenario(scenario),
    recoveredTaskIds: [],
    tasks,
    taskRuns: initialTaskRuns,
    events: [],
  }

  if (options.rerunPlan) {
    const inScope = new Set(options.rerunPlan.taskIds)
    const rerunTaskRuns = Object.fromEntries(
      tasks.map((task) => {
        const taskRun = initialTaskRuns[task.taskId]!
        return [
          task.taskId,
          inScope.has(task.taskId) ? taskRun : createReusedTaskRun(taskRun, scheduledAt),
        ]
      }),
    ) as Record<string, SchedulerTaskRunRecord>
    state = { ...state, taskRuns: rerunTaskRuns }
    state = appendEvent(
      state,
      'rerun',
      scheduledAt,
      `${options.rerunPlan.mode === 'partial' ? '局部补数' : '全链路重跑'} ${options.businessDate} 分区：${options.rerunPlan.reason}`,
    )
  } else {
    state = appendEvent(
      state,
      'schedule',
      scheduledAt,
      `schedule 触发 DAG Run，分区 ${partition.column} = ${partition.value}。`,
    )
  }

  state = syncTaskRuns(state)
  for (const task of tasks) {
    const taskRun = state.taskRuns[task.taskId]
    if (!taskRun || taskRun.status !== 'queued') {
      continue
    }

    state = appendEvent(
      state,
      'queue',
      scheduledAt,
      `${task.label} queued；${
        taskRun.dependencyState === 'ready'
          ? '依赖已满足，等待并发 slot。'
          : '等待上游依赖或输入就绪。'
      }`,
      taskRun,
    )
  }

  return state
}

export const createSchedulerRun = createInitialSchedulerRun

export function getReadyTaskIds(state: SchedulerRunState): string[] {
  return getTopologicalTaskIds(state.tasks).filter((taskId) => {
    const task = getTaskOrThrow(state.tasks, taskId)
    const taskRun = state.taskRuns[taskId]
    if (!taskRun || (taskRun.status !== 'queued' && taskRun.status !== 'retry')) {
      return false
    }

    if (
      isLateDataScenario(state.scenario) &&
      task.taskId === state.lateDataTaskId &&
      !state.isLateDataAvailable
    ) {
      return false
    }

    return getDependencyState(task, state.taskRuns) === 'ready'
  })
}

function getRunningTaskIds(state: SchedulerRunState): string[] {
  return getTopologicalTaskIds(state.tasks).filter(
    (taskId) => state.taskRuns[taskId]?.status === 'running',
  )
}

function startTask(state: SchedulerRunState, taskId: string): SchedulerRunState {
  const task = getTaskOrThrow(state.tasks, taskId)
  const current = state.taskRuns[taskId]
  if (
    !current ||
    (current.status !== 'queued' && current.status !== 'retry') ||
    getDependencyState(task, state.taskRuns) !== 'ready' ||
    (isLateDataScenario(state.scenario) &&
      taskId === state.lateDataTaskId &&
      !state.isLateDataAvailable) ||
    getRunningTaskIds(state).length >= state.maxConcurrentTasks
  ) {
    return state
  }

  const attemptNumber = current.attempt + 1
  const attempt: SchedulerAttemptRecord = {
    attempt: attemptNumber,
    status: 'running',
    queuedAt: current.status === 'retry' ? state.clock : current.queuedAt,
    startedAt: state.clock,
    endedAt: null,
    runtimeMinutes: null,
  }
  const nextTaskRun: SchedulerTaskRunRecord = {
    ...current,
    status: 'running',
    dependencyState: 'ready',
    attempt: attemptNumber,
    attempts: [...current.attempts, attempt],
    startedAt: state.clock,
    endedAt: null,
    runtimeMinutes: null,
    delayMinutes: getSchedulerMinutesBetween(state.scheduledAt, state.clock),
    slaState: getSlaState({
      scheduledAt: state.scheduledAt,
      currentTime: state.clock,
      slaMinutes: task.slaMinutes,
      status: 'running',
      startedAt: state.clock,
      endedAt: null,
    }),
    outputState: 'not-produced',
    failureReason: undefined,
    isReused: false,
  }
  const nextState = updateRunStatus({
    ...state,
    status: 'running',
    taskRuns: { ...state.taskRuns, [taskId]: nextTaskRun },
  })

  return appendEvent(
    nextState,
    'start',
    state.clock,
    `${task.label} 开始运行，attempt ${attemptNumber}。`,
    nextTaskRun,
  )
}

function completeTask(state: SchedulerRunState, taskId: string): SchedulerRunState {
  const task = getTaskOrThrow(state.tasks, taskId)
  const current = state.taskRuns[taskId]
  if (!current || current.status !== 'running') {
    return state
  }

  const runtimeMinutes = current.startedAt
    ? getSchedulerMinutesBetween(current.startedAt, state.clock)
    : 0
  const attempts = current.attempts.map((attempt) =>
    attempt.attempt === current.attempt
      ? {
          ...attempt,
          status: 'success' as const,
          endedAt: state.clock,
          runtimeMinutes,
        }
      : attempt,
  )
  const completed: SchedulerTaskRunRecord = {
    ...current,
    status: 'success',
    dependencyState: 'satisfied',
    attempts,
    endedAt: state.clock,
    runtimeMinutes,
    delayMinutes: getSchedulerMinutesBetween(state.scheduledAt, current.startedAt ?? state.clock),
    slaState: getTaskSlaState(task, state, {
      ...current,
      status: 'success',
      endedAt: state.clock,
      attempts,
    }),
    outputState: 'available',
    failureReason: undefined,
  }
  const nextState = syncTaskRuns({
    ...state,
    taskRuns: { ...state.taskRuns, [taskId]: completed },
  })

  return appendEvent(
    nextState,
    'success',
    state.clock,
    `${task.label} success，输出 ${task.contract.outputTable} 可用。`,
    completed,
  )
}

function shouldRetryTask(
  state: SchedulerRunState,
  task: SchedulerTaskDefinition,
  attempt: number,
): boolean {
  if (state.recoveredTaskIds.includes(task.taskId) || task.taskId !== state.failureTaskId) {
    return false
  }

  if (state.scenario === 'dwd-retry') {
    return attempt === 1
  }

  return state.scenario === 'dwd-blocked' && attempt < task.maxAttempts
}

function getFailureReason(state: SchedulerRunState, task: SchedulerTaskDefinition): string {
  if (task.taskId === state.failureTaskId && state.scenario === 'dwd-retry') {
    return '确定性故障：DWD 第一次执行失败，下一次 attempt 可恢复。'
  }

  if (task.taskId === state.failureTaskId && state.scenario === 'dwd-blocked') {
    return '确定性故障：DWD 重试耗尽，依赖它的 DWS / ADS 不能误报成功。'
  }

  return '任务执行失败，需要检查后再恢复。'
}

function failTask(state: SchedulerRunState, taskId: string, reason?: string): SchedulerRunState {
  const task = getTaskOrThrow(state.tasks, taskId)
  const current = state.taskRuns[taskId]
  if (!current || current.status !== 'running') {
    return state
  }

  const runtimeMinutes = current.startedAt
    ? getSchedulerMinutesBetween(current.startedAt, state.clock)
    : 0
  const attempts = current.attempts.map((attempt) =>
    attempt.attempt === current.attempt
      ? {
          ...attempt,
          status: 'failed' as const,
          endedAt: state.clock,
          runtimeMinutes,
          failureReason: reason ?? getFailureReason(state, task),
        }
      : attempt,
  )
  const failed: SchedulerTaskRunRecord = {
    ...current,
    status: shouldRetryTask(state, task, current.attempt) ? 'retry' : 'failed',
    dependencyState: getDependencyState(task, state.taskRuns),
    attempts,
    endedAt: state.clock,
    runtimeMinutes,
    delayMinutes: getSchedulerMinutesBetween(state.scheduledAt, current.startedAt ?? state.clock),
    slaState: getTaskSlaState(task, state, {
      ...current,
      status: 'failed',
      endedAt: state.clock,
      attempts,
    }),
    outputState: 'not-produced',
    failureReason: reason ?? getFailureReason(state, task),
  }
  let nextState = updateRunStatus({
    ...state,
    taskRuns: { ...state.taskRuns, [taskId]: failed },
  })
  nextState = appendEvent(
    nextState,
    'failure',
    state.clock,
    `${task.label} failed：${failed.failureReason}`,
    failed,
  )

  if (failed.status === 'retry') {
    nextState = appendEvent(
      nextState,
      'retry',
      state.clock,
      `${task.label} 进入 retry，等待下一次 attempt；下游仍保持等待。`,
      failed,
    )
  }

  return syncTaskRuns(nextState)
}

function markLateData(state: SchedulerRunState): SchedulerRunState {
  if (
    !isLateDataScenario(state.scenario) ||
    state.isLateDataAvailable ||
    !state.lateDataAvailableAt
  ) {
    return state
  }

  const detectionTime = state.lateDataDetectedAt ?? state.lateDataAvailableAt
  const clock = state.clock < detectionTime ? detectionTime : state.clock
  let nextState = syncTaskRuns({
    ...state,
    clock,
    isLateDataAvailable: true,
  })
  const lateTask = state.lateDataTaskId ? nextState.taskRuns[state.lateDataTaskId] : undefined
  const readinessMessage =
    state.scenario === 'upstream-signal'
      ? `上游运行在 ${clock} 从 PROCESSING 变为 SUCCESS；${state.lateDataTaskId} 现在满足下游运行条件。`
      : `当前业务日期所需输入在 ${state.lateDataAvailableAt} 到达，系统于 ${clock} 检测到它；${state.lateDataTaskId} 现在可以入队，DWD 之前一直在等待。`
  nextState = appendEvent(nextState, 'upstream-late', clock, readinessMessage, lateTask)
  return syncTaskRuns(nextState)
}

function recoverTask(state: SchedulerRunState, taskId: string): SchedulerRunState {
  const task = getTaskOrThrow(state.tasks, taskId)
  const current = state.taskRuns[taskId]
  if (!current || current.status !== 'failed') {
    return state
  }

  const downstreamIds = getDownstreamTaskIds(state.tasks, taskId).filter(
    (candidate) => candidate !== taskId,
  )
  const recoveredTask: SchedulerTaskRunRecord = {
    ...current,
    status: 'retry',
    dependencyState: getDependencyState(task, state.taskRuns),
    endedAt: null,
    runtimeMinutes: null,
    slaState: getTaskSlaState(task, state, { ...current, status: 'retry', endedAt: null }),
    outputState: 'not-produced',
    failureReason: undefined,
  }
  const taskRuns: Record<string, SchedulerTaskRunRecord> = {
    ...state.taskRuns,
    [taskId]: recoveredTask,
  }

  for (const downstreamId of downstreamIds) {
    const downstream = taskRuns[downstreamId]
    if (!downstream || downstream.status !== 'skipped') {
      continue
    }

    taskRuns[downstreamId] = {
      ...downstream,
      status: 'queued',
      dependencyState: 'waiting',
      endedAt: null,
      runtimeMinutes: null,
      delayMinutes: getTaskDelay(state, downstream),
      slaState: getTaskSlaState(getTaskOrThrow(state.tasks, downstreamId), state, {
        ...downstream,
        status: 'queued',
        endedAt: null,
      }),
      outputState: 'not-produced',
      failureReason: undefined,
      isReused: false,
    }
  }

  let nextState: SchedulerRunState = {
    ...state,
    recoveredTaskIds: [...new Set([...state.recoveredTaskIds, taskId])],
    taskRuns,
  }
  nextState = syncTaskRuns(nextState)
  return appendEvent(
    nextState,
    'recovery',
    state.clock,
    `${task.label} 接受人工 recovery，准备新的 attempt。`,
    recoveredTask,
  )
}

function startReadyTasks(state: SchedulerRunState): SchedulerRunState {
  let nextState = state
  const availableSlots = () => nextState.maxConcurrentTasks - getRunningTaskIds(nextState).length

  for (const taskId of getReadyTaskIds(nextState)) {
    if (availableSlots() <= 0) {
      break
    }
    nextState = startTask(nextState, taskId)
  }

  return updateRunStatus(nextState)
}

function getNextRunningTask(state: SchedulerRunState): SchedulerTaskDefinition | undefined {
  const running = state.tasks
    .filter((task) => state.taskRuns[task.taskId]?.status === 'running')
    .sort((left, right) => {
      const leftEnd = addSchedulerMinutes(
        state.taskRuns[left.taskId]!.startedAt!,
        left.durationMinutes,
      )
      const rightEnd = addSchedulerMinutes(
        state.taskRuns[right.taskId]!.startedAt!,
        right.durationMinutes,
      )
      return (
        leftEnd.localeCompare(rightEnd) || state.tasks.indexOf(left) - state.tasks.indexOf(right)
      )
    })

  return running[0]
}

export function advanceSchedulerRun(state: SchedulerRunState): SchedulerRunState {
  if (state.status === 'success' || state.status === 'failed') {
    return state
  }

  const runningTask = getNextRunningTask(state)
  if (runningTask) {
    const current = state.taskRuns[runningTask.taskId]!
    const nextClock = addSchedulerMinutes(current.startedAt!, runningTask.durationMinutes)
    const advanced = { ...state, clock: nextClock }
    const shouldFail =
      !state.recoveredTaskIds.includes(runningTask.taskId) &&
      runningTask.taskId === state.failureTaskId &&
      ((state.scenario === 'dwd-retry' && current.attempt === 1) ||
        (state.scenario === 'dwd-blocked' && current.attempt <= runningTask.maxAttempts))

    if (shouldFail) {
      return failTask(advanced, runningTask.taskId)
    }

    const completed = completeTask(advanced, runningTask.taskId)
    return startReadyTasks(completed)
  }

  const readyTaskIds = getReadyTaskIds(state)
  if (readyTaskIds.length > 0) {
    return startReadyTasks(state)
  }

  if (isLateDataScenario(state.scenario) && !state.isLateDataAvailable) {
    return markLateData(state)
  }

  return updateRunStatus(state)
}

export function transitionSchedulerRun(
  state: SchedulerRunState,
  action: SchedulerAction,
): SchedulerRunState {
  const canonicalAction =
    'taskId' in action ? { ...action, taskId: getCanonicalSchedulerTaskId(action.taskId) } : action

  switch (canonicalAction.type) {
    case 'advance':
      return advanceSchedulerRun(state)
    case 'start-task':
      return startTask(state, canonicalAction.taskId)
    case 'complete-task':
      return completeTask(state, canonicalAction.taskId)
    case 'fail-task':
      return failTask(state, canonicalAction.taskId, canonicalAction.reason)
    case 'recover-task':
      return recoverTask(state, canonicalAction.taskId)
    case 'mark-late-data':
      return markLateData(state)
  }
}

export function buildSchedulerTimeline(initialState: SchedulerRunState): SchedulerRunState[] {
  const frames = [initialState]
  let current = initialState
  const maxFrames = initialState.tasks.length * 12 + 20

  while (current.status !== 'success' && current.status !== 'failed' && frames.length < maxFrames) {
    const next = advanceSchedulerRun(current)
    if (next === current) {
      break
    }
    frames.push(next)
    current = next
  }

  return frames
}

export function createPartitionRerunPlan(
  tasks: readonly SchedulerTaskDefinition[],
  businessDate: string,
  mode: SchedulerRerunMode,
  targetTaskId?: string,
): SchedulerRerunPlan {
  const allTaskIds = getTopologicalTaskIds(tasks)
  const requestedTargetTaskId = targetTaskId ?? allTaskIds[allTaskIds.length - 1]
  if (!requestedTargetTaskId) {
    throw new Error('至少需要一个任务才能生成重跑计划')
  }

  const resolvedTargetTaskId = getCanonicalSchedulerTaskId(requestedTargetTaskId)
  const targetTask = getTaskOrThrow(tasks, resolvedTargetTaskId)
  const taskIds = mode === 'full' ? allTaskIds : getDownstreamTaskIds(tasks, resolvedTargetTaskId)
  const unsupportedTask = taskIds
    .map((taskId) => getTaskOrThrow(tasks, taskId))
    .find((task) => !task.contract.supportsPartialRerun)

  if (mode === 'partial' && unsupportedTask) {
    throw new Error(`${unsupportedTask.taskId} 不支持局部重跑`)
  }

  const reusedTaskIds = allTaskIds.filter((taskId) => !taskIds.includes(taskId))
  const outputTables = taskIds.map((taskId) => getTaskOrThrow(tasks, taskId).contract.outputTable)

  return {
    mode,
    businessDate,
    partition: {
      column: targetTask.contract.partition.column,
      value: businessDate,
    },
    targetTaskId: resolvedTargetTaskId,
    taskIds,
    reusedTaskIds,
    outputTables,
    reason:
      mode === 'partial'
        ? `只重跑 ${targetTask.label} 及其下游输出，复用 ${reusedTaskIds.length} 个已成功上游任务。`
        : '从 ODS 重新执行全部任务，让迟到数据重新穿过 DWD、DWS 和 ADS。',
  }
}

function createOutputComparison(
  isIdempotent: boolean,
  rows: number,
  partitionColumn: string,
): SchedulerOutputComparison {
  if (isIdempotent) {
    return {
      writeMode: 'overwrite-partition',
      isIdempotent: true,
      firstRunRows: rows,
      rerunRows: rows,
      finalRows: rows,
      duplicateRows: 0,
      outputState: 'available',
      explanation: `按 ${partitionColumn} 覆盖同一分区；第二次运行得到同一份结果，不叠加重复行。`,
    }
  }

  return {
    writeMode: 'append',
    isIdempotent: false,
    firstRunRows: rows,
    rerunRows: rows,
    finalRows: rows * 2,
    duplicateRows: rows,
    outputState: 'duplicate',
    explanation: `把同一 ${partitionColumn} 分区再次 append；原结果没有被替换，输出多出一份重复结果。`,
  }
}

export function compareRerunOutputs(
  taskContract: TransformationTaskContract,
  rows = 1,
): SchedulerRerunComparison {
  const safeRows = Math.max(0, rows)

  return {
    taskId: taskContract.taskId,
    outputTable: taskContract.outputTable,
    idempotent: createOutputComparison(true, safeRows, taskContract.partition.column),
    nonIdempotent: createOutputComparison(false, safeRows, taskContract.partition.column),
  }
}

export function getOutputStateLabel(outputState: SchedulerOutputState): string {
  return {
    'not-produced': '尚未产出',
    available: '可用',
    stale: '待更新',
    duplicate: '重复输出',
  }[outputState]
}
