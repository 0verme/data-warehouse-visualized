/**
 * Browser-side matching primitives for the knowledge search (#148 P1-B).
 *
 * Pure functions over a `SearchIndex`: no DOM, no fetch, no React and no
 * third-party search dependency. Phase 1 uses normalized substring matching
 * (see `normalize.ts`) with a deterministic structural ranking where
 * lesson title > section heading > tags / metadata > body text.
 */
import { getSearchDocumentHref } from './deep-link'
import {
  countSearchOccurrences,
  isSearchSeparator,
  normalizeSearchText,
  normalizeSearchTextWithIndices,
  tokenizeSearchQuery,
  type NormalizedSearchText,
} from './normalize'
import type {
  SearchDoc,
  SearchHit,
  SearchIndex,
  SearchLesson,
  SearchMatchField,
  SearchOptions,
  SearchResult,
  SearchSnippet,
  SearchSnippetSegment,
  SearchTier,
} from './types'

/** Base score per ranking layer (Issue #148 §搜索排序). */
const TIER_SCORES: Record<SearchTier, number> = {
  4: 100,
  3: 40,
  2: 20,
  1: 8,
}

/** Body occurrences are compressed, never accumulated linearly. */
const BODY_HIT_CAP = 3

/** Bonus when the whole matched unit (a tag, a heading, …) equals the term. */
const EXACT_UNIT_BONUS = 15

/** Position bonus window and value for a match near the start of a field. */
const HEAD_POSITION_LIMIT = 20
const HEAD_POSITION_BONUS = 5

const DEFAULT_LIMIT = 8
const DEFAULT_PER_LESSON_LIMIT = 2

const SNIPPET_LEAD = 12
const SNIPPET_TAIL = 60
const SNIPPET_MAX_MARKS = 3

/** Deterministic field priority, also used for `matchedFields` ordering. */
const FIELD_ORDER: SearchMatchField[] = ['title', 'heading', 'tags', 'summary', 'body']

/** Deterministic kind priority for otherwise fully tied results. */
const DOC_KIND_ORDER: SearchDoc['kind'][] = [
  'lesson',
  'opening',
  'concept',
  'summary',
  'narrative',
  'compare',
  'sql',
  'visualization',
  'takeaway',
  'pitfall',
  'engineering-note',
]

/**
 * Normalized match units per document.
 *
 * The browser parses the index once and reuses the same document objects for
 * every keystroke, so normalizing ~63K characters on each query would be the
 * dominant cost. Memoizing by object identity keeps results identical while
 * making repeated queries cheap. The index is treated as immutable.
 */
const documentUnitCache = new WeakMap<SearchDoc, MatchUnit[]>()

interface MatchUnit {
  field: SearchMatchField
  tier: SearchTier
  normalized: string
}

interface TermMatch {
  field: SearchMatchField
  tier: SearchTier
  score: number
}

interface ScoredDocument {
  doc: SearchDoc
  lesson: SearchLesson
  score: number
  tier: SearchTier
  matchedFields: SearchMatchField[]
}

function chapterSortValue(chapterId: string): number {
  const chapterNumber = Number(chapterId)

  return Number.isFinite(chapterNumber) ? chapterNumber : Number.MAX_SAFE_INTEGER
}

function createMatchUnit(field: SearchMatchField, tier: SearchTier, text: string): MatchUnit {
  return { field, tier, normalized: normalizeSearchText(text) }
}

/**
 * Matchable units of one document.
 *
 * Lesson-level documents additionally expose the lesson title (tier 4) and
 * lesson metadata — tags, summary and subtitle (tier 2). Section documents only
 * expose their heading and body, so a title hit always means "this lesson",
 * not "some section that happens to sit in a matching lesson".
 */
function getMatchUnits(doc: SearchDoc, lesson: SearchLesson): MatchUnit[] {
  const cached = documentUnitCache.get(doc)

  if (cached) {
    return cached
  }

  const units = buildMatchUnits(doc, lesson)
  documentUnitCache.set(doc, units)

  return units
}

