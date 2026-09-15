import { describe, expect, it } from 'vitest'
import {
  BANKING_SCHEDULER_TASK_IDS,
  bankingDepositBalanceTaskContract,
  bankingSchedulerVisualization,
  createBankingSchedulerTasks,
} from '../src/features/scheduler/banking'
import type { SchedulerRunOptions, SchedulerScenario } from '../src/features/scheduler/types'
import { legacySchedulerVisualization } from '../src/content/lessons/legacy-scheduling-system'
import { sqlTransformationTaskContract } from '../src/content/lessons/sql-and-transformation'
import {
  advanceSchedulerRun,
  compareRerunOutputs,
  createInitialSchedulerRun,
  createPartitionRerunPlan,
  getDependencyState,
  getReadyTaskIds,
  getSlaState,
  getTopologicalTaskIds,
  transitionSchedulerRun,
} from '../src/utils/scheduler'

const tasks = createBankingSchedulerTasks(bankingDepositBalanceTaskContract)
const businessDate = bankingDepositBalanceTaskContract.partition.value
const scheduledAt = '2026-10-01 02:00'

function createBankingRun(
  scenario: SchedulerScenario = 'happy-path',
  overrides: Partial<SchedulerRunOptions> = {},
) {
  return createInitialSchedulerRun(tasks, {
    businessDate,
    scenario,
    scheduledAt,
    maxConcurrentTasks: 5,
    lateDataAvailableAt: '2026-10-01 02:20',
    lateDataDetectedAt: '2026-10-01 02:20',
    lateDataTaskId: BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot,
    failureTaskId: BANKING_SCHEDULER_TASK_IDS.dwd,
    ...overrides,
  })
}

function runToTerminal(scenario: SchedulerScenario, overrides: Partial<SchedulerRunOptions> = {}) {
  let state = createBankingRun(scenario, overrides)

  for (
    let index = 0;
    index < 200 && state.status !== 'success' && state.status !== 'failed';
    index += 1
  ) {
    state = advanceSchedulerRun(state)
  }

  return state
}

