#!/usr/bin/env node
/**
 * Browser contract for the static English routes.
 *
 * Visits the real built site at desktop and mobile viewports, with a persisted
 * Chinese UI preference, so document language cannot accidentally regress to
 * the user's interface locale during initial load or ClientRouter navigation.
 * It also checks the page-body internal links that connect the English pages.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  TOLERANCE,
  createChecker,
  launchChromium,
  startPreview,
  trackPageErrors,
} from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'english-foundation'
const VIEWPORTS = [
  { name: 'desktop-1280x800', ...DESKTOP_VIEWPORT },
  { name: 'mobile-390x844', ...MOBILE_VIEWPORT },
]
const rawBasePath = process.env.BASE_PATH || '/'
const mountPath = rawBasePath === '/' ? '' : `/${rawBasePath.split('/').filter(Boolean).join('/')}`
const withBase = (path) => `${mountPath}${path}` || '/'
const ENGLISH_ROUTES = [
  {
    path: '/en/',
    title: 'English Data Engineering Resources | sql.sb',
    heading: 'Learn SQL and data engineering by following the data.',
    links: ['/en/sql/', '/en/data-warehouse/', '/en/tools/'],
  },
  {
    path: '/en/sql/',
    title: 'SQL Resources | English Data Engineering | sql.sb',
    heading: 'SQL resources',
    links: ['/en/sql/sql-join-duplicate-rows/', '/en/', '/en/data-warehouse/', '/en/tools/'],
  },
  {
    path: '/en/sql/sql-join-duplicate-rows/',
    title: 'Why Does a SQL JOIN Duplicate Rows? Examples & Fixes | sql.sb',
    heading: 'Why does a SQL JOIN duplicate rows?',
    links: ['/en/', '/en/sql/', '/en/data-warehouse/grain/'],
  },
  {
    path: '/en/data-warehouse/',
    title: 'Data Warehouse Engineering | English Resources | sql.sb',
    heading: 'Data warehouse engineering',
    links: [
      '/en/data-warehouse/grain/',
      '/en/data-warehouse/idempotent-etl/',
      '/en/data-warehouse/data-lineage-vs-task-dependency/',
      '/en/data-warehouse/scd-type-2/',
      '/en/',
      '/en/sql/',
      '/en/tools/',
    ],
  },
  {
    path: '/en/data-warehouse/grain/',
    title: 'Data Warehouse Grain: What Does One Row Represent? | sql.sb',
    heading: 'Data warehouse grain: what does one row represent?',
    links: [
      '/en/',
      '/en/data-warehouse/',
      '/en/sql/sql-join-duplicate-rows/',
      '/en/data-warehouse/scd-type-2/',
    ],
  },
  {
    path: '/en/data-warehouse/idempotent-etl/',
    title: 'How to Make an ETL Job Idempotent: Examples & Trade-offs | sql.sb',
    heading: 'How to make an ETL job idempotent',
    links: [
      '/en/',
      '/en/data-warehouse/',
      '/en/data-warehouse/data-lineage-vs-task-dependency/',
      '/en/data-warehouse/grain/',
    ],
  },
  {
    path: '/en/data-warehouse/data-lineage-vs-task-dependency/',
    title: 'Data Lineage vs Task Dependency: Why the Graphs Differ | sql.sb',
    heading: 'Data lineage vs task dependency: why the two graphs differ',
    links: [
      '/en/',
      '/en/data-warehouse/',
      '/en/data-warehouse/idempotent-etl/',
      '/en/data-warehouse/grain/',
    ],
  },
  {
    path: '/en/data-warehouse/scd-type-2/',
    title: 'SCD Type 2 Example: Effective Dates & Historical Rows | sql.sb',
    heading: 'SCD Type 2 example: effective dates and historical rows',
    links: [
      '/en/',
      '/en/data-warehouse/',
      '/en/data-warehouse/grain/',
      '/en/data-warehouse/idempotent-etl/',
    ],
  },
  {
    path: '/en/tools/',
    title: 'Data Engineering Tools | sql.sb',
    heading: 'Tools for working with data',
    links: ['/en/', '/en/sql/', '/en/data-warehouse/'],
  },
]
const NAV_PATHS = ['/en/', '/en/sql/', '/en/data-warehouse/', '/en/tools/']

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

async function verifyFoundationPage(page, baseUrl, route, viewportName, theme, errors) {
  const response = await page.goto(`${baseUrl}${withBase(route.path)}`, {
    waitUntil: 'networkidle',
  })
  check(
    `${viewportName} ${route.path} static response is 200`,
    response?.status() === 200,
    `status=${response?.status()}`,
  )

  const state = await page.evaluate(() => {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? ''
    const meta = (selector) => document.querySelector(selector)?.getAttribute('content') ?? ''
    const documentElement = document.documentElement
    return {
      lang: documentElement.lang,
      theme: documentElement.dataset.theme,
      title: document.title,
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      description: meta('meta[name="description"]'),
      canonical,
      ogLocale: meta('meta[property="og:locale"]'),
      ogTitle: meta('meta[property="og:title"]'),
      ogDescription: meta('meta[property="og:description"]'),
      ogUrl: meta('meta[property="og:url"]'),
      noindex: /noindex|\bnone\b/i.test(meta('meta[name="robots"]')),
      hreflang: document.querySelector('link[hreflang]') !== null,
      storedLocale: localStorage.getItem('data-warehouse-visualized:locale'),
      width: documentElement.clientWidth,
      scrollWidth: documentElement.scrollWidth,
      mainWidth: document.querySelector('main')?.scrollWidth ?? 0,
      visibleNavLinks: Array.from(document.querySelectorAll('.english-foundation__nav a'))
        .filter((link) => link.getClientRects().length > 0)
        .map((link) => link.getAttribute('href')),
      bodyLinks: Array.from(document.querySelectorAll('main a')).map((link) =>
        link.getAttribute('href'),
      ),
      stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
        (link) => link.sheet !== null,
      ),
    }
  })

  const canonical = `https://sql.sb${route.path}`
  check(`${viewportName} ${route.path} final document lang remains en`, state.lang === 'en')
  check(
    `${viewportName} ${route.path} retains Chinese UI preference`,
    state.storedLocale === 'zh-CN',
  )
  check(`${viewportName} ${route.path} restores theme`, state.theme === theme, state.theme)
  check(`${viewportName} ${route.path} page title`, state.title === route.title, state.title)
  check(`${viewportName} ${route.path} visible English heading`, state.heading === route.heading)
  check(`${viewportName} ${route.path} has description`, state.description.length > 40)
  check(
    `${viewportName} ${route.path} self-canonical`,
    state.canonical === canonical,
    state.canonical,
  )
  check(
    `${viewportName} ${route.path} Open Graph locale`,
    state.ogLocale === 'en_US',
    state.ogLocale,
  )
  check(`${viewportName} ${route.path} Open Graph title`, state.ogTitle === route.title)
  check(`${viewportName} ${route.path} Open Graph description`, state.ogDescription.length > 40)
  check(`${viewportName} ${route.path} Open Graph URL`, state.ogUrl === canonical, state.ogUrl)
  check(`${viewportName} ${route.path} is indexable`, !state.noindex)
  check(`${viewportName} ${route.path} has no hreflang mirror`, !state.hreflang)
  check(
    `${viewportName} ${route.path} no horizontal overflow`,
    state.scrollWidth - state.width <= TOLERANCE && state.mainWidth <= state.width + TOLERANCE,
    `document=${state.scrollWidth} viewport=${state.width} main=${state.mainWidth}`,
  )
  check(
    `${viewportName} ${route.path} English navigation links are visible and BASE_PATH-aware`,
    JSON.stringify(state.visibleNavLinks) === JSON.stringify(NAV_PATHS.map(withBase)),
    JSON.stringify(state.visibleNavLinks),
  )
  check(
    `${viewportName} ${route.path} local stylesheets loaded`,
    state.stylesheets.length > 0 && state.stylesheets.every(Boolean),
    JSON.stringify(state.stylesheets),
  )
  check(`${viewportName} ${route.path} no pageerror`, errors.length === 0, errors.join(' | '))
  errors.length = 0

  for (const link of route.links) {
    check(
      `${viewportName} ${route.path} links to ${link}`,
      state.bodyLinks.includes(withBase(link)),
      JSON.stringify(state.bodyLinks),
    )
  }
}

async function runViewport(browser, viewport, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  const theme = viewport.name === 'desktop-1280x800' ? 'dark' : 'light'
  await page.addInitScript((storedTheme) => {
    if (!localStorage.getItem('data-warehouse-visualized:locale')) {
      localStorage.setItem('data-warehouse-visualized:locale', 'zh-CN')
    }
    if (!localStorage.getItem('data-warehouse-visualized:theme')) {
      localStorage.setItem('data-warehouse-visualized:theme', storedTheme)
    }
  }, theme)

  try {
    const homepageResponse = await page.goto(`${baseUrl}${withBase('/')}`, {
      waitUntil: 'networkidle',
    })
    check(
      `${viewport.name} Chinese homepage response is 200`,
      homepageResponse?.status() === 200,
      `status=${homepageResponse?.status()}`,
    )
    const englishEntry = page.locator(`footer.site-footer a[href="${withBase('/en/')}"]`)
    check(
      `${viewport.name} shared footer has visible English entry`,
      await englishEntry.isVisible(),
    )
    await englishEntry.click()
    await page.waitForURL((url) => url.pathname === withBase('/en/'))
    await page.waitForFunction(() => document.documentElement.lang === 'en')

    for (const route of ENGLISH_ROUTES) {
      await verifyFoundationPage(page, baseUrl, route, viewport.name, theme, errors)
    }

    await page.evaluate(() => {
      localStorage.setItem('data-warehouse-visualized:locale', 'en')
    })
    for (const path of ['/', '/learn/']) {
      const response = await page.goto(`${baseUrl}${withBase(path)}`, { waitUntil: 'networkidle' })
      const state = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
        storedLocale: localStorage.getItem('data-warehouse-visualized:locale'),
      }))
      check(`${viewport.name} ${path} Chinese static response is 200`, response?.status() === 200)
      check(
        `${viewport.name} ${path} keeps document language zh-CN`,
        state.lang === 'zh-CN',
        state.lang,
      )
      check(
        `${viewport.name} ${path} keeps self-canonical`,
        state.canonical === `https://sql.sb${path}`,
      )
      check(
        `${viewport.name} ${path} does not rewrite document lang from UI locale`,
        state.storedLocale === 'en',
      )
    }
  } finally {
    await page.close()
    await context.close()
  }
}

async function main() {
  const browser = await launchChromium()
  let preview = null

  try {
    preview = await startPreview({
      root: ROOT,
      base: externalBase,
      skipBuild,
      scriptName: SCRIPT_NAME,
    })
    console.log(`[${SCRIPT_NAME}] checking static pages against ${preview.baseUrl}`)

    for (const viewport of VIEWPORTS) {
      await runViewport(browser, viewport, preview.baseUrl)
      console.log(`[${SCRIPT_NAME}] ${viewport.name} done`)
    }
  } finally {
    preview?.stop()
    await browser.close()
  }

  if (report(SCRIPT_NAME) > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`[${SCRIPT_NAME}] ERROR`, error)
  process.exitCode = 1
})
