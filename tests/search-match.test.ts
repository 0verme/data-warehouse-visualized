import { describe, expect, it, vi } from 'vitest'
import { lessonContentBySlug } from '../src/content/lessons'
import { lessons } from '../src/data/course'
import { buildSearchIndex } from '../src/features/search/build-index'
import { getSearchDocumentHref, getSearchIndexUrl } from '../src/features/search/deep-link'
import { searchKnowledge } from '../src/features/search/match'
import type {
  SearchDoc,
  SearchDocKind,
  SearchIndex,
  SearchLesson,
} from '../src/features/search/types'

/**
 * Matching / ranking contract (#148 P1-B).
 *
 * The Issue freezes one rule: structured knowledge wins. Lesson title > section
 * heading > tags / metadata > body text — with deterministic ordering so the
 * acceptance samples can be pinned as regression assertions.
 */

const REAL_INDEX = buildSearchIndex(lessons, lessonContentBySlug)

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

function makeIndex(lessonsInput: SearchLesson[], docs: SearchDoc[]): SearchIndex {
  return { version: 1, lessons: lessonsInput, docs }
}

function slugsOf(query: string): string[] {
  return searchKnowledge(REAL_INDEX, query).hits.map((hit) => hit.slug)
}

describe('搜索匹配与排序（#148 P1-B）', () => {
  it('排序层级 lesson title > heading > tags/meta > body，不可倒置', () => {
    const index = makeIndex(
      [
        makeLesson({ id: 'a', title: 'needle 在课程标题' }),
        makeLesson({ id: 'b', title: '无关标题' }),
        makeLesson({ id: 'c', title: '无关标题', tags: ['needle'] }),
        makeLesson({ id: 'd', title: '无关标题' }),
      ],
      [
        makeDoc({ id: 'a:lesson:-1', lessonId: 'a', kind: 'lesson', anchor: 'a-title' }),
        makeDoc({
          id: 'b:narrative:0',
          lessonId: 'b',
          kind: 'narrative',
          heading: 'needle 小节',
          anchor: 'b-section-0-title',
        }),
        makeDoc({ id: 'c:lesson:-1', lessonId: 'c', kind: 'lesson', anchor: 'c-title' }),
        makeDoc({
          id: 'd:narrative:0',
          lessonId: 'd',
          kind: 'narrative',
          text: '正文包含 needle 一次',
          anchor: 'd-section-0-title',
        }),
      ],
    )

    const hits = searchKnowledge(index, 'needle').hits

    expect(hits.map((hit) => hit.lessonId)).toEqual(['a', 'b', 'c', 'd'])
    expect(hits.map((hit) => hit.tier)).toEqual([4, 3, 2, 1])
    expect(hits.map((hit) => hit.matchedFields)).toEqual([
      ['title'],
      ['heading'],
      ['tags'],
      ['body'],
    ])
  })

  it('正文命中次数被压缩，饱和后不会超过 metadata 层', () => {
    const index = makeIndex(
      [makeLesson({ id: 'meta', title: '无关', tags: ['needle'] }), makeLesson({ id: 'body' })],
      [
        makeDoc({ id: 'meta:lesson:-1', lessonId: 'meta', kind: 'lesson', anchor: 'meta-title' }),
        makeDoc({
          id: 'body:narrative:0',
          lessonId: 'body',
          kind: 'narrative',
          text: 'needle '.repeat(9).trim(),
          anchor: 'body-section-0-title',
        }),
      ],
    )

    const hits = searchKnowledge(index, 'needle').hits
    const bodyHit = hits.find((hit) => hit.lessonId === 'body')

    expect(hits.map((hit) => hit.lessonId)).toEqual(['meta', 'body'])
    expect(bodyHit?.tier).toBe(1)
    // 8 × min(3, 9) + 位置加分 = 29，而不是线性累加 72
    expect(bodyHit?.score).toBe(29)
  })

  it('整串命中有加分，位置加分只作用于命中开头附近', () => {
    const index = makeIndex(
      [makeLesson({ id: 'exact' }), makeLesson({ id: 'late' })],
      [
        makeDoc({
          id: 'exact:narrative:0',
          lessonId: 'exact',
          kind: 'narrative',
          heading: 'needle',
          anchor: 'exact-section-0-title',
        }),
        makeDoc({
          id: 'late:narrative:0',
          lessonId: 'late',
          kind: 'narrative',
          heading: `${'前缀'.repeat(12)}needle`,
          anchor: 'late-section-0-title',
        }),
      ],
    )

    const hits = searchKnowledge(index, 'needle').hits

    expect(hits.map((hit) => hit.lessonId)).toEqual(['exact', 'late'])
    expect(hits[0].score).toBe(40 + 15 + 5)
    expect(hits[1].score).toBe(40)
  })

  it('多个查询词是 AND 语义，每个词都必须命中', () => {
    const index = makeIndex(
      [makeLesson({ id: 'both' }), makeLesson({ id: 'partial' })],
      [
        makeDoc({
          id: 'both:narrative:0',
          lessonId: 'both',
          kind: 'narrative',
          text: '同时包含 needle 和 thread',
          anchor: 'both-section-0-title',
        }),
        makeDoc({
          id: 'partial:narrative:0',
          lessonId: 'partial',
          kind: 'narrative',
          text: '只包含 needle',
          anchor: 'partial-section-0-title',
        }),
      ],
    )

    expect(searchKnowledge(index, 'needle thread').hits.map((hit) => hit.lessonId)).toEqual([
      'both',
    ])
    expect(searchKnowledge(index, 'needle missing').hits).toEqual([])
  })

  it('同分结果稳定：按章节 → 课序 → section index → kind → id 收敛', () => {
    const index = makeIndex(
      [
        makeLesson({ id: 'later', chapterId: '1', order: 200 }),
        makeLesson({ id: 'earlier', chapterId: '1', order: 100 }),
        makeLesson({ id: 'chapter-2', chapterId: '2', order: 100 }),
      ],
      [
        makeDoc({
          id: 'later:narrative:0',
          lessonId: 'later',
          kind: 'narrative',
          heading: 'needle 小节',
          anchor: 'later-section-0-title',
        }),
        makeDoc({
          id: 'earlier:narrative:3',
          lessonId: 'earlier',
          kind: 'narrative',
          heading: 'needle 小节',
          anchor: 'earlier-section-3-title',
        }),
        makeDoc({
          id: 'earlier:narrative:1',
          lessonId: 'earlier',
          kind: 'narrative',
          heading: 'needle 小节',
          anchor: 'earlier-section-1-title',
        }),
        makeDoc({
          id: 'chapter-2:narrative:0',
          lessonId: 'chapter-2',
          kind: 'narrative',
          heading: 'needle 小节',
          anchor: 'chapter-2-section-0-title',
        }),
      ],
    )

    const first = searchKnowledge(index, 'needle').hits.map((hit) => hit.docId)
    const second = searchKnowledge(index, 'needle').hits.map((hit) => hit.docId)

    expect(first).toEqual([
      'earlier:narrative:1',
      'earlier:narrative:3',
      'later:narrative:0',
      'chapter-2:narrative:0',
    ])
    expect(second).toEqual(first)
  })

  it('总量上限 8、单课上限 2，超出部分被截断', () => {
    const manyLessons = Array.from({ length: 12 }, (_, index) =>
      makeLesson({ id: `lesson-${index}`, title: `needle ${index}`, order: index }),
    )
    const manyDocs = manyLessons.map((lesson) =>
      makeDoc({ id: `${lesson.id}:lesson:-1`, lessonId: lesson.id, kind: 'lesson' }),
    )
    const floodLesson = makeLesson({ id: 'flood', title: '无关' })
    const floodDocs = Array.from({ length: 5 }, (_, index) =>
      makeDoc({
        id: `flood:narrative:${index}`,
        lessonId: 'flood',
        kind: 'narrative',
        heading: `needle 小节 ${index}`,
        anchor: `flood-section-${index}-title`,
      }),
    )

    const hits = searchKnowledge(
      makeIndex([...manyLessons, floodLesson], [...manyDocs, ...floodDocs]),
      'needle',
    ).hits
    const perLesson = new Map<string, number>()

    for (const hit of hits) {
      perLesson.set(hit.lessonId, (perLesson.get(hit.lessonId) ?? 0) + 1)
    }

    expect(hits).toHaveLength(8)
    expect(Math.max(...perLesson.values())).toBeLessThanOrEqual(2)
    expect(searchKnowledge(REAL_INDEX, '数据', { limit: 3 }).hits).toHaveLength(3)
  })

  it('空查询 / 纯标点不返回结果，且不把全部文档列出来', () => {
    for (const query of ['', '   ', '。。。！']) {
      const result = searchKnowledge(REAL_INDEX, query)

      expect(result.terms).toEqual([])
      expect(result.hits).toEqual([])
    }
  })
})

