import type { APIRoute } from 'astro'
import { lessonContentBySlug } from '../content/lessons'
import { lessons } from '../data/course'
import { buildSearchIndex, serializeSearchIndex } from '../features/search/build-index'

/**
 * Static knowledge-search index (#148 P1-B).
 *
 * `output: 'static'` prerenders this endpoint into `/search-index.json`, so the
 * artifact is generated from the same typed lesson content as the pages and is
 * fetched by the browser only when the user opens search (P1-C). It is never
 * imported into a client entry, which keeps it out of the initial lesson JS.
 */
export const prerender = true

export const GET: APIRoute = () => {
  const index = buildSearchIndex(lessons, lessonContentBySlug)

  return new Response(serializeSearchIndex(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
