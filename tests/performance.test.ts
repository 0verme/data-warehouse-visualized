import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { performanceVisualizations } from '../src/features/performance/banking'
import type { CounterpartyTransaction } from '../src/features/performance/types'
import { getLessonBySlug, lessons } from '../src/data/course'
import {
  applyFirstSeenState,
  buildDailyCounterpartyRelations,
  getRecent30DayCounterpartyCount,
  getRecent30DayWindow,
  getScanSnapshot,
  getSkewStrategyResult,
  repairLateFirstSeen,
} from '../src/utils/performance'
import { getAdjacentLessons, getLessonDisplayNumber } from '../src/utils/lesson'

describe('第 11 章性能与工程实践课程', () => {
  it('注册为五节独立 Lesson，并保留 11-1 的旧 slug 和 id', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '11')

    expect(chapterLessons).toHaveLength(5)
    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'performance-and-practice',
      'performance-scan-layout',
      'performance-shuffle-skew',
      'performance-first-seen',
      'performance-tradeoffs',
    ])
    expect(chapterLessons.map((lesson) => getLessonDisplayNumber(lesson, lessons))).toEqual([
      '11-1',
      '11-2',
      '11-3',
      '11-4',
      '11-5',
    ])
    expect(chapterLessons.map((lesson) => lesson.id)).toEqual([
      'lesson-11',
      'lesson-11-scan-layout',
      'lesson-11-shuffle-skew',
      'lesson-11-first-seen',
      'lesson-11-tradeoffs',
    ])
    expect(chapterLessons.every((lesson) => lesson.demo === 'performance-lab')).toBe(true)
    expect(getLessonBySlug('performance-and-practice')).toMatchObject({
      id: 'lesson-11',
      chapter: '11',
    })
  })

  it('11-1 到 11-5 和 12-1 的正向、反向导航连续', () => {
    const expectedSlugs = [
      'performance-and-practice',
      'performance-scan-layout',
      'performance-shuffle-skew',
      'performance-first-seen',
      'performance-tradeoffs',
      'build-a-warehouse',
    ]

    expectedSlugs.forEach((slug, index) => {
      const adjacent = getAdjacentLessons(lessons, slug)
      expect(adjacent.previous?.slug).toBe(
        index === 0 ? 'data-service-choice' : expectedSlugs[index - 1],
      )
      expect(adjacent.next?.slug).toBe(
        index === expectedSlugs.length - 1 ? undefined : expectedSlugs[index + 1],
      )
    })

    expectedSlugs.slice(0, -1).forEach((slug, index) => {
      expect(getAdjacentLessons(lessons, expectedSlugs[index + 1]).previous?.slug).toBe(slug)
    })
  })

  it('五节 Lesson 分别绑定五种教学表现，而不是只注册一份正文', () => {
    const focuses = ['diagnosis', 'scan-layout', 'shuffle-skew', 'first-seen', 'tradeoffs'] as const
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '11')

    expect(
      chapterLessons.map((lesson) =>
        getLessonContent(lesson).sections.map((section) => section.kind),
      ),
    ).toEqual([
      ['narrative', 'visualization', 'narrative', 'takeaway', 'pitfall'],
      ['narrative', 'visualization', 'compare', 'takeaway', 'pitfall'],
      ['narrative', 'visualization', 'narrative', 'takeaway', 'pitfall'],
      ['narrative', 'visualization', 'narrative', 'takeaway', 'pitfall'],
      ['narrative', 'visualization', 'narrative', 'compare', 'takeaway', 'pitfall', 'narrative'],
    ])
    expect(
      chapterLessons.map((lesson) => {
        const visualization = getLessonContent(lesson).sections.find(
          (section) => section.kind === 'visualization',
        )
        return visualization?.kind === 'visualization' &&
          visualization.visualization.kind === 'performance-lab'
          ? visualization.visualization.focus
          : undefined
      }),
    ).toEqual(focuses)
  })

  it('11-1 保留阶段诊断、总运行时间和最长 Task 的确定性证据', () => {
    const data = performanceVisualizations.diagnosis.diagnosis

    expect(data.stages.map((stage) => `${stage.label} ${stage.durationMinutes} min`)).toEqual([
      'Scan 41 min',
      'Join 6 min',
      'Shuffle 15 min',
      'Aggregate 5 min',
      'Write 1 min',
    ])
    expect(data.totalRuntimeMinutes).toBe(68)
    expect(data.longestTask).toMatchObject({
      taskId: 'task-scan-017',
      stage: 'scan',
      durationMinutes: 41,
    })
    expect(performanceVisualizations.diagnosis.simulationNote).toContain('relative simulation')
    expect(
      JSON.stringify(getLessonContent(getLessonBySlug('performance-and-practice')!)),
    ).not.toContain('sales_daily')
  })

  it('11-2 体现 Partition Pruning、小文件和双 11 日期分区倾斜', () => {
    const data = performanceVisualizations.scanLayout.scanLayout
    const fullHistory = getScanSnapshot(data, 'full-history')
    const pruned = getScanSnapshot(data, 'partition-pruning')
    const fragmented = data.fileLayouts.find((layout) => layout.id === 'fragmented')!
    const compacted = data.fileLayouts.find((layout) => layout.id === 'compacted')!
    const doubleEleven = data.partitionSizes.find((partition) => partition.id === 'double-11')!

    expect(fullHistory.partitionsTouched).toBe(1095)
    expect(pruned.partitionsTouched).toBe(30)
    expect(pruned.scanBytes).toBe('82 TB')
    expect(pruned.partitionsTouched).toBeLessThan(fullHistory.partitionsTouched)
    expect(fragmented.fileCount).toBeGreaterThan(compacted.fileCount)
    expect(fragmented.relativeRuntime).toBe('18 min')
    expect(compacted.relativeRuntime).toBe('12 min')
    expect(doubleEleven.size).toBe('1.8 TB')
    expect(JSON.stringify(getLessonContent(getLessonBySlug('performance-scan-layout')!))).toContain(
      'txn_date',
    )
  })

  it('11-3 使用开户机构 Shuffle Key 倾斜，并让通用策略确定性地改变长尾', () => {
    const data = performanceVisualizations.shuffleSkew.skew
    const scenario = data.scenarios.find((item) => item.id === 'shuffle-key')!
    const baseline = getSkewStrategyResult(scenario, 'none')
    const split = getSkewStrategyResult(scenario, 'split-hot-key')
    const repeated = getSkewStrategyResult(scenario, 'split-hot-key')

    expect(scenario.keyValue).toContain('线上开户中心')
    expect(scenario.workerLoads.map((worker) => worker.loadGb)).toEqual([80, 75, 92, 680])
    expect(baseline.longestWorker).toMatchObject({ workerId: 'Worker 4', loadGb: 680 })
    expect(split.longestWorker?.loadGb).toBeLessThan(baseline.longestWorker!.loadGb)
    expect(split).toEqual(repeated)
    expect(
      JSON.stringify(getLessonContent(getLessonBySlug('performance-shuffle-skew')!)),
    ).toContain('日期分区倾斜')
    expect(
      JSON.stringify(getLessonContent(getLessonBySlug('performance-shuffle-skew')!)),
    ).toContain('Shuffle Key 倾斜')
  })

  it('11-4 将 Transaction 压到日关系，并增量维护 first_seen', () => {
    const transactions: CounterpartyTransaction[] = [
      {
        transactionId: 'T1',
        businessDate: '2026-09-16',
        customerId: 'A001',
        counterpartyId: 'B003',
      },
      {
        transactionId: 'T2',
        businessDate: '2026-09-16',
        customerId: 'A001',
        counterpartyId: 'B003',
      },
      {
        transactionId: 'T3',
        businessDate: '2026-09-16',
        customerId: 'A001',
        counterpartyId: 'B001',
      },
    ]
    const relations = buildDailyCounterpartyRelations(transactions)
    const update = applyFirstSeenState(
      [{ customerId: 'A001', counterpartyId: 'B001', firstSeenDate: '2026-01-03' }],
      relations,
      '2026-09-16',
    )

    expect(relations).toEqual([
      {
        businessDate: '2026-09-16',
        customerId: 'A001',
        counterpartyId: 'B001',
        transactionCount: 1,
      },
      {
        businessDate: '2026-09-16',
        customerId: 'A001',
        counterpartyId: 'B003',
        transactionCount: 2,
      },
    ])
    expect(update.evaluations).toEqual([
      expect.objectContaining({ relation: relations[0], isFirstSeen: false, action: 'keep' }),
      expect.objectContaining({ relation: relations[1], isFirstSeen: true, action: 'write' }),
    ])
    expect(update.state).toContainEqual({
      customerId: 'A001',
      counterpartyId: 'B003',
      firstSeenDate: '2026-09-16',
    })
    expect(JSON.stringify(getLessonContent(getLessonBySlug('performance-first-seen')!))).toContain(
      'customer_counterparty_first_seen',
    )
  })

  it('11-4 只实现固定最近 30 天窗口，并区分窗口与历史累计', () => {
    expect(getRecent30DayWindow('2026-09-16')).toEqual({
      start: '2026-08-18',
      end: '2026-09-16',
    })
    expect(
      getRecent30DayCounterpartyCount(
        [
          {
            businessDate: '2026-08-17',
            customerId: 'A001',
            counterpartyId: 'B000',
            transactionCount: 1,
          },
          {
            businessDate: '2026-08-18',
            customerId: 'A001',
            counterpartyId: 'B001',
            transactionCount: 1,
          },
          {
            businessDate: '2026-09-16',
            customerId: 'A001',
            counterpartyId: 'B003',
            transactionCount: 2,
          },
        ],
        'A001',
        '2026-09-16',
      ),
    ).toBe(2)
    expect(performanceVisualizations.firstSeen.state.grainNotes.map((note) => note.value)).toEqual([
      'business_date × customer_id × counterparty_id',
      'customer_id × counterparty_id',
      'customer_id × business_date',
      'customer_id × business_date',
    ])
  })

  it('11-5 覆盖迟到数据修正、工程验收和不值得优化的反例', () => {
    const data = performanceVisualizations.tradeoffs.tradeoffs
    const late = data.lateData
    const repaired = repairLateFirstSeen(
      [{ customerId: 'A001', counterpartyId: 'B004', firstSeenDate: late.currentFirstSeenDate }],
      {
        transactionId: 'late-1',
        businessDate: late.businessDate,
        customerId: late.customerId,
        counterpartyId: late.counterpartyId,
        arrivedAt: late.receivedAt,
      },
    )

    expect(data.beforeAfter.find((metric) => metric.id === 'runtime')).toMatchObject({
      before: '68 min',
      after: '18 min',
    })
    expect(late.receivedAt).toBe('2026-09-16')
    expect(late.businessDate).toBe('2026-09-10')
    expect(repaired).toContainEqual({
      customerId: 'A001',
      counterpartyId: 'B004',
      firstSeenDate: '2026-09-10',
    })
    expect(data.choices.find((choice) => choice.id === 'not-worth-it')).toMatchObject({
      originalRuntime: '8 min',
      optimizedRuntime: '3 min',
      sla: 'SLA = 4 小时',
    })
    expect(data.reflectionQuestion).toContain('任意日期区间内的去重交易对手数')
  })
})
