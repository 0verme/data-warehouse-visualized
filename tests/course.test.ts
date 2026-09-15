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
    expect(ordered.slice(2, 5).map((lesson) => `${lesson.chapter}:${lesson.order}`)).toEqual([
      '03:100',
      '03:200',
      '03:300',
    ])
  })

  it('从当前章节排序动态计算课程展示编号', () => {
    expect(getChapterDisplayNumber('01')).toBe('01')
    expect(getChapterDisplayNumber('10')).toBe('10')
    expect(getLessonDisplayNumber(getLessonBySlug('why-data-warehouse')!, lessons)).toBe('1-1')
    expect(getLessonDisplayNumber(getLessonBySlug('warehouse-layers')!, lessons)).toBe('2-1')
    expect(getLessonDisplayNumber(getLessonBySlug('data-modeling')!, lessons)).toBe('3-1')
    expect(getLessonDisplayNumber(getLessonBySlug('star-schema-and-grain')!, lessons)).toBe('3-2')
    expect(getLessonDisplayNumber(getLessonBySlug('slowly-changing-dimension')!, lessons)).toBe(
      '3-3',
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

  it('返回当前课程的上一节和下一节', () => {
    const adjacent = getAdjacentLessons(lessons, 'warehouse-layers')

    expect(adjacent.previous?.slug).toBe('why-data-warehouse')
    expect(adjacent.next?.slug).toBe('data-modeling')
  })

  it('第三章按建模导入、星型模型、SCD2 连成连续课程', () => {
    expect(lessons.slice(2, 5).map((lesson) => lesson.slug)).toEqual([
      'data-modeling',
      'star-schema-and-grain',
      'slowly-changing-dimension',
    ])
    expect(getLessonBySlug('data-modeling')?.demo).toBe('modeling-intro')
    expect(getLessonBySlug('slowly-changing-dimension')?.demo).toBe('scd')

    expect(getAdjacentLessons(lessons, 'data-modeling')).toEqual({
      previous: expect.objectContaining({ slug: 'warehouse-layers' }),
      next: expect.objectContaining({ slug: 'star-schema-and-grain' }),
    })
    expect(getAdjacentLessons(lessons, 'star-schema-and-grain')).toEqual({
      previous: expect.objectContaining({ slug: 'data-modeling' }),
      next: expect.objectContaining({ slug: 'slowly-changing-dimension' }),
    })
    expect(getAdjacentLessons(lessons, 'slowly-changing-dimension')).toEqual({
      previous: expect.objectContaining({ slug: 'star-schema-and-grain' }),
      next: expect.objectContaining({ slug: 'metric-system' }),
    })
  })

  it('ClientRouter 按 URL 逐节推进建模课程链路', () => {
    const expectedSlugs = [
      'data-modeling',
      'star-schema-and-grain',
      'slowly-changing-dimension',
      'metric-system',
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
    expect(getAdjacentLessons(lessons, current!.slug).previous?.slug).toBe('star-schema-and-grain')
    expect(
      getAdjacentLessons(lessons, getAdjacentLessons(lessons, current!.slug).previous!.slug)
        .previous?.slug,
    ).toBe('data-modeling')
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

  it('数据建模导入课不再使用课程骨架', () => {
    const lesson = getLessonBySlug('data-modeling')

    expect(lesson).toBeDefined()
    const content = getLessonContent(lesson!)

    expect(content.concept.term).toBe('Grain（粒度）')
    expect(
      content.sections.some(
        (section) =>
          section.kind === 'visualization' && section.visualization.kind === 'modeling-intro',
      ),
    ).toBe(true)
    expect(content.visualization).toBeUndefined()
    expect(content.engineeringTip).toBeUndefined()
    expect(content.pitfalls).toBeUndefined()
  })

  it('星型模型与 SCD 课程使用不同的语义 sections', () => {
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
      'sql',
      'engineering-note',
      'takeaway',
      'pitfall',
    ])
    expect(starSchema.visualization).toBeUndefined()
    expect(scd.visualization).toBeUndefined()
    expect(scd.comparison).toBeUndefined()
    expect(scd.code).toBeUndefined()
    expect(scd.engineeringTip).toBeUndefined()
    expect(scd.pitfalls).toBeUndefined()
  })

  it('指标体系已升级为正式交互课程并连接 SQL 章节', () => {
    expect(getLessonBySlug('metric-system')).toMatchObject({
      title: '指标体系：同一个数字为什么不一样？',
      order: 100,
      chapter: '04',
      demo: 'metric-definition',
    })
    expect(getLessonContent(getLessonBySlug('metric-system')!)).toMatchObject({
      visualization: { kind: 'metric-definition' },
      opening: { title: '昨天 GMV 到底是多少？' },
    })
    expect(getAdjacentLessons(lessons, 'metric-system')).toEqual({
      previous: expect.objectContaining({ slug: 'slowly-changing-dimension' }),
      next: expect.objectContaining({ slug: 'sql-and-transformation' }),
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
