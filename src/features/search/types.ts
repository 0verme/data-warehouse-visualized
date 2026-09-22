/**
 * Knowledge search data contract (#148 Phase 1 / P1-B).
 *
 * P1-B owns three things and nothing else:
 *
 * 1. the *search document* schema derived from the existing single source of
 *    truth (`src/data/course.ts` + `src/content/lessons/*.ts`);
 * 2. a deterministic build-time index (`build-index.ts`) plus the static
 *    endpoint that publishes it (`src/pages/search-index.json.ts`);
 * 3. deterministic browser-side matching primitives (`match.ts`).
 *
 * There is no UI here. `SearchDialog` and both entry points belong to P1-C.
 *
 * Anchors are *not* re-invented: every `anchor` is produced by
 * `src/utils/heading-id.ts`, the single heading identity contract established
 * by P1-A, and `deep-link.ts` turns it into `/learn/<slug>/#<anchor>`.
 */

/** Bumped whenever the serialized schema changes; lets P1-C reject stale payloads. */
export const SEARCH_INDEX_VERSION = 1

/**
 * What a single search document points at.
 *
 * - `lesson` / `summary`: lesson-level metadata and the "一句话速览" block.
 * - `opening` / `concept`: the header blocks of a lesson.
 * - `narrative` / `compare` / `sql` / `visualization` / `takeaway`: typed
 *   `sections[]` entries that own a heading id.
 * - `pitfall` / `engineering-note`: teaching asides. The renderer gives these
 *   no heading id, so their `anchor` stays `null` and the deep link degrades to
 *   the lesson page (documented Phase 1 limitation).
 */
export type SearchDocKind =
  | 'lesson'
  | 'opening'
  | 'summary'
  | 'concept'
  | 'narrative'
  | 'compare'
  | 'sql'
  | 'visualization'
  | 'takeaway'
  | 'pitfall'
  | 'engineering-note'

/**
 * Field a query term can match, ordered by ranking priority.
 *
 * `title` = lesson title, `heading` = section heading, `tags` / `summary` =
 * lesson metadata, `body` = the document's own text.
 */
export type SearchMatchField = 'title' | 'heading' | 'tags' | 'summary' | 'body'

/**
 * Ranking layer of a result. Higher wins, and the order is intentionally
 * distinct from `score` so a body-heavy hit can never outrank a structural hit.
 *
 * 4 = lesson title, 3 = section heading, 2 = tags / metadata, 1 = body text.
 */
export type SearchTier = 1 | 2 | 3 | 4

/** Lesson-level metadata shared by every document of that lesson. */
export interface SearchLesson {
  /** `lesson.id` — anchor prefix and stable identity. */
  id: string
  slug: string
  title: string
  /** Header subtitle; indexed as lesson metadata. */
  subtitle: string
  summary: string
  tags: string[]
  chapterId: string
  chapterTitle: string
  /** Chapter-local display number, e.g. `2-3` (see `getLessonDisplayNumber`). */
  number: string
  /** Chapter-local ordering weight from `lessonDefinitions`. */
  order: number
}

/**
 * One jump target. `id` is deterministic (`<lessonId>:<kind>:<sectionIndex>`),
 * and lessons are always serialized in course order, so the same content
 * produces the same index.
 */
export interface SearchDoc {
  id: string
  lessonId: string
  slug: string
  kind: SearchDocKind
  /** Heading text; empty for documents with no heading. */
  heading: string
  /**
   * Searchable body text of this target; empty for the `lesson` document,
   * whose matchable text lives in its `SearchLesson` metadata.
   */
  text: string
  /**
   * `src/utils/heading-id.ts` anchor, or `null` when the target has no heading
   * id (the `lesson`-level link and note blocks).
   */
  anchor: string | null
  /** Index inside `content.sections[]`; `-1` for lesson-level documents. */
  sectionIndex: number
}

/** The serialized artifact fetched by P1-C. */
export interface SearchIndex {
  version: number
  lessons: SearchLesson[]
  docs: SearchDoc[]
}

/** One highlighted (or plain) run of snippet text. */
export interface SearchSnippetSegment {
  text: string
  match: boolean
}

/** Where the snippet text came from; `summary` is the meta-hit fallback. */
export type SearchSnippetSource = 'body' | 'summary'

export interface SearchSnippet {
  text: string
  segments: SearchSnippetSegment[]
  source: SearchSnippetSource
}

/**
 * A ready-to-render result. P1-C never needs to join documents with lessons:
 * every display field, the deep link and the snippet are already resolved.
 */
export interface SearchHit {
  docId: string
  slug: string
  lessonId: string
  lessonTitle: string
  chapterId: string
  chapterTitle: string
  lessonNumber: string
  kind: SearchDocKind
  heading: string
  anchor: string | null
  /** `/learn/<slug>/#<anchor>` via `getRoute()`, already `BASE_PATH` aware. */
  href: string
  score: number
  tier: SearchTier
  /** Best matching field per query term, ordered by `SearchMatchField` priority. */
  matchedFields: SearchMatchField[]
  snippet: SearchSnippet
}

export interface SearchResult {
  /** Raw query, echoed for UI state. */
  query: string
  /** Normalized, de-duplicated terms; empty for an unusable query. */
  terms: string[]
  hits: SearchHit[]
}

export interface SearchOptions {
  /** Maximum number of results. Defaults to 8 (Issue #148 Search UX). */
  limit?: number
  /** Maximum results per lesson. Defaults to 2 (Issue #148 Search UX). */
  perLessonLimit?: number
}
