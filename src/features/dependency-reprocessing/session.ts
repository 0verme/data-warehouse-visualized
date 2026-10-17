/**
 * 依赖链重做专题 · E3 停止 / 等待 / 自动依赖重做 / ODS 二次修复会话。
 *
 * 在 Phase 1-B 内核之上组合出一条可交互的确定性恢复流程：
 *
 *   detected → stopped → (blocked | validated) → scheduled → completed
 *                                     completed → repaired → scheduled → …
 *
 * - 停止：受影响实例 running → stopping → stopped → waiting；ready 直接阻断；
 * - 门禁：ODS 验证不通过时不生成重做计划；
 * - 重做：按依赖顺序自动调用，失败按正常生产故障流程处理并保持已成功上游；
 * - 二次修复：受影响 SUCCESS 失效并重新等待，历史执行日志保留（无轮次字段）。
 *
 * 所有状态转换都是纯函数；组件只负责把 session 渲染出来。
 */

import {
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_SOURCE_INSTANCE_ID,
  REPROCESSING_TASK_IDS,
  createOdsValidationChecks,
  createReprocessingFixture,
} from './fixture'
import {
  analyzeReprocessingImpact,
  applyAffectedStopAndWait,
  applyReprocessingAction,
  createRedoSchedule,
  evaluateOdsValidation,
  findInstance,
  invalidateAffectedSuccess,
  orderTaskIdsByDependencies,
  shiftTimestamp,
} from './model'
import type {
  ImpactAnalysis,
  OdsValidationResult,
  RedoSchedule,
  ReprocessingLayer,
  ReprocessingModel,
  TaskInstanceState,
} from './types'

export type StopWaitRedoPhase =
  | 'detected'
  | 'stopped'
  | 'blocked'
  | 'validated'
  | 'scheduled'
  | 'failed'
  | 'completed'
  | 'repaired'

export const STOP_WAIT_REDO_PHASE_LABELS: Record<StopWaitRedoPhase, string> = {
  detected: '已圈定范围',
  stopped: '已停止 / 等待',
  blocked: '门禁阻断',
  validated: 'ODS 已验证',
  scheduled: '计划已生成',
  failed: '重做失败',
  completed: '重做完成',
  repaired: '再次修复 · 重新等待',
}

export type StopWaitRedoEventKind =
  | 'detected'
  | 'stop'
  | 'validate'
  | 'block'
  | 'schedule'
  | 'run'
  | 'success'
  | 'failure'
  | 'retry'
  | 'repair'
  | 'requeue'
  | 'arm'

export interface StopWaitRedoEvent {
  at: string
  kind: StopWaitRedoEventKind
  detail: string
}

export interface StopWaitRedoSession {
  phase: StopWaitRedoPhase
  clock: string
  model: ReprocessingModel
  analysis: ImpactAnalysis
  events: readonly StopWaitRedoEvent[]
  schedule: RedoSchedule | null
  validation: OdsValidationResult | null
  /** 教学开关：让该任务的重做失败一次（按正常生产故障流程处理）。 */
  failTaskId: string | null
  failedInstanceId: string | null
  invalidatedInstanceIds: readonly string[]
}

export type StopWaitRedoAction =
  | { type: 'stop-affected' }
  | { type: 'validate'; outcome: 'passed' | 'failed' }
  | { type: 'create-schedule' }
  | { type: 'arm-failure'; taskId: string | null }
  | { type: 'execute' }
  | { type: 'retry-failed' }
  | { type: 're-repair' }
  | { type: 'requeue' }
  | { type: 'reset' }

export const STOP_WAIT_FAIL_TASK_ID = REPROCESSING_TASK_IDS.dwdTransactionDetail

const SESSION_START = '2026-10-17 04:00:00'

export function createStopWaitRedoSession(): StopWaitRedoSession {
  const model = createReprocessingFixture()
  const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

  return {
    phase: 'detected',
    clock: SESSION_START,
    model,
    analysis,
    events: [
      {
        at: SESSION_START,
        kind: 'detected',
        detail: `圈定 ${analysis.affectedInstanceIds.length} 个受影响实例：先停止 / 阻断，再验证 ODS，最后按依赖重做。`,
      },
    ],
    schedule: null,
    validation: null,
    failTaskId: null,
    failedInstanceId: null,
    invalidatedInstanceIds: [],
  }
}

function taskIdFromInstanceId(instanceId: string): string {
  const separatorIndex = instanceId.lastIndexOf('@')
  return separatorIndex >= 0 ? instanceId.slice(0, separatorIndex) : instanceId
}

function labelForTask(session: StopWaitRedoSession, taskId: string): string {
  return session.model.tasks.find((task) => task.taskId === taskId)?.label ?? taskId
}

function record(
  session: StopWaitRedoSession,
  kind: StopWaitRedoEventKind,
  detail: string,
  seconds = 5,
): StopWaitRedoSession {
  const at = shiftTimestamp(session.clock, seconds)
  return {
    ...session,
    clock: at,
    events: [...session.events, { at, kind, detail }],
  }
}

