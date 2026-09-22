import { describe, expect, it } from 'vitest'
import { buildSearchSnippet } from '../src/features/search/match'
import { tokenizeSearchQuery } from '../src/features/search/normalize'
import type { SearchDoc, SearchDocKind, SearchLesson } from '../src/features/search/types'

/**
 * Snippet contract (#148 P1-B).
 *
 * P1-C renders `segments` as React text nodes, so the snippet must expose
 * marked runs without any HTML: window ±12/60 normalized characters, `…` on
 * truncated sides, at most 3 highlights, and a lesson-summary fallback when the
 * hit was in a heading or in metadata (a tag, for example `数据倾斜`).
 */

function makeLesson(overrides: Partial<SearchLesson> & { id: string }): SearchLesson {
  return {
    id: overrides.id,
    slug: overrides.slug ?? overrides.id,
    title: overrides.title ?? '',
    subtitle: overrides.subtitle ?? '',
    summary: overrides.summary ?? '',
    tags: overrides.tags ?? [],
    chapterId: overrides.chapterId ?? '1',
    chapterTitle: overrides.chapterTitle ?? '第 01 章 · 测试',
    number: overrides.number ?? '1-1',
    order: overrides.order ?? 100,
  }
}

function makeDoc(
  overrides: Partial<SearchDoc> & { id: string; lessonId: string; kind: SearchDocKind },
): SearchDoc {
  return {
    slug: overrides.lessonId,
    heading: '',
    text: '',
    anchor: null,
    sectionIndex: -1,
    ...overrides,
  }
}

function markedTexts(snippet: ReturnType<typeof buildSearchSnippet>): string[] {
  return snippet.segments.filter((segment) => segment.match).map((segment) => segment.text)
}

describe('搜索片段（#148 P1-B）', () => {
  it('以首次命中为中心取 12 / 60 字符，截断侧加省略号', () => {
    const lesson = makeLesson({
      id: 'demo',
      summary: `${'前'.repeat(30)}needle${'后'.repeat(80)}`,
    })
    const doc = makeDoc({ id: 'demo:lesson:-1', lessonId: 'demo', kind: 'lesson' })
    const snippet = buildSearchSnippet(doc, lesson, tokenizeSearchQuery('needle'))

    expect(snippet.source).toBe('summary')
    expect(snippet.text.startsWith('…')).toBe(true)
    expect(snippet.text.endsWith('…')).toBe(true)
    expect(snippet.text).toHaveLength(1 + (12 + 'needle'.length + 60) + 1)
    expect(snippet.text.indexOf('needle')).toBe(1 + 12)
    expect(markedTexts(snippet)).toEqual(['needle'])
  })

  it('保留原文大小写与标点，只对命中区间打标', () => {
    const lesson = makeLesson({ id: 'demo' })
    const doc = makeDoc({
      id: 'demo:narrative:0',
      lessonId: 'demo',
      kind: 'narrative',
      text: 'A_b 拉链表（测试）',
    })
    const snippet = buildSearchSnippet(doc, lesson, tokenizeSearchQuery('拉链表'))

    expect(snippet.text).toBe('A_b 拉链表（测试）')
    expect(snippet.segments).toEqual([
      { text: 'A_b ', match: false },
      { text: '拉链表', match: true },
      { text: '（测试）', match: false },
    ])
  })

  it('大小写不敏感命中同样高亮原文写法', () => {
    const lesson = makeLesson({ id: 'demo' })
    const doc = makeDoc({
      id: 'demo:narrative:0',
      lessonId: 'demo',
      kind: 'narrative',
      text: '状态表使用 First_Seen 字段记录首次出现。',
    })
    const snippet = buildSearchSnippet(doc, lesson, tokenizeSearchQuery('first_seen'))

    expect(markedTexts(snippet)).toEqual(['First_Seen'])
    expect(snippet.text.endsWith('。')).toBe(true)
  })

  it('一条结果最多 3 处高亮', () => {
    const lesson = makeLesson({ id: 'demo' })
    const doc = makeDoc({
      id: 'demo:narrative:0',
      lessonId: 'demo',
      kind: 'narrative',
      text: 'needle '.repeat(5).trim(),
    })
    const snippet = buildSearchSnippet(doc, lesson, tokenizeSearchQuery('needle'))

    expect(snippet.segments.filter((segment) => segment.match)).toHaveLength(3)
    expect(markedTexts(snippet)).toEqual(['needle', 'needle', 'needle'])
  })

  it('多词查询分别高亮', () => {
    const lesson = makeLesson({ id: 'demo' })
    const doc = makeDoc({
      id: 'demo:narrative:0',
      lessonId: 'demo',
      kind: 'narrative',
      text: '先理解 needle，再理解 thread。',
    })
    const snippet = buildSearchSnippet(doc, lesson, tokenizeSearchQuery('needle thread'))

    expect(markedTexts(snippet)).toEqual(['needle', 'thread'])
  })

  it('只在 heading 命中时回退到 lesson summary', () => {
    const lesson = makeLesson({ id: 'demo', summary: '课程摘要上下文。' })
    const doc = makeDoc({
      id: 'demo:narrative:0',
      lessonId: 'demo',
      kind: 'narrative',
      heading: 'needle 小节',
      text: '正文没有关键词。',
    })
    const snippet = buildSearchSnippet(doc, lesson, tokenizeSearchQuery('needle'))

    expect(snippet.source).toBe('summary')
    expect(snippet.text).toBe('课程摘要上下文。')
    expect(markedTexts(snippet)).toEqual([])
  })

  it('lesson 文档优先用包含命中的 summary / subtitle，tag-only 命中回退 summary', () => {
    const lesson = makeLesson({
      id: 'demo',
      summary: '摘要里没有这个词。',
      subtitle: '副标题包含 needle。',
      tags: ['needle'],
    })
    const doc = makeDoc({
      id: 'demo:lesson:-1',
      lessonId: 'demo',
      kind: 'lesson',
      anchor: 'demo-title',
    })

    expect(buildSearchSnippet(doc, lesson, tokenizeSearchQuery('needle')).text).toBe(
      '副标题包含 needle。',
    )

    const tagOnly = buildSearchSnippet(doc, lesson, tokenizeSearchQuery('其他标签'))
    expect(tagOnly.source).toBe('summary')
    expect(tagOnly.text).toBe('摘要里没有这个词。')
    expect(tagOnly.segments).toEqual([{ text: '摘要里没有这个词。', match: false }])
  })

  it('没有可用文本时返回空片段而不是抛异常', () => {
    const lesson = makeLesson({ id: 'demo' })
    const lessonDoc = makeDoc({ id: 'demo:lesson:-1', lessonId: 'demo', kind: 'lesson' })
    const narrativeDoc = makeDoc({ id: 'demo:narrative:0', lessonId: 'demo', kind: 'narrative' })

    expect(buildSearchSnippet(lessonDoc, lesson, ['needle'])).toEqual({
      text: '',
      segments: [],
      source: 'summary',
    })
    expect(buildSearchSnippet(narrativeDoc, lesson, ['needle'])).toEqual({
      text: '',
      segments: [],
      source: 'body',
    })
  })
})