describe('第六章存款余额调度课程', () => {
  it('使用统一银行教学域和第 05 章交接事实', () => {
    expect(bankingSchedulerVisualization.taskContract).toBe(bankingDepositBalanceTaskContract)
    expect(bankingDepositBalanceTaskContract).toMatchObject({
      inputTables: ['AccountBalanceSnapshot', 'Account', 'Customer', 'Product', 'Branch'],
      outputTable: 'dws_deposit_balance_daily',
      partition: { column: 'snapshot_date', value: '2026-09-30' },
      isIdempotent: true,
      supportsPartialRerun: true,
    })
    expect(bankingSchedulerVisualization.outputPreview).toEqual({
      beforeLateRows: 1,
      beforeLateAmount: 1_000_000,
      afterLateRows: 1,
      afterLateAmount: 1_200_000,
    })
  })

  it('保留第 07、08 章继续使用的旧订单调度事实', () => {
    expect(legacySchedulerVisualization.taskContract).toBe(sqlTransformationTaskContract)
    expect(legacySchedulerVisualization.tasks).toHaveLength(8)
    expect(legacySchedulerVisualization.tasks.at(-1)?.contract.outputTable).toBe(
      'ads_yesterday_sales',
    )
  })

  it('按拓扑顺序排列五份输入、DWD、DWS 和 ADS', () => {
    expect(getTopologicalTaskIds(tasks)).toEqual([
      BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot,
      BANKING_SCHEDULER_TASK_IDS.account,
      BANKING_SCHEDULER_TASK_IDS.customer,
      BANKING_SCHEDULER_TASK_IDS.product,
      BANKING_SCHEDULER_TASK_IDS.branch,
      BANKING_SCHEDULER_TASK_IDS.dwd,
      BANKING_SCHEDULER_TASK_IDS.dws,
      BANKING_SCHEDULER_TASK_IDS.ads,
    ])
  })

  it('Trigger 到了但输入未 ready 时，任务保持等待而不是失败', () => {
    const state = createBankingRun('upstream-signal')
    const dwd = tasks.find((task) => task.taskId === BANKING_SCHEDULER_TASK_IDS.dwd)!
    const snapshot = state.taskRuns[BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot]

    expect(state.clock).toBe(scheduledAt)
    expect(snapshot?.status).toBe('queued')
    expect(snapshot?.dependencyState).toBe('waiting')
    expect(getDependencyState(dwd, state.taskRuns)).toBe('waiting')
    expect(getReadyTaskIds(state)).not.toContain(BANKING_SCHEDULER_TASK_IDS.dwd)
    expect(
      transitionSchedulerRun(state, {
        type: 'start-task',
        taskId: BANKING_SCHEDULER_TASK_IDS.dwd,
      }),
    ).toEqual(state)
  })

  it('上游完成信号和 FTP 检测都能在条件满足后放行输入', () => {
    const signalRun = runUntilEvent('upstream-signal', '2026-10-01 02:20', '2026-10-01 02:20')
    expect(signalRun.clock).toBe('2026-10-01 02:20')
    expect(signalRun.taskRuns[BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot]).toMatchObject({
      status: 'queued',
      dependencyState: 'ready',
    })

    const ftpRun = runUntilEvent('ftp-detection', '2026-10-01 02:07', '2026-10-01 02:30')
    expect(ftpRun.clock).toBe('2026-10-01 02:30')
    expect(ftpRun.lateDataAvailableAt).toBe('2026-10-01 02:07')
    expect(ftpRun.lateDataDetectedAt).toBe('2026-10-01 02:30')
    expect(ftpRun.events.at(-1)?.type).toBe('upstream-late')
    expect(ftpRun.events.at(-1)?.message).toContain('02:07')
  })

  it('DWD Attempt 1 失败后 Retry，成功才放行 DWS / ADS', () => {
    const state = runToTerminal('dwd-retry')
    const dwd = state.taskRuns[BANKING_SCHEDULER_TASK_IDS.dwd]!

    expect(state.status).toBe('success')
    expect(dwd.status).toBe('success')
    expect(dwd.attempt).toBe(2)
    expect(dwd.attempts.map((attempt) => attempt.status)).toEqual(['failed', 'success'])
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.dws]?.status).toBe('success')
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.ads]?.status).toBe('success')
  })

  it('Retry 耗尽会阻断下游，并允许人工 recovery 后继续', () => {
    let state = runToTerminal('dwd-blocked')

    expect(state.status).toBe('failed')
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.dwd]?.status).toBe('failed')
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.dws]).toMatchObject({
      status: 'skipped',
      dependencyState: 'blocked',
    })
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.ads]?.status).toBe('skipped')

    state = transitionSchedulerRun(state, {
      type: 'recover-task',
      taskId: BANKING_SCHEDULER_TASK_IDS.dwd,
    })
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.dwd]).toMatchObject({
      status: 'retry',
      dependencyState: 'ready',
    })

    state = runUntilFinished(state)
    expect(state.status).toBe('success')
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.dwd]?.attempt).toBe(3)
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.ads]?.status).toBe('success')
  })

  it('默认目标任务可生成局部 Rerun 和全链路 Backfill 计划', () => {
    const partial = createPartitionRerunPlan(tasks, businessDate, 'partial')
    const full = createPartitionRerunPlan(tasks, businessDate, 'full')
    const dwsPartial = createPartitionRerunPlan(
      tasks,
      businessDate,
      'partial',
      BANKING_SCHEDULER_TASK_IDS.dws,
    )

    expect(partial).toMatchObject({
      targetTaskId: BANKING_SCHEDULER_TASK_IDS.ads,
      taskIds: [BANKING_SCHEDULER_TASK_IDS.ads],
      partition: { column: 'snapshot_date', value: businessDate },
    })
    expect(dwsPartial.taskIds).toEqual([
      BANKING_SCHEDULER_TASK_IDS.dws,
      BANKING_SCHEDULER_TASK_IDS.ads,
    ])
    expect(full.taskIds).toEqual(getTopologicalTaskIds(tasks))
    expect(full.reusedTaskIds).toEqual([])

    const rerunState = createInitialSchedulerRun(tasks, {
      businessDate,
      scheduledAt,
      maxConcurrentTasks: 5,
      rerunPlan: partial,
      lateDataTaskId: BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot,
      failureTaskId: BANKING_SCHEDULER_TASK_IDS.dwd,
    })
    expect(rerunState.taskRuns[BANKING_SCHEDULER_TASK_IDS.dws]).toMatchObject({
      status: 'success',
      isReused: true,
      outputState: 'available',
    })
    expect(rerunState.taskRuns[BANKING_SCHEDULER_TASK_IDS.ads]).toMatchObject({
      status: 'queued',
      dependencyState: 'ready',
    })
  })

  it('以业务日期为作用域比较幂等覆盖和非幂等 append', () => {
    const comparison = compareRerunOutputs(bankingDepositBalanceTaskContract)

    expect(comparison.outputTable).toBe('dws_deposit_balance_daily')
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

  it('迟到数据导致链路延迟，但在 07:30 前完成仍满足 SLA', () => {
    const state = runToTerminal('upstream-late')
    const ads = state.taskRuns[BANKING_SCHEDULER_TASK_IDS.ads]!

    expect(state.status).toBe('success')
    expect(state.taskRuns[BANKING_SCHEDULER_TASK_IDS.dwd]?.startedAt).toBe('2026-10-01 02:21')
    expect(ads.endedAt).toBe('2026-10-01 02:36')
    expect(ads.slaState).toBe('on-time')
  })

  it('所有任务最终成功但 ADS 晚于业务约定时，SLA 仍然 breached', () => {
    const state = runToTerminal('upstream-late', {
      lateDataAvailableAt: '2026-10-01 07:20',
      lateDataDetectedAt: '2026-10-01 07:20',
    })
    const ads = state.taskRuns[BANKING_SCHEDULER_TASK_IDS.ads]!

    expect(state.status).toBe('success')
    expect(ads.status).toBe('success')
    expect(ads.endedAt).toBe('2026-10-01 07:36')
    expect(ads.slaState).toBe('breached')
  })

  it('根据完成时间和运行进度判定通用 SLA 状态', () => {
    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-10-01 02:05',
        slaMinutes: 10,
        status: 'queued',
      }),
    ).toBe('not-started')
    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-10-01 02:08',
        slaMinutes: 10,
        status: 'running',
        startedAt: '2026-10-01 02:08',
      }),
    ).toBe('at-risk')
    expect(
      getSlaState({
        scheduledAt,
        currentTime: '2026-10-01 02:11',
        slaMinutes: 10,
        status: 'success',
        startedAt: '2026-10-01 02:08',
        endedAt: '2026-10-01 02:11',
      }),
    ).toBe('breached')
  })
})

function runUntilEvent(
  scenario: Extract<SchedulerScenario, 'upstream-signal' | 'ftp-detection'>,
  lateDataAvailableAt: string,
  lateDataDetectedAt: string,
) {
  let state = createBankingRun(scenario, { lateDataAvailableAt, lateDataDetectedAt })

  for (
    let index = 0;
    index < 100 && !state.events.some((event) => event.type === 'upstream-late');
    index += 1
  ) {
    state = advanceSchedulerRun(state)
  }

  return state
}

function runUntilFinished(initialState: ReturnType<typeof createInitialSchedulerRun>) {
  let state = initialState

  for (
    let index = 0;
    index < 200 && state.status !== 'success' && state.status !== 'failed';
    index += 1
  ) {
    state = advanceSchedulerRun(state)
  }

  return state
}
