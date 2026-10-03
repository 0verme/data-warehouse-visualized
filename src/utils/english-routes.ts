import { getRoute } from './routes'

/**
 * English content routes owned by the Phase 2 Search-Intent MVP.
 *
 * Pages, navigation, internal links and tests all read from this single map so
 * that BASE_PATH handling and route spelling cannot drift between them.
 */
export const ENGLISH_PATHS = {
  overview: '/en/',
  sql: '/en/sql/',
  joinDuplicateRows: '/en/sql/sql-join-duplicate-rows/',
  warehouse: '/en/data-warehouse/',
  grain: '/en/data-warehouse/grain/',
  idempotentEtl: '/en/data-warehouse/idempotent-etl/',
  lineageVsTaskDependency: '/en/data-warehouse/data-lineage-vs-task-dependency/',
  scdType2: '/en/data-warehouse/scd-type-2/',
  tools: '/en/tools/',
} as const

export type EnglishPageKey = keyof typeof ENGLISH_PATHS

export const ENGLISH_SECTIONS = ['overview', 'sql', 'warehouse', 'tools'] as const

export type EnglishSectionId = (typeof ENGLISH_SECTIONS)[number]

export function getEnglishRoute(key: EnglishPageKey): string {
  return getRoute(ENGLISH_PATHS[key])
}
