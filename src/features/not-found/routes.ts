import { lessons } from '../../data/course'
import { ENGLISH_PATHS } from '../../utils/english-routes'

/**
 * Build-time manifest of canonical app routes that the Smart 404 recovery may
 * suggest (#215 Phase 2).
 *
 * Every entry must correspond to a page in the static build;
 * `tests/smart-404-build-contract.mjs` compares this list with `dist/` and
 * fails on drift, so adding a new static page means updating this module.
 *
 * `/dev/*`, `/404` and non-HTML endpoints are intentionally absent.
 */
const NON_LESSON_ROUTES = ['/', '/learn/', '/roadmap/'] as const

export function getRecoverableRoutes(): string[] {
  const routes = new Set<string>(NON_LESSON_ROUTES)
  for (const lesson of lessons) {
    routes.add(`/learn/${lesson.slug}/`)
  }
  for (const route of Object.values(ENGLISH_PATHS)) {
    routes.add(route)
  }
  return [...routes].sort()
}