function buildMatchUnits(doc: SearchDoc, lesson: SearchLesson): MatchUnit[] {
  const units: MatchUnit[] = []

  if (doc.kind === 'lesson') {
    units.push(createMatchUnit('title', 4, lesson.title))

    for (const tag of lesson.tags) {
      units.push(createMatchUnit('tags', 2, tag))
    }

    units.push(createMatchUnit('summary', 2, lesson.summary))
    units.push(createMatchUnit('summary', 2, lesson.subtitle))
  }

  if (doc.heading) {
    units.push(createMatchUnit('heading', 3, doc.heading))
  }

  if (doc.text) {
    units.push(createMatchUnit('body', 1, doc.text))
  }

  return units.filter((unit) => unit.normalized.length > 0)
}

/** Best field match for one term; `null` when the term matches nothing. */
function findBestTermMatch(units: readonly MatchUnit[], term: string): TermMatch | null {
  let best: TermMatch | null = null

  for (const unit of units) {
    const index = unit.normalized.indexOf(term)

    if (index === -1) {
      continue
    }

    let score = TIER_SCORES[unit.tier]

    if (unit.tier === 1) {
      score = TIER_SCORES[1] * Math.min(BODY_HIT_CAP, countSearchOccurrences(unit.normalized, term))
    }

    if (unit.normalized === term) {
      score += EXACT_UNIT_BONUS
    }

    if (index < HEAD_POSITION_LIMIT) {
      score += HEAD_POSITION_BONUS
    }

    // Strictly greater keeps the first (highest priority) field on ties.
    if (!best || score > best.score) {
      best = { field: unit.field, tier: unit.tier, score }
    }
  }

  return best
}

/** Score one document against every term (AND semantics). */
function scoreDocument(
  doc: SearchDoc,
  lesson: SearchLesson,
  terms: readonly string[],
): ScoredDocument | null {
  const units = getMatchUnits(doc, lesson)
  const matchedFields = new Set<SearchMatchField>()
  let score = 0
  let tier: SearchTier = 1

  for (const term of terms) {
    const match = findBestTermMatch(units, term)

    if (!match) {
      return null
    }

    score += match.score
    tier = Math.max(tier, match.tier) as SearchTier
    matchedFields.add(match.field)
  }

  return {
    doc,
    lesson,
    score,
    tier,
    matchedFields: FIELD_ORDER.filter((field) => matchedFields.has(field)),
  }
}

/**
 * Stable result order: ranking layer first, then score, then course order,
 * then section position, then document id. Identical input always produces the
 * identical list, which is what the acceptance tests pin down.
 */
function compareScoredDocuments(left: ScoredDocument, right: ScoredDocument): number {
  if (left.tier !== right.tier) {
    return right.tier - left.tier
  }

  if (left.score !== right.score) {
    return right.score - left.score
  }

  const chapterDifference =
    chapterSortValue(left.lesson.chapterId) - chapterSortValue(right.lesson.chapterId)

  if (chapterDifference !== 0) {
    return chapterDifference
  }

  if (left.lesson.order !== right.lesson.order) {
    return left.lesson.order - right.lesson.order
  }

  if (left.doc.sectionIndex !== right.doc.sectionIndex) {
    return left.doc.sectionIndex - right.doc.sectionIndex
  }

  const kindDifference =
    DOC_KIND_ORDER.indexOf(left.doc.kind) - DOC_KIND_ORDER.indexOf(right.doc.kind)

  if (kindDifference !== 0) {
    return kindDifference
  }

  return left.doc.id < right.doc.id ? -1 : left.doc.id > right.doc.id ? 1 : 0
}

