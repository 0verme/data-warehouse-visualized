import { brotliCompressSync, gzipSync } from 'node:zlib'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LessonContent } from '../src/components/lesson/LessonContent'
import { LessonHeader } from '../src/components/lesson/LessonHeader'
import { lessonContentBySlug } from '../src/content/lessons'
import { getChapterTitle, lessons } from '../src/data/course'
import { buildSearchIndex, serializeSearchIndex } from '../src/features/search/build-index'
import { searchKnowledge } from '../src/features/search/match'
import { SEARCH_INDEX_VERSION, type SearchDocKind } from '../src/features/search/types'
import { getLessonDisplayNumber } from '../src/utils/lesson'

/**
 * Search index contract (#148 P1-B).
 *
 * The index is derived from the existing single source of truth and must stay
 * deterministic; anchors must be the exact ids the renderer emits (P1-A
 * heading identity), otherwise a result would deep-link into nothing.
 */

const ANCHORED_KINDS: SearchDocKind[] = [
  'lesson',
  'opening',
  'concept',
  'narrative',
  'compare',
  'sql',
  'visualization',
  'takeaway',
]

const ANCHORLESS_KINDS: SearchDocKind[] = ['summary', 'pitfall', 'engineering-note']

const REAL_QUERIES = [
  '拉链表',
  '幂等',
  '数据倾斜',
  'first_seen',
  '第一次交易',
  '血缘',
  'FTP',
  'flag',
]

