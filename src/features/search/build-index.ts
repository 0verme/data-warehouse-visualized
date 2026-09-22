/**
 * Build-time search index generator (#148 P1-B).
 *
 * Pure and deterministic: it only reads the existing single source of truth
 * (`src/data/course.ts` lesson metadata and `src/content/lessons/*.ts` typed
 * content) and never mutates it, reads the clock or touches the DOM. Running it
 * twice on the same content must produce byte-identical JSON.
 *
 * Anchors come from `src/utils/heading-id.ts` — the P1-A heading identity
 * contract — so every non-null anchor is the exact `id` the renderer puts on
 * the heading (see `tests/search-index.test.ts` for the SSR parity check).
 */
import type { LessonContent, LessonSection } from '../../content/types'
import type { Lesson } from '../../data/course'
import { getChapterTitle } from '../../data/course'
import {
  getConceptHeadingId,
  getLegacyHeadingId,
  getLessonHeadingId,
  getOpeningHeadingId,
  getSectionHeadingId,
  type SectionHeadingKind,
} from '../../utils/heading-id'
import { getLessonDisplayNumber, sortLessons } from '../../utils/lesson'
import {
  SEARCH_INDEX_VERSION,
  type SearchDoc,
  type SearchDocKind,
  type SearchIndex,
  type SearchLesson,
} from './types'

export type LessonContentMap = Record<string, LessonContent | undefined>

/**
 * Typed section kind → heading identity kind.
 *
 * `narrative` also covers legacy sections without an explicit `kind`, exactly
 * like `LessonSectionRenderer` does. `pitfall` and `engineering-note` are
 * absent on purpose: the renderer gives those asides no heading id, so they are
 * indexed with `anchor: null`.
 */
const SECTION_HEADING_KINDS: Record<string, SectionHeadingKind | undefined> = {
  narrative: 'narrative',
  compare: 'compare',
  sql: 'sql',
  visualization: 'visualization',
  takeaway: 'takeaway',
  pitfall: undefined,
  'engineering-note': undefined,
}

/** Typed section kind → search document kind (same names today). */
const SECTION_DOC_KINDS: Record<string, SearchDocKind> = {
  narrative: 'narrative',
  compare: 'compare',
  sql: 'sql',
  visualization: 'visualization',
  takeaway: 'takeaway',
  pitfall: 'pitfall',
  'engineering-note': 'engineering-note',
}

/** Join non-empty text fragments with a single space. */
function joinSearchText(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ')
}

function getNarrativeText(section: Extract<LessonSection, { paragraphs: string[] }>): string {
  return joinSearchText([section.paragraphs.join(' '), section.bullets?.join(' ')])
}

/** Searchable body text of a typed section (headings are stored separately). */
function getSectionText(section: LessonSection): string {
  if ('paragraphs' in section) {
    return getNarrativeText(section)
  }

  switch (section.kind) {
    case 'compare':
      return joinSearchText([
        section.intro,
        ...section.columns.flatMap((column) => [
          column.label,
          column.title,
          column.points.join(' '),
        ]),
      ])
    case 'sql':
      return section.code
    case 'visualization':
      return section.description
    case 'takeaway':
      return joinSearchText([section.text, section.bullets?.join(' ')])
    case 'engineering-note':
    case 'pitfall':
      return section.text
    default:
      return ''
  }
}

/** Display heading of a typed section; empty when the section has none. */
function getSectionHeading(section: LessonSection): string {
  if ('title' in section && typeof section.title === 'string') {
    return section.title
  }

  if (section.kind === 'sql') {
    return section.label
  }

  return ''
}

function createDocument(input: {
  lesson: Lesson
  kind: SearchDocKind
  heading: string
  text: string
  anchor: string | null
  sectionIndex: number
}): SearchDoc {
  const { lesson, kind, sectionIndex } = input

  return {
    id: `${lesson.id}:${kind}:${sectionIndex}`,
    lessonId: lesson.id,
    slug: lesson.slug,
    kind,
    heading: input.heading,
    text: input.text,
    anchor: input.anchor,
    sectionIndex,
  }
}

/**
 * Documents of one lesson, in roughly rendered order.
 *
 * Only blocks that the renderer actually mounts are indexed. Legacy
 * `visualization` / `comparison` blocks are intentionally absent because the
 * renderer may skip them (`showLegacyVisualization`), and no lesson uses them
 * today — `tests/search-index.test.ts` guards that assumption so adding one
 * forces the index to be extended instead of silently missing a target.
 */
