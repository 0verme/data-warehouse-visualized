import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE } from '../src/i18n/locale'
import { getMessage } from '../src/i18n/messages'
import {
  chapterDefinitions,
  getChapterTitle,
  getChapters,
  getLessonBySlug,
  getLessons,
  lessonDefinitions,
  lessons,
} from '../src/data/course'

describe('轻量 i18n API', () => {
  it('默认 locale 返回原有中文课程展示文本', () => {
    const lesson = getLessonBySlug('why-data-warehouse')

    expect(lesson).toMatchObject({
      title: '为什么有业务系统，还需要数据仓库？',
      summary: '用核心系统与信贷系统的存贷比案例，理解跨系统经营分析为什么需要数据仓库。',
      tags: ['跨系统分析', '数据仓库', '存贷比'],
      order: 100,
      slug: 'why-data-warehouse',
    })
    expect(lesson?.id).toBe('lesson-01')
  })

  it('保留课程顺序、slug 和章节分组', () => {
    expect(getLessons(DEFAULT_LOCALE).map((lesson) => lesson.slug)).toEqual(
      lessons.map((lesson) => lesson.slug),
    )
    expect(getChapters(DEFAULT_LOCALE)[1]).toMatchObject({
      id: '02',
      title: '数据建模',
      lessons: [
        expect.objectContaining({ slug: 'data-modeling', title: '业务过程：到底要记录哪件事？' }),
        expect.objectContaining({ slug: 'grain', title: 'Grain：一行究竟代表什么？' }),
        expect.objectContaining({
          slug: 'star-schema-and-grain',
          title: '事实、维度与星型模型',
        }),
        expect.objectContaining({ slug: 'fact-table-types', title: '事实表不只有一种' }),
        expect.objectContaining({
          slug: 'slowly-changing-dimension',
          title: '维度为什么要保存历史？——拉链表',
        }),
      ],
    })
    expect(getChapterTitle('02')).toBe('数据建模')
  })

  it('没有对应翻译时回退到 zh-CN，且稳定 identity 不变', () => {
    const lesson = getLessonBySlug('why-data-warehouse', 'en')

    expect(lesson).toMatchObject({
      id: 'lesson-01',
      slug: 'why-data-warehouse',
      title: '为什么有业务系统，还需要数据仓库？',
    })
  })

  it('课程结构定义不携带展示文案，公共 UI message 默认返回中文', () => {
    expect(lessonDefinitions[0]).not.toHaveProperty('title')
    expect(chapterDefinitions[0]).not.toHaveProperty('title')
    expect(getMessage('previousLesson')).toBe('上一节')
    expect(getMessage('markAsLearned', DEFAULT_LOCALE)).toBe('标记为已学会')
  })
})
