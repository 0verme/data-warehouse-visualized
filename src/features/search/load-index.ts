/**
 * Session-memory loader for the build-time search artifact (#148 P1-C).
 *
 * This module is only imported by the lazy SearchDialog chunk. The immutable
 * index is fetched on first dialog open and shared by every later open; failed
 * requests are evicted so the user can retry without a page reload.
 */
import { getSearchIndexUrl } from './deep-link'
import { SEARCH_INDEX_VERSION, type SearchIndex } from './types'

let cachedIndexPromise: Promise<SearchIndex> | null = null

function isSearchIndex(value: unknown): value is SearchIndex {
  if (!value || typeof value !== 'object') return false

  const index = value as Partial<SearchIndex>
  return (
    index.version === SEARCH_INDEX_VERSION &&
    Array.isArray(index.lessons) &&
    Array.isArray(index.docs)
  )
}

export function loadSearchIndex(): Promise<SearchIndex> {
  if (cachedIndexPromise) return cachedIndexPromise

  const request = fetch(getSearchIndexUrl(), { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Search index request failed: ${response.status}`)
      }

      const payload: unknown = await response.json()
      if (!isSearchIndex(payload)) {
        throw new Error('Search index has an unsupported or invalid schema')
      }

      return payload
    })
    .catch((error: unknown) => {
      if (cachedIndexPromise === request) cachedIndexPromise = null
      throw error
    })

  cachedIndexPromise = request
  return request
}
