import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { createReprocessingFixture } from '../src/features/dependency-reprocessing/fixture'
import { getLessonBySlug, lessons } from '../src/data/course'
import type { DependencyReprocessingFocus } from '../src/features/dependency-reprocessing/types'
import { getAdjacentLessons } from '../src/utils/lesson'

const SERIES = [
  {
    id: 'lesson-14-1',
    slug: 'reprocessing-incident-timeline',
    order: 100,
    focus: 'incident-timeline',
  },
  { id: 'lesson-14-2', slug: 'reprocessing-impact-scope', order: 200, focus: 'impact-scope' },
  {
    id: 'lesson-14-3',
    slug: 'reprocessing-auto-stop-wait',
    order: 300,
    focus: 'stop-wait-redo',
  },
  {
    id: 'lesson-14-4',
    slug: 'reprocessing-historical-parallel',
    order: 400,
    focus: 'current-vs-historical',
  },
  {
    id: 'lesson-14-5',
    slug: 'reprocessing-version-boundary',
    order: 500,
    focus: 'version-boundary',
  },
  {
    id: 'lesson-14-6',
    slug: 'reprocessing-downstream-reload',
    order: 600,
    focus: 'consumer-closure',
  },
  {
    id: 'lesson-14-7',
    slug: 'reprocessing-rolling-backfill',
    order: 700,
    focus: 'rolling-backfill',
  },
  {
    id: 'lesson-14-8',
    slug: 'reprocessing-platform-design',
    order: 800,
    focus: 'platform-design',
  },
] as const satisfies readonly {
  id: string
  slug: string
  order: number
  focus: DependencyReprocessingFocus
}[]

function seriesContent(slug: string) {
  const lesson = getLessonBySlug(slug)
  expect(lesson, `缺少课程 ${slug}`).toBeDefined()
  return getLessonContent(lesson!)
}

describe('依赖链重做专题 · 系列完整性审计（Phase 4-B）', () => {
  it('第 14 章恰好 8 节，order 100–800，可视化 kind 一致', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '14')

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual(SERIES.map((entry) => entry.slug))
    expect(chapterLessons.map((lesson) => lesson.order)).toEqual(SERIES.map((entry) => entry.order))
    expect(chapterLessons.every((lesson) => lesson.demo === 'dependency-reprocessing')).toBe(true)
    expect(chapterLessons.every((lesson) => lesson.difficulty === 'advanced')).toBe(true)
  })

  it('每篇文章都有学习目标、可视化实验、takeaway 与系列内关联', () => {
    for (const entry of SERIES) {
      const content = seriesContent(entry.slug)
      const kinds = content.sections.map((section) => section.kind ?? 'narrative')

      expect(content.concept.term.length).toBeGreaterThan(0)
      expect(content.quickSummary.length).toBeGreaterThan(0)
      expect(kinds).toContain('visualization')
      expect(kinds).toContain('takeaway')
      expect(kinds).toContain('pitfall')
      expect(JSON.stringify(content)).toContain('14-')
    }
  })

  it('八个实验 focus 全部被使用，且与课程一一对应', () => {
    const focuses = SERIES.map((entry) => {
      const content = seriesContent(entry.slug)
      const section = content.sections.find((item) => item.kind === 'visualization')
      return section?.visualization.kind === 'dependency-reprocessing'
        ? section.visualization.lessonFocus
        : null
    })

    expect(focuses).toEqual(SERIES.map((entry) => entry.focus))
    expect(new Set(focuses).size).toBe(8)
  })

  it('相邻导航形成 A1 → A8 链', () => {
    SERIES.forEach((entry, index) => {
      const adjacent = getAdjacentLessons(lessons, entry.slug)
      expect(adjacent.previous?.slug).toBe(
        index === 0 ? 'delivery-completion-signal' : SERIES[index - 1]?.slug,
      )
      expect(adjacent.next?.slug).toBe(
        index === SERIES.length - 1 ? undefined : SERIES[index + 1]?.slug,
      )
    })
  })

  it('全系列不含虚构轮次机制、Replay Generation 或真实银行内部数据声明', () => {
    for (const entry of SERIES) {
      const text = JSON.stringify(seriesContent(entry.slug))
      expect(text, entry.slug).not.toMatch(/第 \d+ 轮重做|Replay Generation/)
      // 只允许「不代表真实银行…」这类禁止/澄清表述，不允许包含真实数据的主张。
      expect(text, entry.slug).not.toMatch(
        /包含真实|使用真实银行|真实客户数据|真实账户数据|生产库直连/,
      )
    }

    // fixture 本身不包含任何「真实」数据标记，全部为合成教学数据。
    expect(JSON.stringify(createReprocessingFixture())).not.toContain('真实')
  })

  it('专题文章提到关联章节（05 / 06 / 07 / 10 / 13）', () => {
    const allText = SERIES.map((entry) => JSON.stringify(seriesContent(entry.slug))).join('\n')

    for (const reference of ['5-2', '5-3', '5-4', '6-4', '7-4', '10-1', '10-5', '13-2']) {
      expect(allText, `缺少关联入口 ${reference}`).toContain(reference)
    }
  })
})
