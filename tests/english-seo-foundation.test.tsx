import { readFileSync, readdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SiteFooter } from '../src/components/SiteFooter'
import { lessons } from '../src/data/course'
import { ENGLISH_PATHS, getEnglishRoute } from '../src/utils/english-routes'

const pagesDirectory = new URL('../src/pages/', import.meta.url)
const englishRoutes = [
  { file: 'en/index.astro', route: ENGLISH_PATHS.overview },
  { file: 'en/sql/index.astro', route: ENGLISH_PATHS.sql },
  { file: 'en/sql/sql-join-duplicate-rows/index.astro', route: ENGLISH_PATHS.joinDuplicateRows },
  { file: 'en/data-warehouse/index.astro', route: ENGLISH_PATHS.warehouse },
  { file: 'en/data-warehouse/grain/index.astro', route: ENGLISH_PATHS.grain },
  { file: 'en/data-warehouse/idempotent-etl/index.astro', route: ENGLISH_PATHS.idempotentEtl },
  {
    file: 'en/data-warehouse/data-lineage-vs-task-dependency/index.astro',
    route: ENGLISH_PATHS.lineageVsTaskDependency,
  },
  { file: 'en/data-warehouse/scd-type-2/index.astro', route: ENGLISH_PATHS.scdType2 },
  { file: 'en/tools/index.astro', route: ENGLISH_PATHS.tools },
]
const establishedLearnSlugs = `
build-a-warehouse
data-governance
data-governance-change-responsibility
data-governance-evidence
data-governance-field-access
data-governance-lifecycle
data-lineage
data-lineage-evidence
data-lineage-fields
data-lineage-impact
data-lineage-investigation
data-modeling
data-quality
data-quality-dataset
data-quality-evidence
data-quality-release
data-quality-rules
data-service
data-service-api
data-service-choice
data-service-file
data-service-report
delivery-completion-signal
deposit-metric-definition
deposit-metric-derivations
deposit-metric-time
fact-table-types
grain
lakehouse
lakehouse-replication
lakehouse-table-layer
lakehouse-unity
lifecycle-path-failure
metric-system
performance-and-practice
performance-first-seen
performance-scan-layout
performance-shuffle-skew
performance-tradeoffs
report-metric-journey
scheduling-failure
scheduling-readiness
scheduling-rerun
scheduling-sla
scheduling-system
slowly-changing-dimension
sql-and-transformation
sql-transformation-cleaning
sql-transformation-contract
sql-transformation-join
sql-transformation-layers
star-schema-and-grain
warehouse-layers
warehouse-terms
why-data-warehouse
`
  .trim()
  .split(/\s+/)

describe('English SEO routing contract', () => {
  it('defines exactly the nine English pages outside /learn/', () => {
    const pageFiles = readdirSync(pagesDirectory, { recursive: true }).map(String)
    const englishPageFiles = pageFiles
      .filter((path) => path.startsWith('en/') && path.endsWith('.astro'))
      .sort()

    expect(englishPageFiles).toEqual(englishRoutes.map(({ file }) => file).sort())
    expect(pageFiles.some((path) => path.startsWith('zh/'))).toBe(false)
    expect(englishRoutes.map(({ route }) => route)).toEqual([
      '/en/',
      '/en/sql/',
      '/en/sql/sql-join-duplicate-rows/',
      '/en/data-warehouse/',
      '/en/data-warehouse/grain/',
      '/en/data-warehouse/idempotent-etl/',
      '/en/data-warehouse/data-lineage-vs-task-dependency/',
      '/en/data-warehouse/scd-type-2/',
      '/en/tools/',
    ])
  })

  it('preserves 55 unique Learn slugs and their existing /learn/ URL shape', () => {
    const slugs = lessons.map(({ slug }) => slug)

    expect(slugs).toHaveLength(55)
    expect(new Set(slugs).size).toBe(55)
    expect([...slugs].sort()).toEqual(establishedLearnSlugs)
    expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))).toBe(true)
    expect(slugs.map((slug) => `/learn/${slug}/`)).toHaveLength(55)
  })

  it('exposes the English namespace from the existing shared footer as a real link', () => {
    const markup = renderToStaticMarkup(<SiteFooter variant="home" />)

    expect(markup).toContain('<a href="/en/">English</a>')
  })

  it('keeps the crawleable footer link under BASE_PATH', () => {
    vi.stubEnv('BASE_URL', '/preview/')

    try {
      expect(getEnglishRoute('overview')).toBe('/preview/en/')
      expect(getEnglishRoute('scdType2')).toBe('/preview/en/data-warehouse/scd-type-2/')
      expect(renderToStaticMarkup(<SiteFooter variant="home" />)).toContain(
        '<a href="/preview/en/">English</a>',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('does not model the English pages as translated Learn routes or hreflang mirrors', () => {
    const source = englishRoutes
      .map(({ file }) => readFileSync(new URL(file, pagesDirectory), 'utf8'))
      .join('\n')

    expect(source).not.toContain('/en/learn/')
    expect(source).not.toContain('/en/blog/')
    expect(source).not.toContain('/en/tutorial/')
    expect(source).not.toContain('/en/articles/')
    expect(source).not.toContain('hreflang')
  })
})
