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
    expect(ordered.slice(2, 7).map((lesson) => `${lesson.chapter}:${lesson.order}`)).toEqual([
      '03:100',
      '03:200',
      '03:300',
      '03:400',
      '03:500',
    ])
  })

  it('从当前章节排序动态计算课程展示编号', () => {
    expect(getChapterDisplayNumber('01')).toBe('01')
    expect(getChapterDisplayNumber('10')).toBe('10')
    expect(getLessonDisplayNumber(getLessonBySlug('why-data-warehouse')!, lessons)).toBe('1-1')
    expect(getLessonDisplayNumber(getLessonBySlug('warehouse-layers')!, lessons)).toBe('2-1')
    expect(getLessonDisplayNumber(getLessonBySlug('data-modeling')!, lessons)).toBe('3-1')
    expect(getLessonDisplayNumber(getLessonBySlug('grain')!, lessons)).toBe('3-2')
    expect(getLessonDisplayNumber(getLessonBySlug('star-schema-and-grain')!, lessons)).toBe('3-3')
    expect(getLessonDisplayNumber(getLessonBySlug('fact-table-types')!, lessons)).toBe('3-4')
    expect(getLessonDisplayNumber(getLessonBySlug('slowly-changing-dimension')!, lessons)).toBe(
      '3-5',
    )
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

  it('第六章已注册时间轴驱动的调度实验', () => {
    const lesson = getLessonBySlug('scheduling-system')!
    const content = getLessonContent(lesson)

    expect(lesson.demo).toBe('scheduler')
    expect(content.eyebrow).toBe('第 06 课 · 时间轴驱动 DAG Run')
    expect(
      content.sections.some(
        (section) => section.kind === 'visualization' && section.visualization.kind === 'scheduler',
      ),
    ).toBe(true)
    expect(content.visualization).toBeUndefined()
  })

  it('第七章稳定注册为 7-1 到 7-5，并保留 data-quality slug', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '07')

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'data-quality',
      'data-quality-rules',
      'data-quality-dataset',
      'data-quality-evidence',
      'data-quality-release',
    ])
    expect(chapterLessons.map((lesson) => getLessonDisplayNumber(lesson, lessons))).toEqual([
      '7-1',
      '7-2',
      '7-3',
      '7-4',
      '7-5',
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
    expect(adjacent.next?.slug).toBe('data-modeling')
  })

  it('第三章按业务过程、Grain、星型模型、事实表类型、拉链表连成五节课程', () => {
    expect(lessons.slice(2, 7).map((lesson) => lesson.slug)).toEqual([
      'data-modeling',
      'grain',
      'star-schema-and-grain',
      'fact-table-types',
      'slowly-changing-dimension',
    ])
    expect(lessons.slice(2, 7).map((lesson) => lesson.title)).toEqual([
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
      previous: expect.objectContaining({ slug: 'warehouse-layers' }),
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
    expect(getLessonChapterId(lessons, 'lesson-scd-type-2')).toBe('03')
    expect(getLessonChapterId(lessons, 'lesson-04')).toBe('04')

    let expandedChapterId: string | null = '03'
    expandedChapterId = toggleExpandedChapter(expandedChapterId, '04')
    expect(expandedChapterId).toBe('04')

    expandedChapterId = toggleExpandedChapter(expandedChapterId, '04')
    expect(expandedChapterId).toBeNull()
  })

  it('3-1 只从贷款业务过程开始，不提前使用后续模型概念', () => {
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
    const visualizationKinds = lessons.slice(2, 7).map((lesson) => {
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

  it('第 04 章按存款余额口径、定义、时间和派生连成四节课程', () => {
    expect(lessons.slice(7, 11).map((lesson) => lesson.slug)).toEqual([
      'metric-system',
      'deposit-metric-definition',
      'deposit-metric-time',
      'deposit-metric-derivations',
    ])
    expect(lessons.slice(7, 11).map((lesson) => lesson.title)).toEqual([
      '同一个“存款余额”，为什么会有不同答案？',
      '一个指标到底由什么组成？',
      '“截至某天”和“一段时间”有什么区别？',
      '一个“存款余额”为什么能派生出这么多指标？',
    ])
    expect(lessons.slice(7, 11).map((lesson) => lesson.demo)).toEqual([
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

  it('数据血缘顺序调整到第十课', () => {
    expect(getLessonBySlug('data-lineage')).toMatchObject({ order: 100, chapter: '08' })
  })

  it('首尾课程不会产生越界导航', () => {
    expect(getAdjacentLessons(lessons, lessons[0].slug).previous).toBeUndefined()
    expect(getAdjacentLessons(lessons, lessons[lessons.length - 1].slug).next).toBeUndefined()
  })
})