function runSchedule(
  session: StopWaitRedoSession,
  resumeFromInstanceId: string | null,
): StopWaitRedoSession {
  const schedule = session.schedule
  if (!schedule) {
    throw new Error('尚无可执行的重做计划')
  }

  const startIndex = resumeFromInstanceId
    ? schedule.items.findIndex((item) => item.instanceId === resumeFromInstanceId)
    : 0
  if (startIndex < 0) {
    throw new Error(`重做计划中不存在实例: ${resumeFromInstanceId}`)
  }

  let next = session
  let failedInstanceId: string | null = null

  for (let index = startIndex; index < schedule.items.length; index += 1) {
    const item = schedule.items[index]
    if (!item) continue
    const instance = findInstance(next.model, item.instanceId)
    if (!instance) {
      throw new Error(`重做计划引用了未知实例: ${item.instanceId}`)
    }
    const label = labelForTask(next, item.taskId)

    next = {
      ...next,
      model: applyReprocessingAction(next.model, {
        type: 'start-redo',
        instanceId: item.instanceId,
        at: next.clock,
      }),
    }

    if (next.failTaskId === item.taskId && failedInstanceId === null) {
      next = {
        ...next,
        model: applyReprocessingAction(next.model, {
          type: 'fail-redo',
          instanceId: item.instanceId,
          at: next.clock,
          reason: '目标表写入失败（教学开关）',
        }),
      }
      next = record(
        next,
        'failure',
        `${label} 重做失败：按正常生产故障流程处理，保持已成功上游，不级联清空无关成功。`,
      )
      failedInstanceId = item.instanceId
      break
    }

    next = {
      ...next,
      model: applyReprocessingAction(next.model, {
        type: 'complete-redo',
        instanceId: item.instanceId,
        at: next.clock,
      }),
    }
    next = record(next, 'success', `${label} 重做完成。`)
  }

  if (failedInstanceId) {
    return {
      ...next,
      phase: 'failed',
      failedInstanceId,
      failTaskId: null,
    }
  }

  return {
    ...next,
    phase: 'completed',
    failedInstanceId: null,
  }
}

export function applyStopWaitRedoAction(
  session: StopWaitRedoSession,
  action: StopWaitRedoAction,
): StopWaitRedoSession {
  switch (action.type) {
    case 'reset':
      return createStopWaitRedoSession()

    case 'stop-affected': {
      if (session.phase !== 'detected') {
        throw new Error(`stop-affected 不支持的状态: ${session.phase}`)
      }
      const result = applyAffectedStopAndWait(session.model, session.analysis, session.clock)
      let next: StopWaitRedoSession = { ...session, model: result.model }

      for (const instanceId of result.stoppedInstanceIds) {
        next = record(
          next,
          'stop',
          `${labelForTask(next, taskIdFromInstanceId(instanceId))} 已确认停止并进入等待。`,
        )
      }
      for (const instanceId of result.blockedInstanceIds) {
        next = record(
          next,
          'stop',
          `${labelForTask(next, taskIdFromInstanceId(instanceId))} 尚未开始执行，直接阻断为等待。`,
        )
      }
      if (result.stoppedInstanceIds.length + result.blockedInstanceIds.length === 0) {
        next = record(next, 'stop', '没有需要停止的受影响实例，直接进入等待。')
      }

      return { ...next, phase: 'stopped' }
    }

    case 'validate': {
      if (session.phase !== 'stopped' && session.phase !== 'blocked') {
        throw new Error(`validate 不支持的状态: ${session.phase}`)
      }
      const checks = createOdsValidationChecks(action.outcome)
      const validation = evaluateOdsValidation(REPROCESSING_INCIDENT_BUSINESS_DATE, checks)

      if (!validation.validated) {
        const next = record(
          session,
          'block',
          `ODS 验证未通过（${validation.blockedReason}）：不生成重做计划。`,
        )
        return { ...next, phase: 'blocked', validation }
      }

      const next = record(
        session,
        'validate',
        `ODS 修复验证通过：${checks.length} 项检查全部通过，放行依赖链重做。`,
      )
      return { ...next, phase: 'validated', validation }
    }

    case 'create-schedule': {
      if (session.phase !== 'validated' || !session.validation) {
        throw new Error(`create-schedule 不支持的状态: ${session.phase}`)
      }
      const result = createRedoSchedule(session.model, session.analysis, {
        validation: session.validation,
      })
      if (result.status !== 'ready') {
        const next = record(session, 'block', `重做计划被阻断：${result.reason}`)
        return { ...next, phase: 'blocked' }
      }
      const next = record(
        session,
        'schedule',
        `生成重做计划：${result.schedule.items.length} 个实例按依赖顺序排列，上游先于下游。`,
      )
      return { ...next, phase: 'scheduled', schedule: result.schedule }
    }

    case 'arm-failure': {
      if (!['detected', 'stopped', 'validated', 'scheduled'].includes(session.phase)) {
        throw new Error(`arm-failure 不支持的状态: ${session.phase}`)
      }
      const detail = action.taskId
        ? `教学开关：让「${labelForTask(session, action.taskId)}」在一次重做中失败。`
        : '教学开关关闭：重做将全部成功。'
      return record({ ...session, failTaskId: action.taskId }, 'arm', detail)
    }

    case 'execute': {
      if (session.phase !== 'scheduled' || !session.schedule) {
        throw new Error(`execute 不支持的状态: ${session.phase}`)
      }
      const next = record(session, 'run', '按依赖顺序开始自动重做，人工不介入单个任务调用。')
      return runSchedule(next, null)
    }

    case 'retry-failed': {
      if (session.phase !== 'failed' || !session.failedInstanceId) {
        throw new Error(`retry-failed 不支持的状态: ${session.phase}`)
      }
      const next = record(
        session,
        'retry',
        `重试失败任务「${labelForTask(session, taskIdFromInstanceId(session.failedInstanceId))}」并从失败点继续。`,
      )
      return runSchedule(next, session.failedInstanceId)
    }

    case 're-repair': {
      if (session.phase !== 'completed') {
        throw new Error(`re-repair 不支持的状态: ${session.phase}`)
      }
      const invalidation = invalidateAffectedSuccess(
        session.model,
        session.analysis,
        session.clock,
        'ODS 再次修复：受影响 SUCCESS 失效并重新等待（保留历史执行日志）。',
      )
      const validation = evaluateOdsValidation(
        REPROCESSING_INCIDENT_BUSINESS_DATE,
        createOdsValidationChecks('passed'),
      )
      const next = record(
        {
          ...session,
          model: invalidation.model,
          validation,
          schedule: null,
          failedInstanceId: null,
          failTaskId: null,
          invalidatedInstanceIds: invalidation.invalidatedInstanceIds,
        },
        'repair',
        `ODS 再次修复：${invalidation.invalidatedInstanceIds.length} 个受影响 SUCCESS 失效并重新等待，历史日志保留。`,
      )
      return { ...next, phase: 'repaired' }
    }

    case 'requeue': {
      if (session.phase !== 'repaired' || !session.validation) {
        throw new Error(`requeue 不支持的状态: ${session.phase}`)
      }
      const result = createRedoSchedule(session.model, session.analysis, {
        validation: session.validation,
      })
      if (result.status !== 'ready') {
        const next = record(session, 'block', `重新入队被阻断：${result.reason}`)
        return { ...next, phase: 'blocked' }
      }
      const requeueRecord = record(
        session,
        'requeue',
        `重新根据血缘入队：${result.schedule.items.length} 个实例再次进入重做计划。`,
      )
      return { ...requeueRecord, phase: 'scheduled', schedule: result.schedule }
    }
  }
}