function buildLessonDocuments(lesson: Lesson, content: LessonContent): SearchDoc[] {
  const documents: SearchDoc[] = []

  documents.push(
    createDocument({
      lesson,
      kind: 'lesson',
      heading: '',
      // Lesson-level text lives in `SearchLesson` (`title` / `tags` / `summary`
      // / `subtitle`) so the summary is not duplicated into every document.
      text: '',
      anchor: getLessonHeadingId(lesson.id),
      sectionIndex: -1,
    }),
  )

  if (content.opening) {
    documents.push(
      createDocument({
        lesson,
        kind: 'opening',
        heading: content.opening.title,
        text: joinSearchText([
          content.opening.intro,
          ...content.opening.cards.flatMap((card) => [card.label, card.value, card.detail]),
          content.opening.question,
        ]),
        anchor: getOpeningHeadingId(lesson.id),
        sectionIndex: -1,
      }),
    )
  }

  documents.push(
    createDocument({
      lesson,
      kind: 'summary',
      heading: '',
      text: content.quickSummary,
      anchor: null,
      sectionIndex: -1,
    }),
  )

  documents.push(
    createDocument({
      lesson,
      kind: 'concept',
      heading: content.concept.term,
      text: content.concept.definition,
      anchor: getConceptHeadingId(lesson.id),
      sectionIndex: -1,
    }),
  )

  content.sections.forEach((section, index) => {
    const sectionKind = section.kind ?? 'narrative'
    const headingKind = SECTION_HEADING_KINDS[sectionKind]
    const kind = SECTION_DOC_KINDS[sectionKind]

    if (!kind) {
      throw new Error(
        `Search index does not know how to index section kind "${sectionKind}" in "${lesson.slug}"`,
      )
    }

    documents.push(
      createDocument({
        lesson,
        kind,
        heading: getSectionHeading(section),
        text: getSectionText(section),
        anchor: headingKind ? getSectionHeadingId(lesson.id, index, headingKind) : null,
        sectionIndex: index,
      }),
    )
  })

  if (content.code) {
    documents.push(
      createDocument({
        lesson,
        kind: 'sql',
        heading: content.code.label,
        text: content.code.code,
        anchor: getLegacyHeadingId(lesson.id, 'code'),
        sectionIndex: -1,
      }),
    )
  }

  if (content.engineeringTip) {
    documents.push(
      createDocument({
        lesson,
        kind: 'engineering-note',
        heading: '',
        text: content.engineeringTip,
        anchor: null,
        sectionIndex: -1,
      }),
    )
  }

  if (content.pitfalls && content.pitfalls.length > 0) {
    documents.push(
      createDocument({
        lesson,
        kind: 'pitfall',
        heading: '',
        text: joinSearchText(content.pitfalls),
        anchor: null,
        sectionIndex: -1,
      }),
    )
  }

  return documents
}

/** Lesson metadata for the matcher; derived, never hand-maintained. */
function buildSearchLesson(
  lesson: Lesson,
  content: LessonContent,
  lessons: readonly Lesson[],
): SearchLesson {
  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    subtitle: content.subtitle,
    summary: lesson.summary,
    tags: [...lesson.tags],
    chapterId: lesson.chapter,
    chapterTitle: getChapterTitle(lesson.chapter),
    number: getLessonDisplayNumber(lesson, lessons),
    order: lesson.order,
  }
}

/**
 * Build the complete index. Lessons are sorted with the course ordering so the
 * artifact is independent of registry insertion order.
 */
export function buildSearchIndex(
  lessons: readonly Lesson[],
  contentBySlug: LessonContentMap,
): SearchIndex {
  const orderedLessons = sortLessons(lessons)
  const searchLessons: SearchLesson[] = []
  const docs: SearchDoc[] = []

  for (const lesson of orderedLessons) {
    const content = contentBySlug[lesson.slug]

    if (!content) {
      throw new Error(`Search index is missing lesson content for "${lesson.slug}"`)
    }

    searchLessons.push(buildSearchLesson(lesson, content, lessons))
    docs.push(...buildLessonDocuments(lesson, content))
  }

  return {
    version: SEARCH_INDEX_VERSION,
    lessons: searchLessons,
    docs,
  }
}

/** Stable JSON payload of the index artifact (compact, trailing newline). */
export function serializeSearchIndex(index: SearchIndex): string {
  return `${JSON.stringify(index)}\n`
}
