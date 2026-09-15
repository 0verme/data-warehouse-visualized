import { describe, expect, it } from 'vitest'
import { schedulerVisualization } from '../src/content/lessons/scheduling-system'
import { sqlTransformationTaskContract } from '../src/content/lessons/sql-and-transformation'
import type { SchedulerScenario } from '../src/features/scheduler/types'
import {
  SCHEDULER_TASK_IDS,
  advanceSchedulerRun,
  compareRerunOutputs,
  createInitialSchedulerRun,
  createPartitionRerunPlan,
  createSchedulerTasks,
  getDependencyState,
  getReadyTaskIds,
  getSlaState,
  getTopologicalTaskIds,
  transitionSchedulerRun,
} from '../src/utils/scheduler'

const tasks = createSchedulerTasks(sqlTransformationTaskContract)

function runToTerminal(scenario: SchedulerScenario) {
  let state = createInitialSchedulerRun(tasks, {
    businessDate: sqlTransformationTaskContract.partition.value,
    scenario,
  })

  for (
    let index = 0;
    index < 100 && state.status !== 'success' && state.status !== 'failed';
    index += 1
  ) {
    state = advanceSchedulerRun(state)
  }

  return state
}

describe('时间轴驱动 DAG Run 模拟器', () => {
  it('直接复用第 05 章契约和加工快照，不复制订单数据', () => {
    expect(schedulerVisualization.taskContract).toBe(sqlTransformationTaskContract)
    expect(
      schedulerVisualization.tasks.find((task) => task.taskId === SCHEDULER_TASK_IDS.ads)?.contract,
    ).toBe(sqlTransformationTaskContract)
    expect(schedulerVisualization.outputPreview).toMatchObject({
      beforeLateAmount: 370,
      afterLateAmount: 420,
      beforeLateRows: 1,
      afterLateRows: 1,
    })

    const initialRun = createInitialSchedulerRun(tasks, { businessDate: '2026-09-13' })
    expect(initialRun.events[0]?.type).toBe('schedule')
    expect(initialRun.events.filter((event) => event.type === 'queue')).toHaveLength(tasks.length)
  })

  it('按拓扑顺序排列 ODS → DWD → DWS → ADS', () => {
    const order = getTopologicalTaskIds(tasks)
    const positions = new Map(order.map((taskId, index) => [taskId, index]))

    expect(order).toEqual([
      SCHEDULER_TASK_IDS.odsOrders,
      SCHEDULER_TASK_IDS.odsOrderItems,
      SCHEDULER_TASK_IDS.odsUsers,
      SCHEDULER_TASK_IDS.odsPayments,
      SCHEDULER_TASK_IDS.odsRefunds,
      SCHEDULER_TASK_IDS.dwd,
      SCHEDULER_TASK_IDS.dws,
      SCHEDULER_TASK_IDS.ads,
    ])
    tasks.forEach((task) =>
      task.dependsOn.forEach((dependencyId) => {
        expect(positions.get(dependencyId)).toBeLessThan(positions.get(task.taskId)!)
      }),
    )
  })

  it('依赖未满足时不允许 DWD 越过 ODS 输入', () => {
    const state = createInitialSchedulerRun(tasks, {
      businessDate: '2026-09-13',
    })
    const dwd = tasks.find((task) => task.taskId === SCHEDULER_TASK_IDS.dwd)!

    expect(getDependencyState(dwd, state.taskRuns)).toBe('waiting')
    expect(getReadyTaskIds(state)).not.toContain(SCHEDULER_TASK_IDS.dwd)
    expect(
      transitionSchedulerRun(state, { type: 'start-task', taskId: SCHEDULER_TASK_IDS.dwd }),
    ).toEqual(state)

    const afterFirstStep = advanceSchedulerRun(state)
    expect(afterFirstStep.taskRuns[SCHEDULER_TASK_IDS.dwd]?.status).toBe('queued')
    expect(afterFirstStep.taskRuns[SCHEDULER_TASK_IDS.dwd]?.dependencyState).toBe('waiting')
  })

  it('DWD failed → retry → success 时保留两个 attempt 且放行下游', () => {
    const state = runToTerminal('dwd-retry')
    const dwd = state.taskRuns[SCHEDULER_TASK_IDS.dwd]!

    expect(state.status).toBe('success')
    expect(dwd.status).toBe('success')
    expect(dwd.attempt).toBe(2)
    expect(dwd.attempts.map((attempt) => attempt.status)).toEqual(['failed', 'success'])
    expect(state.events.map((event) => event.type)).toContain('retry')
    expect(state.taskRuns[SCHEDULER_TASK_IDS.dws]?.status).toBe('success')
    expect(state.taskRuns[SCHEDULER_TASK_IDS.ads]?.outputState).toBe('available')
  })

  it('上游迟到时 DWD 保持 waiting，迟到事件到达后才继续传播', () => {
    let state = createInitialSchedulerRun(tasks, {
      businessDate: '2026-09-13',
      scenario: 'upstream-late',
    })
    const frames = [state]

    for (
      let index = 0;
      index < 100 && !state.events.some((event) => event.type === 'upstream-late');
      index += 1
    ) {
      state = advanceSchedulerRun(state)
      frames.push(state)
    }

    expect(
      frames.some((frame) => frame.taskRuns[SCHEDULER_TASK_IDS.dwd]?.status === 'running'),
    ).toBe(false)
    expect(state.clock).toBe('2026-09-14 06:20')
    expect(state.taskRuns[SCHEDULER_TASK_IDS.odsPayments]?.dependencyState).toBe('ready')
    expect(state.taskRuns[SCHEDULER_TASK_IDS.dwd]?.dependencyState).toBe('waiting')
    expect(state.events.some((event) => event.type === 'upstream-late')).toBe(true)

    const completed = runToTerminal('upstream-late')
    expect(completed.status).toBe('success')
    expect(completed.taskRuns[SCHEDULER_TASK_IDS.ads]).toMatchObject({
      slaState: 'breached',
      delayMinutes: 37,
    })
  })

  it('重试耗尽会阻断 DWS / ADS，并可人工 recovery 后再次成功', () => {
    let state = runToTerminal('dwd-blocked')

    expect(state.status).toBe('failed')
    expect(state.taskRuns[SCHEDULER_TASK_IDS.dwd]?.status).toBe('failed')
    expect(state.taskRuns[SCHEDULER_TASK_IDS.dws]).toMatchObject({
      status: 'skipped',
      dependencyState: 'blocked',
    })
    expect(state.taskRuns[SCHEDULER_TASK_IDS.ads]?.status).toBe('skipped')
    expect(state.events.filter((event) => event.type === 'skip')).toHaveLength(2)
    expect(state.events.findIndex((event) => event.type === 'failure')).toBeLessThan(
      state.events.findIndex((event) => event.type === 'skip'),
    )

    state = transitionSchedulerRun(state, { type: 'recover-task', taskId: SCHEDULER_TASK_IDS.dwd })
    expect(state.taskRuns[SCHEDULER_TASK_IDS.dwd]).toMatchObject({
      status: 'retry',
      dependencyState: 'ready',
    })
    expect(state.events.at(-1)?.type).toBe('recovery')

    state = runUntilFinished(state)
    expect(state.status).toBe('success')
    expect(state.taskRuns[SCHEDULER_TASK_IDS.dwd]?.attempt).toBe(3)
    expect(state.taskRuns[SCHEDULER_TASK_IDS.ads]?.status).toBe('success')
  })

  it('按业务日期生成局部补数与全链路重跑计划', () => {
    const partial = createPartitionRerunPlan(tasks, '2026-09-13', 'partial')
    const full = createPartitionRerunPlan(tasks, '2026-09-13', 'full')

    expect(partial).toMatchObject({
      mode: 'partial',
      targetTaskId: SCHEDULER_TASK_IDS.ads,
      partition: { column: 'dt', value: '2026-09-13' },
      taskIds: [SCHEDULER_TASK_IDS.ads],
    })
    expect(partial.reusedTaskIds).toHaveLength(tasks.length - 1)
    expect(full.taskIds).toEqual(getTopologicalTaskIds(tasks))
    expect(full.reusedTaskIds).toEqual([])

    const rerunState = createInitialSchedulerRun(tasks, {
      businessDate: '2026-09-13',
      trigger: 'partition-rerun',
      rerunPlan: partial,
    })
    expect(rerunState.taskRuns[SCHEDULER_TASK_IDS.dws]).toMatchObject({
      status: 'success',
      isReused: true,
      outputState: 'available',
    })
    expect(rerunState.taskRuns[SCHEDULER_TASK_IDS.ads]).toMatchObject({
      status: 'queued',
      dependencyState: 'ready',
    })
  })

  it('幂等分区重跑覆盖原结果，非幂等 append 会产生 duplicate output', () => {
    const comparison = compareRerunOutputs(sqlTransformationTaskContract)

    expect(comparison.taskId).toBe(sqlTransformationTaskContract.taskId)
    expect(comparison.idempotent).toMatchObject({
      writeMode: 'overwrite-partition',
      finalRows: 1,
      duplicateRows: 0,
      outputState: 'available',
    })
    expect(comparison.nonIdempotent).toMatchObject({
      writeMode: 'append',
      finalRows: 2,
      duplicateRows: 1,
      outputState: 'duplicate',
    })
  })

  it('根据完成时间和运行进度判定 SLA', () => {
    const scheduledAt = '2026-09-14 06:00'

    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-09-14 06:05',
        slaMinutes: 10,
        status: 'queued',
      }),
    ).toBe('not-started')
    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-09-14 06:08',
        slaMinutes: 10,
        status: 'running',
        startedAt: '2026-09-14 06:08',
      }),
    ).toBe('at-risk')
    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-09-14 06:09',
        slaMinutes: 10,
        status: 'success',
        startedAt: '2026-09-14 06:08',
        endedAt: '2026-09-14 06:09',
      }),
    ).toBe('on-time')
    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-09-14 06:10',
        slaMinutes: 10,
        status: 'success',
        startedAt: '2026-09-14 06:08',
        endedAt: '2026-09-14 06:10',
      }),
    ).toBe('on-time')
    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-09-14 06:11',
        slaMinutes: 10,
        status: 'success',
        startedAt: '2026-09-14 06:08',
        endedAt: '2026-09-14 06:11',
      }),
    ).toBe('breached')
  })
})

function runUntilFinished(initialState: ReturnType<typeof createInitialSchedulerRun>) {
  let state = initialState

  for (
    let index = 0;
    index < 100 && state.status !== 'success' && state.status !== 'failed';
    index += 1
  ) {
    state = advanceSchedulerRun(state)
  }

  return state
}