export interface StopWaitRedoNodeView {
  instanceId: string
  taskId: string
  label: string
  layer: ReprocessingLayer
  state: TaskInstanceState
  isConsumer: boolean
}

/** 受影响实例的当前状态，按依赖顺序排列。 */
export function buildStopWaitRedoNodeViews(
  session: StopWaitRedoSession,
): readonly StopWaitRedoNodeView[] {
  const orderByTaskId = new Map(
    orderTaskIdsByDependencies(session.model, session.analysis.deduplicatedTaskIds).map(
      (taskId, index) => [taskId, index],
    ),
  )

  return session.analysis.affectedInstanceIds
    .map((instanceId) => {
      const instance = findInstance(session.model, instanceId)
      const task = session.model.tasks.find(
        (candidate) => candidate.taskId === taskIdFromInstanceId(instanceId),
      )
      if (!instance || !task) {
        throw new Error(`E3 视图缺少实例或任务: ${instanceId}`)
      }
      return {
        instanceId,
        taskId: task.taskId,
        label: task.label,
        layer: task.layer,
        state: instance.state,
        isConsumer: task.layer === 'consumer',
      } satisfies StopWaitRedoNodeView
    })
    .sort(
      (left, right) =>
        (orderByTaskId.get(left.taskId) ?? 0) - (orderByTaskId.get(right.taskId) ?? 0),
    )
}

export interface StopWaitRedoSummary {
  phase: StopWaitRedoPhase
  phaseLabel: string
  affectedCount: number
  successCount: number
  waitingCount: number
  failedCount: number
  runningCount: number
  consumerCount: number
}

export function summarizeStopWaitRedoSession(session: StopWaitRedoSession): StopWaitRedoSummary {
  const nodes = buildStopWaitRedoNodeViews(session)
  const countByState = (states: readonly TaskInstanceState[]): number =>
    nodes.filter((node) => states.includes(node.state)).length

  return {
    phase: session.phase,
    phaseLabel: STOP_WAIT_REDO_PHASE_LABELS[session.phase],
    affectedCount: nodes.length,
    successCount: countByState(['success']),
    waitingCount: countByState(['waiting', 'blocked', 'skipped']),
    failedCount: countByState(['failed']),
    runningCount: countByState(['running', 'stopping', 'stopped', 'ready']),
    consumerCount: nodes.filter((node) => node.isConsumer).length,
  }
}