function extractIds(markup: string): string[] {
  return [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
}

function buildRealIndex() {
  return buildSearchIndex(lessons, lessonContentBySlug)
}

describe('搜索索引构建（#148 P1-B）', () => {
  it('从课程元数据与类型化正文派生全部文档，不维护第二份元数据', () => {
    const index = buildRealIndex()

    expect(index.version).toBe(SEARCH_INDEX_VERSION)
    expect(index.lessons).toHaveLength(lessons.length)
    expect(index.docs.length).toBeGreaterThan(0)

    // 每节课恰好一个 lesson 文档；lesson 元数据与 course.ts 完全一致。
    for (const searchLesson of index.lessons) {
      const lesson = lessons.find((item) => item.id === searchLesson.id)
      expect(lesson, `unknown lesson ${searchLesson.id}`).toBeTruthy()

      const lessonDocs = index.docs.filter(
        (doc) => doc.lessonId === searchLesson.id && doc.kind === 'lesson',
      )
      expect(lessonDocs, `lesson doc count for ${searchLesson.slug}`).toHaveLength(1)

      expect(searchLesson.slug).toBe(lesson!.slug)
      expect(searchLesson.title).toBe(lesson!.title)
      expect(searchLesson.summary).toBe(lesson!.summary)
      expect(searchLesson.tags).toEqual(lesson!.tags)
      expect(searchLesson.subtitle).toBe(lessonContentBySlug[lesson!.slug].subtitle)
      expect(searchLesson.chapterId).toBe(lesson!.chapter)
      expect(searchLesson.chapterTitle).toBe(getChapterTitle(lesson!.chapter))
      expect(searchLesson.number).toBe(getLessonDisplayNumber(lesson!, lessons))
      expect(searchLesson.order).toBe(lesson!.order)
    }
  })

  it('每节课的文档数 = 元数据 + 头部块 + sections + legacy 教学块', () => {
    const index = buildRealIndex()

    for (const lesson of lessons) {
      const content = lessonContentBySlug[lesson.slug]
      const docs = index.docs.filter((doc) => doc.lessonId === lesson.id)
      const expected =
        3 + // lesson / summary / concept
        (content.opening ? 1 : 0) +
        content.sections.length +
        (content.code ? 1 : 0) +
        (content.engineeringTip ? 1 : 0) +
        (content.pitfalls && content.pitfalls.length > 0 ? 1 : 0)

      expect(docs.length, `doc count for ${lesson.slug}`).toBe(expected)
    }
  })

  it('文档 id 全局唯一，sectionIndex 只用于定位', () => {
    const index = buildRealIndex()
    const ids = index.docs.map((doc) => doc.id)

    expect(new Set(ids).size).toBe(ids.length)

    for (const doc of index.docs) {
      expect(doc.sectionIndex).toBeGreaterThanOrEqual(-1)
      expect(doc.id).toBe(`${doc.lessonId}:${doc.kind}:${doc.sectionIndex}`)
    }
  })

  it('anchor 由 P1-A 契约产生：可跳转文档必有 id，无 id 的块保持 null 且每课唯一', () => {
    const index = buildRealIndex()

    for (const lesson of lessons) {
      const docs = index.docs.filter((doc) => doc.lessonId === lesson.id)
      const anchors = docs
        .map((doc) => doc.anchor)
        .filter((anchor): anchor is string => anchor !== null)

      expect(new Set(anchors).size, `duplicate anchor in ${lesson.slug}`).toBe(anchors.length)

      for (const doc of docs) {
        if (ANCHORED_KINDS.includes(doc.kind)) {
          expect(doc.anchor, `${doc.id} must have an anchor`).toBeTruthy()
        }

        if (ANCHORLESS_KINDS.includes(doc.kind)) {
          expect(doc.anchor, `${doc.id} must not have an anchor`).toBeNull()
        }

        if (doc.anchor) {
          expect(doc.anchor).toMatch(/^[A-Za-z0-9_-]+$/)
        }
      }
    }
  })

  it('每个非空 anchor 都能在对应课程的 SSR 渲染结果中找到（索引 / 渲染器 parity）', () => {
    const index = buildRealIndex()

    for (const lesson of lessons) {
      const content = lessonContentBySlug[lesson.slug]
      const markup = renderToStaticMarkup(
        <>
          <LessonHeader lesson={lesson} lessons={lessons} content={content} />
          <LessonContent lesson={lesson} content={content} />
        </>,
      )
      const renderedIds = new Set(extractIds(markup))
      const anchors = index.docs
        .filter((doc) => doc.lessonId === lesson.id)
        .map((doc) => doc.anchor)
        .filter((anchor): anchor is string => anchor !== null)

      expect(renderedIds.size, `no heading ids rendered for ${lesson.slug}`).toBeGreaterThan(0)

      for (const anchor of anchors) {
        expect(renderedIds.has(anchor), `anchor ${anchor} missing from ${lesson.slug}`).toBe(true)
      }
    }
  })

  it('legacy visualization / comparison 当前无消费者：一旦出现必须扩索引而不是静默漏掉 target', () => {
    const legacyLessons = lessons.filter(
      (lesson) =>
        lessonContentBySlug[lesson.slug].visualization ||
        lessonContentBySlug[lesson.slug].comparison,
    )

    expect(legacyLessons.map((lesson) => lesson.slug)).toEqual([])
  })

  it('构建结果确定：重复构建与注册表顺序无关，JSON 无时间戳', () => {
    const first = serializeSearchIndex(buildRealIndex())
    const second = serializeSearchIndex(buildRealIndex())
    const reversed = serializeSearchIndex(
      buildSearchIndex([...lessons].reverse(), lessonContentBySlug),
    )

    expect(second).toBe(first)
    expect(reversed).toBe(first)

    const parsed = JSON.parse(first)
    expect(Object.keys(parsed)).toEqual(['version', 'lessons', 'docs'])
    expect(first.endsWith('\n')).toBe(true)
  })

  it('索引体积与查询性能在 Phase 1 预算内（非严格预算，防回归）', () => {
    const index = buildRealIndex()
    const payload = serializeSearchIndex(index)
    const rawBytes = Buffer.byteLength(payload)
    const gzipBytes = gzipSync(payload).length
    const brotliBytes = brotliCompressSync(payload).length
    const buildStart = performance.now()
    buildSearchIndex(lessons, lessonContentBySlug)
    const buildMs = performance.now() - buildStart

    // warm: 浏览器里 index 只解析一次，之后的每次按键都命中 memo 化的匹配单元
    const coldIndex = buildRealIndex()
    const coldStart = performance.now()
    searchKnowledge(coldIndex, '数据倾斜')
    const coldFirstQueryUs = (performance.now() - coldStart) * 1000

    const warmIndex = buildRealIndex()
    for (const query of REAL_QUERIES) {
      searchKnowledge(warmIndex, query)
    }

    const rounds = 50
    const warmStart = performance.now()
    for (let round = 0; round < rounds; round += 1) {
      for (const query of REAL_QUERIES) {
        searchKnowledge(warmIndex, query)
      }
    }

    const warmPerQueryUs = ((performance.now() - warmStart) * 1000) / (rounds * REAL_QUERIES.length)

    console.log(
      `[#148 P1-B] docs=${index.docs.length} lessons=${index.lessons.length} raw=${rawBytes}B ` +
        `gzip=${gzipBytes}B brotli=${brotliBytes}B build=${buildMs.toFixed(1)}ms ` +
        `coldQuery=${coldFirstQueryUs.toFixed(0)}us warmQuery=${warmPerQueryUs.toFixed(0)}us`,
    )

    expect(rawBytes).toBeLessThan(290_000)
    expect(gzipBytes).toBeLessThan(85_000)
    expect(brotliBytes).toBeLessThan(68_000)
    expect(buildMs).toBeLessThan(200)
    // 性能上限刻意宽松：CI 与其他测试并行时噪声很大，这里只防 O(n²) 级回归
    expect(coldFirstQueryUs).toBeLessThan(50_000)
    expect(warmPerQueryUs).toBeLessThan(3_000)
  })
})
