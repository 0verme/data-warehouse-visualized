/**
 * Canonical heading identity for lesson content (#148 P1-A).
 *
 * Single source of truth for every `id` that the lesson renderer puts on a
 * heading and for the anchors a future search index links to. Renderer and
 * index must call these helpers instead of assembling their own strings.
 *
 * Ids are deterministic but index-based: inserting or reordering a lesson
 * section intentionally changes the ids after it. That matches the existing
 * `{lessonId}-section-{index}-…` convention already used by visualization /
 * compare / sql / takeaway blocks, and avoids a content hash or database-style
 * identity (see #148 R2).
 */

/** Sections that render a heading with an anchor id. */
export type SectionHeadingKind = 'narrative' | 'compare' | 'sql' | 'visualization' | 'takeaway'

/** Deprecated top-level blocks that still render a heading. */
export type LegacyHeadingKind = 'visualization' | 'compare' | 'code'

/** `<h1>` of a lesson: the lesson-top anchor. */
export function getLessonHeadingId(lessonId: string): string {
  return `${lessonId}-title`
}

/** `<h2>` of the core concept card. */
export function getConceptHeadingId(lessonId: string): string {
  return `${lessonId}-concept-title`
}

/** `<h2>` of the opening block (anchored before #148; format owned here now). */
export function getOpeningHeadingId(lessonId: string): string {
  return `${lessonId}-opening-title`
}

/**
 * `<h2>` anchor of a typed `sections[]` entry.
 *
 * `narrative` and `visualization` share the historical
 * `{lessonId}-section-{index}-title` shape (the Issue #148 contract); compare /
 * sql / takeaway append their kind for readability. Section indexes are unique
 * within a lesson, so no two sections can produce the same id.
 */
export function getSectionHeadingId(
  lessonId: string,
  sectionIndex: number,
  kind: SectionHeadingKind,
): string {
  return kind === 'narrative' || kind === 'visualization'
    ? `${lessonId}-section-${sectionIndex}-title`
    : `${lessonId}-section-${sectionIndex}-${kind}-title`
}

/** Heading of a deprecated top-level block that is not a typed section yet. */
export function getLegacyHeadingId(lessonId: string, kind: LegacyHeadingKind): string {
  return `${lessonId}-legacy-${kind}-title`
}

/**
 * `<h3>` anchor of a compare column.
 *
 * Compare columns share their block's section instead of owning one, so they
 * derive from the compare block heading id rather than starting a parallel
 * identity scheme.
 */
export function getCompareColumnHeadingId(compareHeadingId: string, columnIndex: number): string {
  return `${compareHeadingId}-column-${columnIndex}`
}
