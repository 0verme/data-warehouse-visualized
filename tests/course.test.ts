import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import {
  getAdjacentLessons,
  getChapterDisplayNumber,
  getLessonChapterId,
  getLessonDisplayNumber,
  getLessonFromPath,
  isLearnIndexPath,
  sortLessons,
  toggleExpandedChapter,
} from '../src/utils/lesson'

const reversedLessons = [...lessons].reverse()

describe('课程数据与导航', () => {
  it('按章节和章节内 order 稳定排序课程', () => {
    const ordered = sortLessons(reversedLessons)

    expect(ordered.map((lesson) => lesson.slug)).toEqual(lessons.map((lesson) => lesson.slug))
    expect(ordered.slice(4, 9).map((lesson) => `${lesson.chapter}:${lesson.order}`)).toEqual([
      '02:100',
      '02:200',
      '02:300',
      '02:400',
      '02:500',
    ])
  })

  it('从当前章节排序动态计算课程展示编号', () => {
    expect(getChapterDisplayNumber('01')).toBe('01')
    expect(getChapterDisplayNumber('10')).toBe('10')
    expect(getLessonDisplayNumber(getLessonBySlug('why-data-warehouse')!, lessons)).toBe('1-1')
    expect(getLessonDisplayNumber(getLessonBySlug('warehouse-layers')!, lessons)).toBe('1-2')
    expect(getLessonDisplayNumber(getLessonBySlug('data-modeling')!, lessons)).toBe('2-1')
    expect(getLessonDisplayNumber(getLessonBySlug('grain')!, lessons)).toBe('2-2')
    expect(getLessonDisplayNumber(getLessonBySlug('star-schema-and-grain')!, lessons)).toBe('2-3')
    expect(getLessonDisplayNumber(getLessonBySlug('fact-table-types')!, lessons)).toBe('2-4')
    expect(getLessonDisplayNumber(getLessonBySlug('slowly-changing-dimension')!, lessons)).toBe(
      '2-5',
    )
  })

  it('第一章固定为四节并保留原有课程 id 与 slug', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '01')

    expect(chapterLessons).toHaveLength(4)
    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'why-data-warehouse',
      'warehouse-layers',
      'report-metric-journey',
      'warehouse-terms',
    ])
    expect(chapterLessons.map((lesson) => getLessonDisplayNumber(lesson, lessons))).toEqual([
      '1-1',
      '1-2',
      '1-3',
      '1-4',
    ])
    expect(chapterLessons.map((lesson) => lesson.demo)).toEqual([
      'systems',
      'layer-evolution',
      'report-metric-journey',
      'warehouse-terms',
    ])
    expect(getLessonBySlug('why-data-warehouse')).toMatchObject({
      id: 'lesson-01',
      slug: 'why-data-warehouse',
      chapter: '01',
    })
    expect(getLessonBySlug('warehouse-layers')).toMatchObject({
      id: 'lesson-02',
      slug: 'warehouse-layers',
      chapter: '01',
    })

    const chapterText = JSON.stringify(chapterLessons.map((lesson) => getLessonContent(lesson)))
    expect(chapterText).toContain('核心系统')
    expect(chapterText).toContain('信贷系统')
    expect(chapterText).toContain('90 ÷ 120 = 75%')
    expect(chapterText).toContain('OLTP')
    expect(chapterText).toContain('ETL')
    expect(chapterText).toContain('Data Warehouse')
  })

  it('插入章节内 order 权重后自动重新计算后续展示编号', () => {
    const insertedLessons = [
      { id: 'lesson-a', chapter: '01', order: 100 },
      { id: 'lesson-b', chapter: '01', order: 200 },
      { id: 'lesson-c', chapter: '01', order: 300 },
      { id: 'lesson-new', chapter: '01', order: 150 },
    ] as const
    const ordered = sortLessons(insertedLessons)

    expect(ordered.map((lesson) => lesson.id)).toEqual([
      'lesson-a',
      'lesson-new',
      'lesson-b',
      'lesson-c',
    ])
    expect(ordered.map((lesson) => getLessonDisplayNumber(lesson, insertedLessons))).toEqual([
      '1-1',
      '1-2',
      '1-3',
      '1-4',
    ])
  })

  it('第四章正式拆成五节存款余额加工课程', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '04')

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'sql-and-transformation',
      'sql-transformation-cleaning',
      'sql-transformation-join',
      'sql-transformation-layers',
      'sql-transformation-contract',
    ])
    expect(chapterLessons.map((lesson) => lesson.demo)).toEqual([
      'sql-transformation',
      'sql-transformation',
      'sql-transformation',
      'sql-transformation',
      'sql-transformation',
    ])
    expect(
      chapterLessons.map((lesson) => {
        const visualization = getLessonContent(lesson).sections.find(
          (section) => section.kind === 'visualization',
        )
        return visualization?.kind === 'visualization' &&
          visualization.visualization.kind === 'sql-transformation'
          ? visualization.visualization.focus
          : undefined
      }),
    ).toEqual(['plan', 'cleaning', 'join', 'layers', 'contract'])
  })

  it('第五章拆成五节不同学习目标的调度实验', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '05')
    const expectedSlugs = [
      'scheduling-system',
      'scheduling-readiness',
      'scheduling-failure',
      'scheduling-rerun',
      'scheduling-sla',
    ]

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual(expectedSlugs)
    expect(chapterLessons.map((lesson) => lesson.demo)).toEqual([
      'scheduler',
      'scheduler',
      'scheduler',
      'scheduler',
      'scheduler',
    ])
    expect(chapterLessons.map((lesson) => getLessonContent(lesson).concept.term)).toEqual([
      '业务日期（Business Date）',
      '运行条件（Run Condition）',
      '失败传播（Failure Propagation）',
      '幂等（Idempotency）',
      'SLA（服务级别约定）',
    ])
    expect(
      chapterLessons.map(
        (lesson) =>
          getLessonContent(lesson).sections.find((section) => section.kind === 'visualization')
            ?.visualization.kind,
      ),
    ).toEqual(['scheduler', 'scheduler', 'scheduler', 'scheduler', 'scheduler'])
    expect(
      chapterLessons.map(
        (lesson) =>
          getLessonContent(lesson).sections.find((section) => section.kind === 'visualization')
            ?.visualization,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lessonFocus: 'business-date' }),
        expect.objectContaining({ lessonFocus: 'readiness' }),
        expect.objectContaining({ lessonFocus: 'failure' }),
        expect.objectContaining({ lessonFocus: 'rerun' }),
        expect.objectContaining({ lessonFocus: 'sla' }),
      ]),
    )
    expect(getAdjacentLessons(lessons, 'scheduling-system').next?.slug).toBe('scheduling-readiness')
    expect(getAdjacentLessons(lessons, 'scheduling-sla').next?.slug).toBe('data-quality')
  })

  it('第六章稳定注册为 6-1 到 6-5，并保留 data-quality slug', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '06')

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'data-quality',
      'data-quality-rules',
      'data-quality-dataset',
      'data-quality-evidence',
      'data-quality-release',
    ])
    expect(chapterLessons.map((lesson) => getLessonDisplayNumber(lesson, lessons))).toEqual([
      '6-1',
      '6-2',
      '6-3',
      '6-4',
      '6-5',
    ])
    expect(chapterLessons.map((lesson) => lesson.title)).toEqual([
      '任务成功了，数据就可信了吗？',
      '一张表到底应该检查什么？',
      '每一行都正常，为什么结果还是可能错？',
      '质量失败以后，我们到底应该看什么？',
      '发现问题以后，这份数据还能发布吗？',
    ])
    expect(getLessonBySlug('data-quality')?.demo).toBe('data-quality')
    expect(
      getLessonContent(getLessonBySlug('data-quality-release')!).sections.some(
        (section) =>
          section.kind === 'visualization' && section.visualization.kind === 'data-quality',
      ),
    ).toBe(true)
  })

  it('返回当前课程的上一节和下一节', () => {
    const adjacent = getAdjacentLessons(lessons, 'warehouse-layers')

    expect(adjacent.previous?.slug).toBe('why-data-warehouse')
    expect(adjacent.next?.slug).toBe('report-metric-journey')
  })

  it('第二章按业务过程、Grain、星型模型、事实表类型、拉链表连成五节课程', () => {
    expect(lessons.slice(4, 9).map((lesson) => lesson.slug)).toEqual([
      'data-modeling',
      'grain',
      'star-schema-and-grain',
      'fact-table-types',
      'slowly-changing-dimension',
    ])
    expect(lessons.slice(4, 9).map((lesson) => lesson.title)).toEqual([
      '业务过程：到底要记录哪件事？',
      'Grain：一行究竟代表什么？',
      '事实、维度与星型模型',
      '事实表不只有一种',
      '维度为什么要保存历史？——拉链表',
    ])
    expect(getLessonBySlug('data-modeling')?.demo).toBe('loan-business-process')
    expect(getLessonBySlug('grain')?.demo).toBe('loan-grain')
    expect(getLessonBySlug('star-schema-and-grain')?.demo).toBe('banking-star-schema')
    expect(getLessonBySlug('fact-table-types')?.demo).toBe('banking-fact-types')
    expect(getLessonBySlug('slowly-changing-dimension')?.demo).toBe('banking-customer-history')

    expect(getAdjacentLessons(lessons, 'data-modeling')).toEqual({
      previous: expect.objectContaining({ slug: 'warehouse-terms' }),
      next: expect.objectContaining({ slug: 'grain' }),
    })
    expect(getAdjacentLessons(lessons, 'grain')).toEqual({
      previous: expect.objectContaining({ slug: 'data-modeling' }),
      next: expect.objectContaining({ slug: 'star-schema-and-grain' }),
    })
    expect(getAdjacentLessons(lessons, 'star-schema-and-grain')).toEqual({
      previous: expect.objectContaining({ slug: 'grain' }),
      next: expect.objectContaining({ slug: 'fact-table-types' }),
    })
    expect(getAdjacentLessons(lessons, 'fact-table-types')).toEqual({
      previous: expect.objectContaining({ slug: 'star-schema-and-grain' }),
      next: expect.objectContaining({ slug: 'slowly-changing-dimension' }),
    })
    expect(getAdjacentLessons(lessons, 'slowly-changing-dimension')).toEqual({
      previous: expect.objectContaining({ slug: 'fact-table-types' }),
      next: expect.objectContaining({ slug: 'metric-system' }),
    })
  })

  it('ClientRouter 按 URL 逐节推进五节建模课程链路', () => {
    const expectedSlugs = [
      'data-modeling',
      'grain',
      'star-schema-and-grain',
      'fact-table-types',
      'slowly-changing-dimension',
      'metric-system',
      'deposit-metric-definition',
      'deposit-metric-time',
      'deposit-metric-derivations',
    ]
    let pathname = `/learn/${expectedSlugs[0]}/`

    expectedSlugs.forEach((expectedSlug, index) => {
      const currentLesson = getLessonFromPath(pathname, lessons)

      expect(currentLesson?.slug).toBe(expectedSlug)
      if (index < expectedSlugs.length - 1) {
        expect(getAdjacentLessons(lessons, currentLesson!.slug).next?.slug).toBe(
          expectedSlugs[index + 1],
        )
      }

      if (index < expectedSlugs.length - 1) {
        pathname = `/learn/${expectedSlugs[index + 1]}/`
      }
    })
  })

  it('上一节通过 URL 逐节后退且支持部署 base path', () => {
    const current = getLessonFromPath('/dw/learn/slowly-changing-dimension/', lessons)

    expect(current?.slug).toBe('slowly-changing-dimension')
    expect(getAdjacentLessons(lessons, current!.slug).previous?.slug).toBe('fact-table-types')
    expect(
      getAdjacentLessons(lessons, getAdjacentLessons(lessons, current!.slug).previous!.slug)
        .previous?.slug,
    ).toBe('star-schema-and-grain')
    expect(isLearnIndexPath('/dw/learn/')).toBe(true)
  })

  it('按当前课程定位章节并保持单展开 Accordion', () => {
    expect(getLessonChapterId(lessons, 'lesson-scd-type-2')).toBe('02')
    expect(getLessonChapterId(lessons, 'lesson-04')).toBe('03')

    let expandedChapterId: string | null = '02'
    expandedChapterId = toggleExpandedChapter(expandedChapterId, '03')
    expect(expandedChapterId).toBe('03')

    expandedChapterId = toggleExpandedChapter(expandedChapterId, '03')
    expect(expandedChapterId).toBeNull()
  })

  it('2-1 只从贷款业务过程开始，不提前使用后续模型概念', () => {
    const lesson = getLessonBySlug('data-modeling')

    expect(lesson).toBeDefined()
    const content = getLessonContent(lesson!)

    expect(content.concept.term).toBe('Business Process（业务过程）')
    expect(
      content.sections.some(
        (section) =>
          section.kind === 'visualization' &&
          section.visualization.kind === 'loan-business-process',
      ),
    ).toBe(true)
    expect(content.visualization).toBeUndefined()
    expect(content.engineeringTip).toBeUndefined()
    expect(content.pitfalls).toBeUndefined()
  })

  it('五节课程使用各自的银行教学可视化', () => {
    const visualizationKinds = lessons.slice(4, 9).map((lesson) => {
      const visualization = getLessonContent(lesson).sections.find(
        (section) => section.kind === 'visualization',
      )
      return visualization?.kind === 'visualization' ? visualization.visualization.kind : undefined
    })

    expect(visualizationKinds).toEqual([
      'loan-business-process',
      'loan-grain',
      'banking-star-schema',
      'banking-fact-types',
      'banking-customer-history',
    ])
  })

  it('星型模型和拉链表课程保留不同的语义 sections', () => {
    const starSchema = getLessonContent(getLessonBySlug('star-schema-and-grain')!)
    const scd = getLessonContent(getLessonBySlug('slowly-changing-dimension')!)

    expect(starSchema.sections.map((section) => section.kind ?? 'narrative')).toEqual([
      'narrative',
      'visualization',
      'narrative',
      'takeaway',
      'pitfall',
    ])
    expect(scd.sections.map((section) => section.kind ?? 'narrative')).toEqual([
      'narrative',
      'visualization',
      'compare',
      'narrative',
      'takeaway',
      'engineering-note',
      'pitfall',
    ])
    expect(starSchema.visualization).toBeUndefined()
    expect(scd.visualization).toBeUndefined()
    expect(scd.comparison).toBeUndefined()
    expect(scd.code).toBeUndefined()
    expect(scd.engineeringTip).toBeUndefined()
    expect(scd.pitfalls).toBeUndefined()
  })

  it('第 03 章按存款余额口径、定义、时间和派生连成四节课程', () => {
    expect(lessons.slice(9, 13).map((lesson) => lesson.slug)).toEqual([
      'metric-system',
      'deposit-metric-definition',
      'deposit-metric-time',
      'deposit-metric-derivations',
    ])
    expect(lessons.slice(9, 13).map((lesson) => lesson.title)).toEqual([
      '同一个“存款余额”，为什么会有不同答案？',
      '一个指标到底由什么组成？',
      '“截至某天”和“一段时间”有什么区别？',
      '一个“存款余额”为什么能派生出这么多指标？',
    ])
    expect(lessons.slice(9, 13).map((lesson) => lesson.demo)).toEqual([
      'banking-metric-scope',
      'banking-metric-definition',
      'banking-metric-time',
      'banking-metric-derivations',
    ])

    expect(getAdjacentLessons(lessons, 'metric-system')).toEqual({
      previous: expect.objectContaining({ slug: 'slowly-changing-dimension' }),
      next: expect.objectContaining({ slug: 'deposit-metric-definition' }),
    })
    expect(getAdjacentLessons(lessons, 'deposit-metric-definition')).toEqual({
      previous: expect.objectContaining({ slug: 'metric-system' }),
      next: expect.objectContaining({ slug: 'deposit-metric-time' }),
    })
    expect(getAdjacentLessons(lessons, 'deposit-metric-time')).toEqual({
      previous: expect.objectContaining({ slug: 'deposit-metric-definition' }),
      next: expect.objectContaining({ slug: 'deposit-metric-derivations' }),
    })
    expect(getAdjacentLessons(lessons, 'deposit-metric-derivations')).toEqual({
      previous: expect.objectContaining({ slug: 'deposit-metric-time' }),
      next: expect.objectContaining({ slug: 'sql-and-transformation' }),
    })

    expect(getLessonContent(getLessonBySlug('metric-system')!)).toMatchObject({
      opening: { title: '截至 2026-09-30，全行存款余额是多少？' },
    })
  })

  it('第 07 章正式拆成 7-1 到 7-5 的五节数据血缘课程', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '07')
    const expectedSlugs = [
      'data-lineage',
      'data-lineage-fields',
      'data-lineage-investigation',
      'data-lineage-impact',
      'data-lineage-evidence',
    ]

    expect(chapterLessons).toHaveLength(5)
    expect(chapterLessons.map((lesson) => lesson.chapter)).toEqual(['07', '07', '07', '07', '07'])
    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual(expectedSlugs)
    expect(chapterLessons.map((lesson) => lesson.order)).toEqual([100, 200, 300, 400, 500])
    expect(chapterLessons.map((lesson) => getLessonDisplayNumber(lesson, lessons))).toEqual([
      '7-1',
      '7-2',
      '7-3',
      '7-4',
      '7-5',
    ])
    expect(chapterLessons.map((lesson) => lesson.title)).toEqual([
      '这份数据到底从哪里来？',
      '只知道上游表，为什么还不够？',
      '质量告警以后，哪些上游值得先查？',
      '如果这里出问题，会影响哪些下游？',
      '图上的这条箭头，凭什么相信？',
    ])
    expect(chapterLessons.map((lesson) => lesson.demo)).toEqual([
      'lineage',
      'lineage',
      'lineage',
      'lineage',
      'lineage',
    ])

    expect(
      chapterLessons.map((lesson) => {
        const visualization = getLessonContent(lesson).sections.find(
          (section) => section.kind === 'visualization',
        )

        return visualization?.kind === 'visualization'
          ? {
              kind: visualization.visualization.kind,
              mode:
                visualization.visualization.kind === 'lineage'
                  ? visualization.visualization.teaching?.mode
                  : undefined,
            }
          : undefined
      }),
    ).toEqual([
      { kind: 'lineage', mode: 'overview' },
      { kind: 'lineage', mode: 'field-dependencies' },
      { kind: 'lineage', mode: 'investigation' },
      { kind: 'lineage', mode: 'impact' },
      { kind: 'lineage', mode: 'evidence' },
    ])
    expect(getLessonBySlug('data-lineage')).toMatchObject({
      id: 'lesson-08',
      order: 100,
      chapter: '07',
    })

    expect(getAdjacentLessons(lessons, 'data-lineage').next?.slug).toBe('data-lineage-fields')
    expect(getAdjacentLessons(lessons, 'data-lineage-fields').next?.slug).toBe(
      'data-lineage-investigation',
    )
    expect(getAdjacentLessons(lessons, 'data-lineage-investigation').next?.slug).toBe(
      'data-lineage-impact',
    )
    expect(getAdjacentLessons(lessons, 'data-lineage-impact').next?.slug).toBe(
      'data-lineage-evidence',
    )
    expect(getAdjacentLessons(lessons, 'data-lineage-evidence').next?.slug).toBe('data-governance')
    expect(getAdjacentLessons(lessons, 'data-governance').previous?.slug).toBe(
      'data-lineage-evidence',
    )
    expect(getAdjacentLessons(lessons, 'data-governance-change-responsibility').next?.slug).toBe(
      'lakehouse',
    )
    expect(getAdjacentLessons(lessons, 'lakehouse').previous?.slug).toBe(
      'data-governance-change-responsibility',
    )
    expect(getAdjacentLessons(lessons, 'lakehouse-unity').next?.slug).toBe('data-service')
    expect(getAdjacentLessons(lessons, 'data-service').previous?.slug).toBe('lakehouse-unity')
  })

  it('第十章正式注册为五节数据服务课程并保留原链接', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '10')
    const expectedSlugs = [
      'data-service',
      'data-service-report',
      'data-service-file',
      'data-service-api',
      'data-service-choice',
    ]

    expect(chapterLessons).toHaveLength(5)
    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual(expectedSlugs)
    expect(chapterLessons.map((lesson) => getLessonDisplayNumber(lesson, lessons))).toEqual([
      '10-1',
      '10-2',
      '10-3',
      '10-4',
      '10-5',
    ])
    expect(chapterLessons.map((lesson) => lesson.title)).toEqual([
      '数据做好了，怎么交给别人用？',
      '报表与 BI：给人看的数据',
      '文件接口：给系统批量交付数据',
      'API：让系统按需获取数据',
      '同一份数据，应该怎么交付？',
    ])
    expect(chapterLessons.map((lesson) => lesson.demo)).toEqual([
      'data-service',
      'data-service',
      'data-service',
      'data-service',
      'data-service',
    ])
    expect(
      chapterLessons.map(
        (lesson) =>
          getLessonContent(lesson).sections.find((section) => section.kind === 'visualization')
            ?.visualization,
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'data-service', mode: 'overview' }),
      expect.objectContaining({ kind: 'data-service', mode: 'report' }),
      expect.objectContaining({ kind: 'data-service', mode: 'file' }),
      expect.objectContaining({ kind: 'data-service', mode: 'api' }),
      expect.objectContaining({ kind: 'data-service', mode: 'decision' }),
    ])
    expect(getLessonBySlug('data-service')).toMatchObject({
      id: 'lesson-data-service',
      slug: 'data-service',
      chapter: '10',
    })
    expect(getAdjacentLessons(lessons, 'data-service').previous?.slug).toBe('lakehouse-unity')
    expect(getAdjacentLessons(lessons, 'data-service').next?.slug).toBe('data-service-report')
    expect(getAdjacentLessons(lessons, 'data-service-choice').previous?.slug).toBe(
      'data-service-api',
    )
    expect(getAdjacentLessons(lessons, 'data-service-choice').next?.slug).toBe(
      'performance-and-practice',
    )
    expect(getAdjacentLessons(lessons, 'performance-and-practice').previous?.slug).toBe(
      'data-service-choice',
    )

    const chapterText = JSON.stringify(chapterLessons.map((lesson) => getLessonContent(lesson)))
    expect(chapterText).toContain('普通业务系统不直接连接数仓')
    expect(chapterText).toContain('API 不等于实时数据')
    expect(chapterText).toContain('deposit_balance_20260930.flag')
    expect(chapterText).toContain('12000000000')
  })

  it('首尾课程不会产生越界导航', () => {
    expect(getAdjacentLessons(lessons, lessons[0].slug).previous).toBeUndefined()
    expect(getAdjacentLessons(lessons, lessons[lessons.length - 1].slug).next).toBeUndefined()
  })
})