describe('验收查询（真实语料，#148 P1-B）', () => {
  it('拉链表：课程标题命中排第一，并可跳到小节', () => {
    const hits = searchKnowledge(REAL_INDEX, '拉链表').hits

    expect(hits.map((hit) => [hit.tier, hit.slug, hit.kind, hit.anchor])).toEqual([
      [4, 'slowly-changing-dimension', 'lesson', 'lesson-scd-type-2-title'],
      [3, 'slowly-changing-dimension', 'concept', 'lesson-scd-type-2-concept-title'],
    ])
    expect(hits[0].href).toBe('/learn/slowly-changing-dimension/#lesson-scd-type-2-title')
  })

  it('幂等：scheduling-rerun 排第一，命中跨 3 节课', () => {
    const hits = searchKnowledge(REAL_INDEX, '幂等').hits

    expect(hits[0].slug).toBe('scheduling-rerun')
    expect(new Set(hits.map((hit) => hit.slug))).toEqual(
      new Set(['scheduling-rerun', 'performance-tradeoffs', 'lifecycle-path-failure']),
    )
  })

  it('数据倾斜：只命中 tag，snippet 回退到 lesson summary 且无高亮残片', () => {
    const hits = searchKnowledge(REAL_INDEX, '数据倾斜').hits

    expect(hits).toHaveLength(1)
    expect(hits[0].slug).toBe('performance-shuffle-skew')
    expect(hits[0].kind).toBe('lesson')
    expect(hits[0].tier).toBe(2)
    expect(hits[0].matchedFields).toEqual(['tags'])
    expect(hits[0].anchor).toBe('lesson-11-shuffle-skew-title')

    const lesson = lessons.find((item) => item.slug === 'performance-shuffle-skew')!
    expect(hits[0].snippet.source).toBe('summary')
    expect(hits[0].snippet.text).toBe(lesson.summary)
    expect(hits[0].snippet.segments.every((segment) => !segment.match)).toBe(true)
  })

  it('first_seen：作为 tag 命中 lesson，正文小节可跳转', () => {
    const hits = searchKnowledge(REAL_INDEX, 'first_seen').hits

    expect(hits[0].slug).toBe('performance-first-seen')
    expect(hits.some((hit) => hit.slug === 'performance-tradeoffs')).toBe(true)
    expect(hits.some((hit) => hit.matchedFields.includes('body'))).toBe(true)
  })

  it('第一次交易：命中 performance-first-seen；首次交易明确不命中（Phase 1 无同义词表）', () => {
    expect(slugsOf('第一次交易')[0]).toBe('performance-first-seen')
    expect(slugsOf('首次交易')).toEqual([])
  })

  it('血缘：跨章节命中，单课不超过 2 条', () => {
    const hits = searchKnowledge(REAL_INDEX, '血缘').hits
    const perLesson = new Map<string, number>()

    for (const hit of hits) {
      perLesson.set(hit.lessonId, (perLesson.get(hit.lessonId) ?? 0) + 1)
    }

    expect(hits.length).toBeGreaterThan(3)
    expect(new Set(hits.map((hit) => hit.slug)).size).toBeGreaterThan(3)
    expect(Math.max(...perLesson.values())).toBeLessThanOrEqual(2)
  })

  it('FTP / flag：命中文件接口与调度就绪相关课程', () => {
    expect(new Set(slugsOf('FTP'))).toEqual(new Set(['scheduling-readiness', 'data-service-file']))

    const flagHits = searchKnowledge(REAL_INDEX, 'flag').hits

    expect(flagHits[0].slug).toBe('data-service-file')
    expect(flagHits.some((hit) => hit.slug === 'data-service-choice')).toBe(true)
    expect(flagHits.some((hit) => hit.slug === 'build-a-warehouse')).toBe(true)
  })

  it('SCD：缩写命中拉链表课程', () => {
    expect(slugsOf('SCD')).toContain('slowly-changing-dimension')
  })

  it('大小写 / 分隔符等价写法得到相同结果', () => {
    const firstSeenVariants = ['first_seen', 'first seen', 'first-seen', 'FIRST_SEEN']
    const firstSeenTop = firstSeenVariants.map(
      (query) => searchKnowledge(REAL_INDEX, query).hits[0].slug,
    )

    expect(new Set(firstSeenTop)).toEqual(new Set(['performance-first-seen']))

    const etlVariants = ['ETL / ELT', 'etl/elt', 'ETL/ELT']
    const etlResults = etlVariants.map((query) =>
      searchKnowledge(REAL_INDEX, query).hits.map((hit) => hit.slug),
    )

    expect(etlResults[1]).toEqual(etlResults[0])
    expect(etlResults[2]).toEqual(etlResults[0])
    expect(etlResults[0]).toContain('warehouse-terms')
  })

  it('语料未覆盖的词返回空结果（Phase 1 已知行为，不用同义词补丁掩盖）', () => {
    for (const query of ['宽表', '索引', '背压', '不存在词xyz']) {
      expect(searchKnowledge(REAL_INDEX, query).hits).toEqual([])
    }
  })
})

