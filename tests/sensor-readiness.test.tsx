import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SchedulerRunSimulator } from '../src/components/visualizations/SchedulerRunSimulator'
import { SensorReadinessLab } from '../src/components/visualizations/SensorReadinessLab'
import { createBankingSchedulerVisualization } from '../src/features/scheduler/banking'
import { schedulingReadinessContent } from '../src/content/lessons/scheduling-readiness'
import {
  advanceSensorReadinessRun,
  createSensorReadinessRun,
  getSensorFileState,
  resolveSensorTimeout,
} from '../src/features/scheduler/sensor-readiness'
import type { SensorReadinessRun } from '../src/features/scheduler/sensor-readiness'

function advanceTo(run: SensorReadinessRun, target: string): SensorReadinessRun {
  let state = run
  for (let index = 0; index < 20 && state.currentAt < target; index += 1) {
    state = advanceSensorReadinessRun(state)
  }
  return state
}

describe('readiness lesson 的局部 Sensor 模型', () => {
  it('在既有三种触发边界上补齐 Sensor，而不规定统一 polling / timeout 值', () => {
    const content = JSON.stringify(schedulingReadinessContent)

    expect(content).toContain('时间触发')
    expect(content).toContain('依赖触发')
    expect(content).toContain('外部条件触发 / Sensor')
    expect(content).toContain('Polling interval')
    expect(content).toContain('timeout')
    expect(content).toContain('02:07')
    expect(content).toContain('02:08')
    expect(content).toContain('02:10')
    expect(content).toContain('data.csv.done')
    expect(content).toContain('没有一种对所有场景都更高级')
    expect(content).not.toContain('每 5 分钟最好')
  })

  it('外部条件尚未满足时继续 polling，不误报 ready 或放行下游', () => {
    const firstPoll = advanceSensorReadinessRun(createSensorReadinessRun())

    expect(firstPoll).toMatchObject({
      currentAt: '2026-10-01 02:02',
      status: 'polling',
      downstreamEligible: false,
      polls: [{ checkedAt: '2026-10-01 02:02', fileState: 'absent', conditionSatisfied: false }],
    })
  })

  it('文件名出现但仍在写入时，ready protocol 保持等待', () => {
    const state = advanceTo(createSensorReadinessRun(), '2026-10-01 02:08')

    expect(getSensorFileState(state.currentAt)).toBe('incomplete')
    expect(state.status).toBe('polling')
    expect(state.polls.at(-1)).toMatchObject({
      checkedAt: '2026-10-01 02:08',
      fileState: 'incomplete',
      conditionSatisfied: false,
    })
    expect(state.downstreamEligible).toBe(false)
  })

  it('同批完成信号出现后 SUCCESS 才让下游获得运行资格', () => {
    const state = advanceTo(createSensorReadinessRun(), '2026-10-01 02:10')

    expect(getSensorFileState(state.currentAt)).toBe('complete')
    expect(state).toMatchObject({
      currentAt: '2026-10-01 02:10',
      status: 'success',
      downstreamEligible: true,
    })
  })

  it('关闭 ready protocol 会展示仅凭文件存在导致的提前放行反例', () => {
    const state = advanceTo(
      createSensorReadinessRun({ requireReadySignal: false }),
      '2026-10-01 02:08',
    )

    expect(getSensorFileState(state.currentAt)).toBe('incomplete')
    expect(state.status).toBe('success')
    expect(state.downstreamEligible).toBe(true)
    expect(state.polls.at(-1)).toMatchObject({
      fileState: 'incomplete',
      conditionSatisfied: true,
    })
  })

  it('polling interval 改变发现时间和检查次数，不将某个周期写成标准', () => {
    const state = advanceTo(
      createSensorReadinessRun({ pollingIntervalMinutes: 4 }),
      '2026-10-01 02:12',
    )

    expect(state.status).toBe('success')
    expect(state.currentAt).toBe('2026-10-01 02:12')
    expect(state.polls.map((poll) => poll.checkedAt)).toEqual([
      '2026-10-01 02:04',
      '2026-10-01 02:08',
      '2026-10-01 02:12',
    ])
  })

  it('到 timeout 时不自动失败，下游保持等待并由人选择处理路径', () => {
    const timedOut = advanceTo(
      createSensorReadinessRun({ pollingIntervalMinutes: 5, timeoutMinutes: 6 }),
      '2026-10-01 02:06',
    )

    expect(timedOut).toMatchObject({
      currentAt: '2026-10-01 02:06',
      status: 'timeout',
      downstreamEligible: false,
    })
    expect(resolveSensorTimeout(timedOut, 'manual-action').status).toBe('manual-action')
    expect(resolveSensorTimeout(timedOut, 'failed')).toMatchObject({
      status: 'failed',
      downstreamEligible: false,
    })
  })

  it('reset 与重复运行确定且不修改先前快照', () => {
    const config = { pollingIntervalMinutes: 2, timeoutMinutes: 14, requireReadySignal: true }
    const initial = createSensorReadinessRun(config)
    const finished = advanceTo(initial, '2026-10-01 02:10')
    const reset = createSensorReadinessRun(finished.config)
    const repeated = advanceTo(createSensorReadinessRun(config), '2026-10-01 02:10')

    expect(initial).toMatchObject({ currentAt: '2026-10-01 02:00', status: 'waiting', polls: [] })
    expect(reset).toEqual(initial)
    expect(repeated).toEqual(finished)
    expect(advanceSensorReadinessRun(finished)).toBe(finished)
  })

  it('readiness 课程实际挂载 Sensor 状态、协议开关、文件反例和下游状态', () => {
    const markup = renderToStaticMarkup(
      <SchedulerRunSimulator visualization={createBankingSchedulerVisualization('readiness')} />,
    )

    expect(markup).toContain('Sensor 怎样证明外部数据 ready？')
    expect(markup).toContain('Polling interval')
    expect(markup).toContain('Timeout')
    expect(markup).toContain('data.csv.done')
    expect(markup).toContain('Downstream State')
  })

  it('局部面板初始状态适合服务端渲染且声明关键观察字段', () => {
    const markup = renderToStaticMarkup(<SensorReadinessLab />)

    expect(markup).toContain('Sensor State')
    expect(markup).toContain('File State')
    expect(markup).toContain('Ready State')
    expect(markup).toContain('Downstream State')
    expect(markup).toContain('02:07')
    expect(markup).toContain('02:10')
  })
})