/** Pick the snippet window around the earliest matching term. */
function findSnippetWindow(
  normalized: NormalizedSearchText,
  terms: readonly string[],
): { start: number; end: number; term: string } | null {
  let firstIndex = -1
  let firstTerm = ''

  for (const term of terms) {
    const index = normalized.text.indexOf(term)

    if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index
      firstTerm = term
    }
  }

  if (firstIndex === -1) {
    return null
  }

  return {
    start: Math.max(0, firstIndex - SNIPPET_LEAD),
    end: Math.min(normalized.text.length, firstIndex + firstTerm.length + SNIPPET_TAIL),
    term: firstTerm,
  }
}

/** Merge overlapping raw ranges and keep at most `SNIPPET_MAX_MARKS`. */
function mergeMarkedRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const merged: Array<[number, number]> = []

  for (const range of sorted) {
    const previous = merged[merged.length - 1]

    if (previous && range[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], range[1])
      continue
    }

    merged.push([range[0], range[1]])
  }

  return merged.slice(0, SNIPPET_MAX_MARKS)
}

function toSegments(
  text: string,
  markedRanges: readonly [number, number][],
): SearchSnippetSegment[] {
  const segments: SearchSnippetSegment[] = []
  let cursor = 0

  for (const [start, end] of markedRanges) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), match: false })
    }

    segments.push({ text: text.slice(start, end), match: true })
    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false })
  }

  return segments.filter((segment) => segment.text.length > 0)
}

/** Does any term occur inside this text? (already-normalized substring rule) */
function containsAnyTerm(text: string, terms: readonly string[]): boolean {
  if (!text) {
    return false
  }

  const normalized = normalizeSearchText(text)

  return terms.some((term) => normalized.includes(term))
}

/**
 * Pick the text a snippet is cut from.
 *
 * Body text wins when it actually contains a term. Otherwise — the match was in
 * the heading, tags or metadata — the lesson summary is the documented fallback
 * (`数据倾斜` only exists as a tag, `SCD` mostly in metadata), so a result card
 * always has readable context even when no term is highlighted in it.
 */
function pickSnippetSource(
  doc: SearchDoc,
  lesson: SearchLesson,
  terms: readonly string[],
): { text: string; source: SearchSnippet['source'] } {
  if (doc.kind === 'lesson') {
    const candidates = [lesson.summary, lesson.subtitle]
    const containing = candidates.find((candidate) => containsAnyTerm(candidate, terms))

    return { text: containing ?? (lesson.summary || lesson.subtitle), source: 'summary' }
  }

  if (containsAnyTerm(doc.text, terms)) {
    return { text: doc.text, source: 'body' }
  }

  if (lesson.summary) {
    return { text: lesson.summary, source: 'summary' }
  }

  return { text: doc.text || lesson.subtitle, source: 'body' }
}

/** Keep punctuation that sits just before an untruncated window. */
function expandRawStart(text: string, rawStart: number, atTextStart: boolean): number {
  let start = rawStart

  while (atTextStart && start > 0 && isSearchSeparator(text[start - 1])) {
    start -= 1
  }

  return start
}

/** Keep punctuation that sits just after an untruncated window. */
function expandRawEnd(text: string, rawEnd: number, atTextEnd: boolean): number {
  let end = rawEnd

  while (atTextEnd && end < text.length && isSearchSeparator(text[end])) {
    end += 1
  }

  return end
}

/**
 * Snippet contract: ±12/60 normalized characters around the first hit, `…` on
 * truncated sides, at most 3 `<mark>` spans. The window is measured in
 * normalized characters, so punctuation directly at a *truncation* boundary is
 * dropped; punctuation adjacent to the beginning / end of the text is kept so
 * short fields still read naturally.
 *
 * Meta-only hits (a tag match, for example `数据倾斜`) fall back to the lesson
 * summary so a result card always has context; `segments` then simply contains
 * no marked run.
 *
 * `terms` must already be normalized (`tokenizeSearchQuery`), which is what
 * `searchKnowledge` passes in.
 */
