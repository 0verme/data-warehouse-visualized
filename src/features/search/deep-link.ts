/**
 * Browser URL contract for the knowledge search (#148 P1-B).
 *
 * Both helpers go through `getRoute()` so a `BASE_PATH` deployment keeps
 * working; nothing here reads or writes `location`.
 */
import { getRoute } from '../../utils/routes'
import type { SearchDoc } from './types'

/** Static artifact published by `src/pages/search-index.json.ts`. */
export const SEARCH_INDEX_FILE = 'search-index.json'

/**
 * URL P1-C must `fetch` on first search-open. Never imported into the initial
 * lesson bundle: the index is loaded on demand only (Issue #148 R6).
 */
export function getSearchIndexUrl(): string {
  return getRoute(`/${SEARCH_INDEX_FILE}`)
}

/**
 * Deep link of one document.
 *
 * `anchor === null` degrades to the lesson page instead of an empty fragment,
 * so P1-C can always assign `hit.href` without branching.
 */
export function getSearchDocumentHref(doc: Pick<SearchDoc, 'slug' | 'anchor'>): string {
  return getRoute(`/learn/${doc.slug}/${doc.anchor ? `#${doc.anchor}` : ''}`)
}