describe('搜索深链与 BASE_PATH（#148 P1-B）', () => {
  it('section 命中带 fragment，lesson 命中带 lesson anchor，无 anchor 时只跳课程', () => {
    const flagHits = searchKnowledge(REAL_INDEX, 'flag').hits
    const summaryHit = flagHits.find((hit) => hit.kind === 'summary')

    expect(flagHits[0].href).toBe(
      '/learn/data-service-file/#lesson-data-service-file-section-1-title',
    )
    expect(summaryHit?.anchor).toBeNull()
    expect(summaryHit?.href).toBe('/learn/data-service-choice/')
  })

  it('BASE_PATH 下索引地址与深链都走 getRoute()', () => {
    expect(getSearchIndexUrl()).toBe('/search-index.json')
    expect(getSearchDocumentHref({ slug: 'grain', anchor: 'grain-title' })).toBe(
      '/learn/grain/#grain-title',
    )

    vi.stubEnv('BASE_URL', '/x/')

    try {
      expect(getSearchIndexUrl()).toBe('/x/search-index.json')
      expect(getSearchDocumentHref({ slug: 'grain', anchor: 'grain-title' })).toBe(
        '/x/learn/grain/#grain-title',
      )
      expect(getSearchDocumentHref({ slug: 'grain', anchor: null })).toBe('/x/learn/grain/')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
