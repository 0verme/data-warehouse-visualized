import { describe, expect, it } from 'vitest'
import { lessons } from '../src/data/course'
import { getAdjacentLessons, sortLessons } from '../src/utils/lesson'

const reversedLessons = [...lessons].reverse()

describe('课程数据与导航', () => {
  it('按 order 稳定排序课程', () => {
    const ordered = sortLessons(reversedLessons)

    expect(ordered.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('返回当前课程的上一节和下一节', () => {
    const adjacent = getAdjacentLessons(lessons, 'warehouse-layers')

    expect(adjacent.previous?.slug).toBe('why-data-warehouse')
    expect(adjacent.next?.slug).toBe('data-modeling')
  })

  it('首尾课程不会产生越界导航', () => {
    expect(getAdjacentLessons(lessons, lessons[0].slug).previous).toBeUndefined()
    expect(getAdjacentLessons(lessons, lessons[lessons.length - 1].slug).next).toBeUndefined()
  })
})
