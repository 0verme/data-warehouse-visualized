import { readFileSync, readdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SiteFooter } from '../src/components/SiteFooter'
import { lessons } from '../src/data/course'
import { getRoute } from '../src/utils/routes'

const pagesDirectory = new URL('../src/pages/', import.meta.url)
const englishRoutes = [
  { file: 'en/index.astro', route: '/en/' },
  { file: 'en/sql/index.astro', route: '/en/sql/' },
  { file: 'en/tools/index.astro', route: '/en/tools/' },
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

describe('English SEO Foundation routing contract', () => {
  it('defines exactly the three Foundation namespace entry files outside /learn/', () => {
    const pageFiles = readdirSync(pagesDirectory, { recursive: true }).map(String)
    const englishPageFiles = pageFiles
      .filter((path) => path.startsWith('en/') && path.endsWith('.astro'))
      .sort()

    expect(englishPageFiles).toEqual(englishRoutes.map(({ file }) => file).sort())
    expect(pageFiles.some((path) => path.startsWith('zh/'))).toBe(false)
    expect(englishRoutes.map(({ route }) => route)).toEqual(['/en/', '/en/sql/', '/en/tools/'])
  })

  it('preserves 54 unique Learn slugs and their existing /learn/ URL shape', () => {
    const slugs = lessons.map(({ slug }) => slug)

    expect(slugs).toHaveLength(54)
    expect(new Set(slugs).size).toBe(54)
    expect([...slugs].sort()).toEqual(establishedLearnSlugs)
    expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))).toBe(true)
    expect(slugs.map((slug) => `/learn/${slug}/`)).toHaveLength(54)
  })

  it('exposes the English namespace from the existing shared footer as a real link', () => {
    const markup = renderToStaticMarkup(<SiteFooter variant="home" />)

    expect(markup).toContain('<a href="/en/">English</a>')
  })

  it('keeps the crawleable footer link under BASE_PATH', () => {
    vi.stubEnv('BASE_URL', '/preview/')

    try {
      expect(getRoute('/en/')).toBe('/preview/en/')
      expect(renderToStaticMarkup(<SiteFooter variant="home" />)).toContain(
        '<a href="/preview/en/">English</a>',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('does not model the namespace as translated Learn routes or hreflang mirrors', () => {
    const source = englishRoutes
      .map(({ file }) => readFileSync(new URL(file, pagesDirectory), 'utf8'))
      .join('\n')

    expect(source).not.toContain('/en/learn/')
    expect(source).not.toContain('hreflang')
  })
})
