import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import { getAdjacentLessons, sortLessons } from '../src/utils/lesson'

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

  it('数据建模导入课不再使用课程骨架', () => {
    const lesson = getLessonBySlug('data-modeling')

    expect(lesson).toBeDefined()
    expect(getLessonContent(lesson!)).toMatchObject({
      concept: { term: 'Grain（粒度）' },
      visualization: { kind: 'modeling-intro' },
    })
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
