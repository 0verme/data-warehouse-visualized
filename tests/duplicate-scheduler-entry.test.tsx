import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DUPLICATE_SCHEDULER_CONFIGURATION,
  simulateDuplicateSchedulerEntries,
  type DuplicateSchedulerEntryConfiguration,
} from '../src/features/duplicate-scheduler-entry/model'
import { createBankingSchedulerVisualization } from '../src/features/scheduler/banking'
import { SchedulerRunSimulator } from '../src/components/visualizations/SchedulerRunSimulator'
import { getLessonBySlug } from '../src/data/course'
import { getLessonContent } from '../src/content/lessons'

const visualization = createBankingSchedulerVisualization('duplicate-entry')
const input = {
  businessDate: visualization.targetDate,
  productionLogicId: visualization.taskContract.taskId,
  outputTable: visualization.taskContract.outputTable,
}

function simulate(configuration: DuplicateSchedulerEntryConfiguration) {
  return simulateDuplicateSchedulerEntries({ ...input, ...configuration })
}

describe('双调度入口事故模型', () => {
  it('只有旧 JOB 启用时，只产生一条触发、执行和写入', () => {
    const result = simulate({
      oldJobEnabled: true,
      newJobEnabled: false,
      targetSemantics: 'idempotent',
    })

    expect(result).toMatchObject({
      triggerCount: 1,
      executionCount: 1,
      writeCount: 1,
      outputRows: 1,
      fileCount: 1,
      pushCount: 1,
    })
    expect(result.records.map((record) => record.entryId)).toEqual(['old-job'])
  })

  it('只有新 JOB 启用时，只产生新入口的运行记录', () => {
    const result = simulate({
      oldJobEnabled: false,
      newJobEnabled: true,
      targetSemantics: 'idempotent',
    })

    expect(result.triggerCount).toBe(1)
    expect(result.records.map((record) => record.entryId)).toEqual(['new-job'])
  })

  it('两个入口同时启用时，各自触发同一逻辑并产生独立 run record', () => {
    const result = simulate({
      oldJobEnabled: true,
      newJobEnabled: true,
      targetSemantics: 'idempotent',
    })

    expect(result).toMatchObject({
      triggerCount: 2,
      executionCount: 2,
      writeCount: 2,
      outputRows: 1,
      duplicateRows: 0,
      fileCount: 2,
      pushCount: 2,
    })
    expect(result.records.map((record) => record.productionLogicId)).toEqual([
      input.productionLogicId,
      input.productionLogicId,
    ])
    expect(new Set(result.records.map((record) => record.runId)).size).toBe(2)
  })

  it('幂等目标保持表结果正确，但不会消除重复文件与推送', () => {
    const result = simulate({
      oldJobEnabled: true,
      newJobEnabled: true,
      targetSemantics: 'idempotent',
    })

    expect(result.outputRows).toBe(1)
    expect(result.fileCount).toBe(2)
    expect(result.pushCount).toBe(2)
    expect(result.records.every((record) => record.writeMode === 'overwrite-partition')).toBe(true)
  })

  it('非幂等 append 会留下重复行，文件和推送仍按执行次数发生', () => {
    const result = simulate({
      oldJobEnabled: true,
      newJobEnabled: true,
      targetSemantics: 'non-idempotent',
    })

    expect(result).toMatchObject({
      triggerCount: 2,
      executionCount: 2,
      writeCount: 2,
      outputRows: 2,
      duplicateRows: 1,
      fileCount: 2,
      pushCount: 2,
    })
    expect(result.records.every((record) => record.writeMode === 'append')).toBe(true)
  })

  it('关闭旧入口后恢复单入口，输出行、文件与推送都回到一次', () => {
    const afterCutover = simulate({
      oldJobEnabled: false,
      newJobEnabled: true,
      targetSemantics: 'non-idempotent',
    })

    expect(afterCutover).toMatchObject({
      triggerCount: 1,
      executionCount: 1,
      writeCount: 1,
      outputRows: 1,
      duplicateRows: 0,
      fileCount: 1,
      pushCount: 1,
    })
  })

  it('没有有效入口时不会触发、执行或写入', () => {
    expect(
      simulate({
        oldJobEnabled: false,
        newJobEnabled: false,
        targetSemantics: 'idempotent',
      }),
    ).toMatchObject({
      triggerCount: 0,
      executionCount: 0,
      writeCount: 0,
      outputRows: 0,
      fileCount: 0,
      pushCount: 0,
      records: [],
    })
  })

  it('reset 回到默认双入口 / 幂等设置后，连续计算结果确定', () => {
    const resetConfiguration = { ...DEFAULT_DUPLICATE_SCHEDULER_CONFIGURATION }
    expect(resetConfiguration).toEqual({
      oldJobEnabled: true,
      newJobEnabled: true,
      targetSemantics: 'idempotent',
    })
    expect(simulate(resetConfiguration)).toEqual(simulate({ ...resetConfiguration }))
  })
})

describe('scheduling-rerun 双入口课程集成', () => {
  it('保留原 Rerun 实验，并增加独立的双入口实验区块', () => {
    const lesson = getLessonBySlug('scheduling-rerun')!
    const content = getLessonContent(lesson)
    const labs = content.sections.filter(
      (section) =>
        section.kind === 'visualization' &&
        section.visualization.kind === 'scheduler' &&
        section.visualization.lessonFocus === 'duplicate-entry',
    )

    expect(lesson.id).toBe('lesson-scheduling-rerun')
    expect(labs).toHaveLength(1)
    expect(
      content.sections.some(
        (section) =>
          section.kind === 'visualization' &&
          section.visualization.kind === 'scheduler' &&
          section.visualization.lessonFocus === 'rerun',
      ),
    ).toBe(true)
  })

  it('Scheduler route renders the separate local lab with explicit entry switches and metrics', () => {
    const markup = renderToStaticMarkup(<SchedulerRunSimulator visualization={visualization} />)

    expect(markup).toContain('data-duplicate-entry-lab')
    expect(markup).toContain('两个有效 JOB，指向同一生产逻辑')
    expect(markup).toContain('data-entry-toggle="old-job"')
    expect(markup).toContain('data-entry-toggle="new-job"')
    expect(markup).toContain('data-target-semantics="idempotent"')
    expect(markup).toContain('data-target-semantics="non-idempotent"')
    expect(markup).toContain('data-run-business-date')
    expect(markup).toContain('Trigger Count')
    expect(markup).toContain('Execution Count')
    expect(markup).toContain('Write Count')
    expect(markup).toContain('Output Rows')
    expect(markup).toContain('File Count')
    expect(markup).toContain('Push Count')
    expect(markup).toContain('data-duplicate-entry-status')
  })

  it('局部模型复用真实业务日期、生产逻辑 ID 和目标表', () => {
    const result = simulate({
      oldJobEnabled: true,
      newJobEnabled: true,
      targetSemantics: 'idempotent',
    })

    expect(result).toMatchObject({
      businessDate: '2026-09-30',
      productionLogicId: 'transform.deposit-balance.topic.daily.v1',
      outputTable: 'dws_deposit_balance_daily',
    })
  })
})
