import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug } from '../src/data/course'
import { SchedulerDateSemanticsExperiment } from '../src/components/visualizations/SchedulerDateSemanticsExperiment'
import { SchedulerRunSimulator } from '../src/components/visualizations/SchedulerRunSimulator'
import { createBankingSchedulerVisualization } from '../src/features/scheduler/banking'
import {
  DATE_SEMANTICS_SCENARIOS,
  DATE_SEMANTICS_TIME_ZONE,
  DEFAULT_DATE_SEMANTICS_SCENARIO,
  getDateSemanticsSnapshot,
} from '../src/features/scheduler/date-semantics'

describe('调度日期 / 业务日期语义实验', () => {
  it('所有场景按任务契约将 biz_date 映射到 snapshot_date', () => {
    for (const scenario of DATE_SEMANTICS_SCENARIOS) {
      const snapshot = getDateSemanticsSnapshot(scenario.id)

      expect(snapshot).toMatchObject({
        currentDate: scenario.wallClock.slice(0, 10),
        partition: { column: 'snapshot_date', value: scenario.businessDate },
        usesCurrentDateForPartition: false,
        partitionMatchesBusinessDate: true,
      })
    }
  })

  it('夜间日批明确展示 2026-09-27 01:00、实例日期和 T-1 业务日期', () => {
    const snapshot = getDateSemanticsSnapshot('nightly-t1')

    expect(snapshot.scenario.wallClock).toBe('2026-09-27 01:00')
    expect(snapshot.currentDate).toBe('2026-09-27')
    expect(snapshot.scenario.scheduleDate).toBe('2026-09-27')
    expect(snapshot.scenario.businessDate).toBe('2026-09-26')
    expect(snapshot.partition.value).toBe('2026-09-26')
    expect(snapshot.scenario.explanation).toContain('不是行业规则')
  })

  it('迟到后跨日 Retry 保留原 schedule_date 和 biz_date，而 current_date 已变', () => {
    const snapshot = getDateSemanticsSnapshot('late-retry')

    expect(snapshot.currentDate).toBe('2026-09-28')
    expect(snapshot.scenario.scheduleDate).toBe('2026-09-27')
    expect(snapshot.scenario.businessDate).toBe('2026-09-26')
    expect(snapshot.scenario.explanation).toContain('00:20 的 Retry')
  })

  it('次日 Rerun 与跨日 Backfill 使用各自显式目标日期，不推导自 wall clock', () => {
    const rerun = getDateSemanticsSnapshot('next-day-rerun')
    const backfill = getDateSemanticsSnapshot('cross-day-backfill')

    expect(rerun).toMatchObject({
      currentDate: '2026-09-28',
      scenario: { scheduleDate: '2026-09-28', businessDate: '2026-09-26' },
      partition: { value: '2026-09-26' },
    })
    expect(backfill).toMatchObject({
      currentDate: '2026-09-28',
      scenario: { scheduleDate: '2026-09-28', businessDate: '2026-09-25' },
      partition: { value: '2026-09-25' },
    })
    expect(backfill.scenario.explanation).toContain('不必沿用原始触发时间')
  })

  it('错用 current_date 会标错分区；日期偶然相同只显示为碰巧对齐', () => {
    const wrongNightly = getDateSemanticsSnapshot('nightly-t1', true)
    const coincidentallySameDay = getDateSemanticsSnapshot('same-day', true)

    expect(wrongNightly).toMatchObject({
      currentDate: '2026-09-27',
      partition: { value: '2026-09-27' },
      usesCurrentDateForPartition: true,
      partitionMatchesBusinessDate: false,
    })
    expect(coincidentallySameDay).toMatchObject({
      partition: { value: '2026-09-27' },
      usesCurrentDateForPartition: true,
      partitionMatchesBusinessDate: true,
    })
  })

  it('课程交互同时保留原有五类时间点与 snapshot_date=2026-09-30 案例', () => {
    const visualization = createBankingSchedulerVisualization('business-date')
    const markup = renderToStaticMarkup(<SchedulerRunSimulator visualization={visualization} />)

    expect(markup).toContain('data-date-semantics-lab')
    expect(markup).toContain('data-date-scenario="nightly-t1"')
    expect(markup).toContain('current_date · 环境自然日期')
    expect(markup).toContain('schedule_date · 调度实例日期')
    expect(markup).toContain('biz_date · 数据业务日期')
    expect(markup).toContain('data-date-partition-value="2026-09-26"')
    expect(markup).toContain('scheduler-time-semantics__timeline')
    expect(markup).toContain('snapshot_date = 2026-09-30')
    expect(markup).toContain(DATE_SEMANTICS_TIME_ZONE)
  })

  it('第五章既有 lesson 落点与课程索引摘要描述日期语义增量', () => {
    const lesson = getLessonBySlug('scheduling-system')!
    const content = getLessonContent(lesson)
    const serializedContent = JSON.stringify(content)

    expect(lesson.summary).toContain('current_date、schedule_date、biz_date')
    expect(lesson.tags).toEqual(
      expect.arrayContaining(['业务日期', '调度日期', '自然日期', 'Retry', 'Backfill']),
    )
    expect(serializedContent).toContain('不要把某个团队的 T-1 规则当作行业标准')
    expect(serializedContent).toContain('SQL `current_date` 受数据库引擎')
    expect(content.sections.find((section) => section.kind === 'visualization')).toMatchObject({
      title: '切换运行场景，核对日期字段与目标分区',
      visualization: { kind: 'scheduler', lessonFocus: 'business-date' },
    })
    expect(DEFAULT_DATE_SEMANTICS_SCENARIO).toBe('nightly-t1')
  })

  it('局部实验可独立 SSR，并声明场景切换与错误分区对照控件', () => {
    const markup = renderToStaticMarkup(<SchedulerDateSemanticsExperiment />)

    expect(markup).toContain('aria-label="选择日期场景"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('迟到后跨日 Retry')
    expect(markup).toContain('次日 Rerun')
    expect(markup).toContain('跨日 Backfill')
    expect(markup).toContain('错误对照')
    expect(markup).toContain('重置日期实验')
    expect(markup).toContain('2026-09-27 01:00 · Asia/Shanghai')
  })
})