export function buildSearchSnippet(
  doc: SearchDoc,
  lesson: SearchLesson,
  terms: readonly string[],
): SearchSnippet {
  const { text, source } = pickSnippetSource(doc, lesson, terms)

  if (!text) {
    return { text: '', segments: [], source }
  }

  const normalized = normalizeSearchTextWithIndices(text)
  const window = findSnippetWindow(normalized, terms)

  if (!window) {
    return { text, segments: toSegments(text, []), source }
  }

  const rawStart = expandRawStart(text, normalized.starts[window.start], window.start === 0)
  const rawEnd = expandRawEnd(
    text,
    normalized.ends[window.end - 1],
    window.end === normalized.text.length,
  )
  const prefix = window.start > 0 ? '…' : ''
  const suffix = window.end < normalized.text.length ? '…' : ''
  const snippetText = `${prefix}${text.slice(rawStart, rawEnd)}${suffix}`

  const ranges: Array<[number, number]> = []

  for (const term of terms) {
    let index = normalized.text.indexOf(term)

    while (index !== -1) {
      const markStart = Math.max(index, window.start)
      const markEnd = Math.min(index + term.length, window.end)

      if (markStart < markEnd) {
        ranges.push([normalized.starts[markStart], normalized.ends[markEnd - 1]])
      }

      index = normalized.text.indexOf(term, index + term.length)
    }
  }

  const shifted = mergeMarkedRanges(ranges).map(
    ([start, end]) =>
      [start - rawStart + prefix.length, end - rawStart + prefix.length] as [number, number],
  )

  return { text: snippetText, segments: toSegments(snippetText, shifted), source }
}

function toSearchHit(entry: ScoredDocument, terms: readonly string[]): SearchHit {
  const { doc, lesson } = entry

  return {
    docId: doc.id,
    slug: doc.slug,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    chapterId: lesson.chapterId,
    chapterTitle: lesson.chapterTitle,
    lessonNumber: lesson.number,
    kind: doc.kind,
    heading: doc.heading,
    anchor: doc.anchor,
    href: getSearchDocumentHref(doc),
    score: entry.score,
    tier: entry.tier,
    matchedFields: entry.matchedFields,
    snippet: buildSearchSnippet(doc, lesson, terms),
  }
}

/**
 * Search the index.
 *
 * - Empty / punctuation-only queries return no hits (P1-C shows its hint).
 * - Every term must match somewhere (AND).
 * - Results are sorted deterministically, then capped to `limit` documents with
 *   at most `perLessonLimit` per lesson so one lesson cannot flood the list.
 */
export function searchKnowledge(
  index: SearchIndex,
  query: string,
  options: SearchOptions = {},
): SearchResult {
  const terms = tokenizeSearchQuery(query)

  if (terms.length === 0) {
    return { query, terms, hits: [] }
  }

  const lessonsById = new Map(index.lessons.map((lesson) => [lesson.id, lesson]))
  const scored: ScoredDocument[] = []

  for (const doc of index.docs) {
    const lesson = lessonsById.get(doc.lessonId)

    if (!lesson) {
      continue
    }

    const entry = scoreDocument(doc, lesson, terms)

    if (entry) {
      scored.push(entry)
    }
  }

  scored.sort(compareScoredDocuments)

  const limit = Math.max(0, options.limit ?? DEFAULT_LIMIT)
  const perLessonLimit = Math.max(0, options.perLessonLimit ?? DEFAULT_PER_LESSON_LIMIT)
  const hits: SearchHit[] = []
  const hitsPerLesson = new Map<string, number>()

  for (const entry of scored) {
    if (hits.length >= limit) {
      break
    }

    const used = hitsPerLesson.get(entry.doc.lessonId) ?? 0

    if (used >= perLessonLimit) {
      continue
    }

    hitsPerLesson.set(entry.doc.lessonId, used + 1)
    hits.push(toSearchHit(entry, terms))
  }

  return { query, terms, hits }
}
