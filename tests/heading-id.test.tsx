import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LearnShell } from '../src/components/course/LearnShell'
import type { LessonSection } from '../src/content/types'
import { getLessonContent, lessonContentBySlug } from '../src/content/lessons'
import { getLessonBySlug, isLessonAvailable, lessons } from '../src/data/course'
import {
  getCompareColumnHeadingId,
  getConceptHeadingId,
  getLegacyHeadingId,
  getLessonHeadingId,
  getOpeningHeadingId,
  getSectionHeadingId,
  type SectionHeadingKind,
} from '../src/utils/heading-id'

/**
 * `getSectionHeadingId` contract (#148 P1-A).
 *
 * The renderer and the future search index must resolve the same anchor for
 * the same section. These tests pin the format and prove that every heading a
 * lesson renders has a unique, deterministic id.
 */
const ANCHOR_SECTION_KINDS: Record<string, SectionHeadingKind> = {
  narrative: 'narrative',
  compare: 'compare',
  sql: 'sql',
  visualization: 'visualization',
  takeaway: 'takeaway',
}

/** Anchor id for a typed section, or `null` for sections without a heading. */
function getSectionAnchorId(
  lessonId: string,
  section: LessonSection,
  index: number,
): string | null {
  const kind = section.kind ?? 'narrative'
  const headingKind = ANCHOR_SECTION_KINDS[kind]

  return headingKind ? getSectionHeadingId(lessonId, index, headingKind) : null
}

function extractIds(markup: string): string[] {
  return [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
}

function renderLearnShell(slug: string): string {
  const lesson = getLessonBySlug(slug)

  if (!lesson) {
    throw new Error(`Unknown lesson: ${slug}`)
  }

  return renderToStaticMarkup(
    <LearnShell
      lessons={lessons}
      initialLesson={lesson}
      initialContent={getLessonContent(lesson)}
    />,
  )
}

describe('heading id 契约', () => {
  it('沿用 {lessonId}-section-{index}-… 语义并保持 lesson / concept / opening 格式', () => {
    expect(getLessonHeadingId('lesson-01')).toBe('lesson-01-title')
    expect(getConceptHeadingId('lesson-01')).toBe('lesson-01-concept-title')
    expect(getOpeningHeadingId('lesson-01')).toBe('lesson-01-opening-title')

    expect(getSectionHeadingId('lesson-01', 0, 'narrative')).toBe('lesson-01-section-0-title')
    // visualization 与 narrative 共用历史格式，index 唯一因此无冲突
    expect(getSectionHeadingId('lesson-01', 1, 'visualization')).toBe('lesson-01-section-1-title')
    expect(getSectionHeadingId('lesson-01', 2, 'compare')).toBe('lesson-01-section-2-compare-title')
    expect(getSectionHeadingId('lesson-01', 3, 'sql')).toBe('lesson-01-section-3-sql-title')
    expect(getSectionHeadingId('lesson-01', 4, 'takeaway')).toBe(
      'lesson-01-section-4-takeaway-title',
    )

    expect(getLegacyHeadingId('lesson-01', 'visualization')).toBe(
      'lesson-01-legacy-visualization-title',
    )
    expect(getLegacyHeadingId('lesson-01', 'compare')).toBe('lesson-01-legacy-compare-title')
    expect(getLegacyHeadingId('lesson-01', 'code')).toBe('lesson-01-legacy-code-title')

    expect(getCompareColumnHeadingId('lesson-01-section-2-compare-title', 0)).toBe(
      'lesson-01-section-2-compare-title-column-0',
    )
  })

  it('每节课内所有生成 id 唯一，且只包含安全的 id 字符', () => {
    for (const lesson of lessons) {
      const content = lessonContentBySlug[lesson.slug]
      expect(content, `missing content for ${lesson.slug}`).toBeTruthy()

      const ids = [
        getLessonHeadingId(lesson.id),
        getOpeningHeadingId(lesson.id),
        getConceptHeadingId(lesson.id),
      ]

      content.sections.forEach((section, index) => {
        const anchorId = getSectionAnchorId(lesson.id, section, index)
        if (anchorId) {
          ids.push(anchorId)
        }
      })

      if (content.visualization) {
        ids.push(getLegacyHeadingId(lesson.id, 'visualization'))
      }
      if (content.comparison) {
        ids.push(getLegacyHeadingId(lesson.id, 'compare'))
      }
      if (content.code) {
        ids.push(getLegacyHeadingId(lesson.id, 'code'))
      }

      expect(new Set(ids).size, `duplicate heading id in ${lesson.slug}`).toBe(ids.length)

      for (const id of ids) {
        expect(id, `unsafe heading id in ${lesson.slug}: ${id}`).toMatch(/^[A-Za-z0-9_-]+$/)
      }
    }
  })

  it('SSR 渲染出的 lesson / concept / narrative heading 全部带 id 且无重复', () => {
    const slugs = ['scheduling-sla', 'why-data-warehouse', 'data-service-file']

    for (const slug of slugs) {
      const lesson = getLessonBySlug(slug)
      const content = lessonContentBySlug[slug]

      expect(lesson, `unknown lesson ${slug}`).toBeTruthy()
      expect(isLessonAvailable(lesson!)).toBe(true)

      const markup = renderLearnShell(slug)
      const ids = extractIds(markup)

      expect(new Set(ids).size, `duplicate dom id on ${slug}`).toBe(ids.length)
      expect(markup).toContain(`id="${getLessonHeadingId(lesson!.id)}"`)
      if (content.opening) {
        expect(markup).toContain(`id="${getOpeningHeadingId(lesson!.id)}"`)
      }
      expect(markup).toContain(`id="${getConceptHeadingId(lesson!.id)}"`)

      content.sections.forEach((section, index) => {
        const anchorId = getSectionAnchorId(lesson!.id, section, index)
        if (anchorId) {
          expect(markup, `missing section anchor ${anchorId} on ${slug}`).toContain(
            `id="${anchorId}"`,
          )
        }
      })
    }
  })

  it('SSR 渲染出的 compare 列标题使用唯一 id', () => {
    const markup = renderLearnShell('slowly-changing-dimension')
    const lesson = getLessonBySlug('slowly-changing-dimension')

    expect(lesson).toBeTruthy()
    expect(markup).toContain(
      `id="${getCompareColumnHeadingId(getSectionHeadingId(lesson!.id, 2, 'compare'), 0)}"`,
    )
  })
})
