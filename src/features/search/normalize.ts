/**
 * Query / document normalization for the knowledge search (#148 P1-B).
 *
 * Phase 1 deliberately uses normalized substring matching (Issue #148 §中文搜索策略):
 * lowercase, then drop whitespace and punctuation, then `includes`. Chinese text
 * matches character-by-character without any segmentation, and `first_seen`,
 * `first seen` and `first-seen` all collapse to `firstseen`.
 */

/**
 * Whitespace and punctuation removed during normalization.
 *
 * `_`, `-`, `–`, `—` and `/` are separators on purpose so snake_case,
 * kebab-case and `ETL / ELT` become comparable. CJK punctuation is included so
 * a query typed with full-width commas still matches prose text.
 */
const SEPARATOR_RUN = /[\s_\-–—/·。，、；：！？“”‘’（）()【】[\]{}<>《》"'`~!@#$%^&*+=|\\?.,:;]+/g

const SEPARATOR_CHAR = /[\s_\-–—/·。，、；：！？“”‘’（）()【】[\]{}<>《》"'`~!@#$%^&*+=|\\?.,:;]/

/** Lowercase + strip separators. Length is *not* preserved (see below). */
export function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(SEPARATOR_RUN, '')
}

/** Is this raw character dropped by normalization? (used for snippet edges) */
export function isSearchSeparator(character: string): boolean {
  return SEPARATOR_CHAR.test(character)
}

/**
 * Normalized text plus a map back to the raw string.
 *
 * Snippets must show the original casing and punctuation, so every normalized
 * character records the raw range it came from. Kept character-by-character
 * (instead of index arithmetic) because lowercasing can change string length
 * for a few Unicode characters.
 */
export interface NormalizedSearchText {
  text: string
  /** Raw index where normalized character `i` starts. */
  starts: number[]
  /** Raw index where normalized character `i` ends (exclusive). */
  ends: number[]
}

export function normalizeSearchTextWithIndices(text: string): NormalizedSearchText {
  const characters: string[] = []
  const starts: number[] = []
  const ends: number[] = []

  for (let index = 0; index < text.length; index += 1) {
    const raw = text[index]

    if (SEPARATOR_CHAR.test(raw)) {
      continue
    }

    const lower = raw.toLowerCase()

    for (let offset = 0; offset < lower.length; offset += 1) {
      characters.push(lower[offset])
      starts.push(index)
      ends.push(index + 1)
    }
  }

  return { text: characters.join(''), starts, ends }
}

/**
 * Split a raw query into normalized terms.
 *
 * Terms are split on raw whitespace *before* normalization so `幂等 边界`
 * stays AND-composed, while `first seen` still works because every part is
 * normalized separately (`first` + `seen`, both contained in `firstseen`).
 * Empty and duplicate terms are dropped; a single CJK character is a valid
 * term (Issue #148: minimum length is 1).
 */
export function tokenizeSearchQuery(query: string): string[] {
  const terms: string[] = []
  const seen = new Set<string>()

  for (const part of query.split(/\s+/)) {
    const term = normalizeSearchText(part)

    if (!term || seen.has(term)) {
      continue
    }

    seen.add(term)
    terms.push(term)
  }

  return terms
}

/** Count non-overlapping occurrences of `term` inside already-normalized text. */
export function countSearchOccurrences(normalizedText: string, term: string): number {
  if (!term) {
    return 0
  }

  let count = 0
  let index = normalizedText.indexOf(term)

  while (index !== -1) {
    count += 1
    index = normalizedText.indexOf(term, index + term.length)
  }

  return count
}
