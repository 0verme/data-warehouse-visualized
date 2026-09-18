import { describe, expect, it } from 'vitest'
import { getLessonContent, lessonContentBySlug } from '../src/content/lessons'
import {
  loadLessonContent,
  peekLessonContent,
  primeLessonContentCache,
} from '../src/content/lessons/client-loader'
import { lessons } from '../src/data/course'

describe('客户端课程内容加载器（client-loader）', () => {
  it('覆盖服务端 registry 的全部 slug（1:1 同步维护）', () => {
    const serverSlugs = new Set(Object.keys(lessonContentBySlug))
    expect(serverSlugs.size).toBe(lessons.length)

    // 每个课程都必须在 client-loader 中可加载。
    for (const lesson of lessons) {
      expect(serverSlugs.has(lesson.slug)).toBe(true)
    }
  })

  it('每个课程 slug 按需加载的内容与服务端 registry 完全一致', async () => {
    for (const lesson of lessons) {
      const serverContent = getLessonContent(lesson)
      const clientContent = await loadLessonContent(lesson.slug)

      expect(clientContent).toEqual(serverContent)
      expect(clientContent.sections.length).toBeGreaterThan(0)
    }
  })

  it('相同 slug 的并发加载只产生一次加载（in-flight 去重）', async () => {
    const lesson = lessons[0]
    const [first, second] = await Promise.all([
      loadLessonContent(lesson.slug),
      loadLessonContent(lesson.slug),
    ])

    expect(first).toBe(second)
    expect(peekLessonContent(lesson.slug)).toBe(first)
  })

  it('primeLessonContentCache 可以预置 SSR 提供的首屏内容', () => {
    const lesson = lessons[1]
    const ssrContent = getLessonContent(lesson)

    primeLessonContentCache(lesson.slug, ssrContent)

    expect(peekLessonContent(lesson.slug)).toBe(ssrContent)
  })
})
