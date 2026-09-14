import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import {
  getAdjacentLessons,
  getLessonFromPath,
  isLearnIndexPath,
  sortLessons,
} from '../src/utils/lesson'

const reversedLessons = [...lessons].reverse()

describe('课程数据与导航', () => {
  it('按 order 稳定排序课程', () => {
    const ordered = sortLessons(reversedLessons)

    expect(ordered.map((lesson) => lesson.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ])
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
      order: 6,
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
    expect(getLessonBySlug('data-lineage')).toMatchObject({ order: 10, chapter: '08' })
  })

  it('首尾课程不会产生越界导航', () => {
    expect(getAdjacentLessons(lessons, lessons[0].slug).previous).toBeUndefined()
    expect(getAdjacentLessons(lessons, lessons[lessons.length - 1].slug).next).toBeUndefined()
  })
})
