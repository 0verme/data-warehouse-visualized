#!/usr/bin/env node
/**
 * Browser contract for the crawlable /en/ entry across Chinese site headers and
 * the Learn mobile directory menu.
 *
 * Usage:
 *   npm run test:e2e:english-discovery
 *   npm run test:e2e:english-discovery -- --skip-build
 *   npm run test:e2e:english-discovery -- --base http://127.0.0.1:4321
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'english-header-discovery'
const rawBasePath = process.env.BASE_PATH || '/'
const mountPath = rawBasePath === '/' ? '' : `/${rawBasePath.split('/').filter(Boolean).join('/')}`
const withBase = (path) => `${mountPath}${path}` || '/'
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'Learn index', path: '/learn/' },
  { name: 'lesson detail', path: '/learn/data-modeling/' },
  { name: 'Roadmap', path: '/roadmap/' },
]
const VIEWPORTS = [
  { name: 'desktop 1280x800', width: 1280, height: 800 },
  { name: 'mobile 390x844', width: 390, height: 844 },
  { name: 'mobile 320x720', width: 320, height: 720 },
]
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

async function inspectLink(page, selector) {
  return page.locator(selector).evaluate((link) => ({
    tag: link.tagName,
    href: link.getAttribute('href'),
    target: link.getAttribute('target'),
    rel: link.getAttribute('rel') ?? '',
    label: link.textContent?.trim() ?? '',
    visible: getComputedStyle(link).display !== 'none' && link.getClientRects().length > 0,
    bounds: (() => {
      const rect = link.getBoundingClientRect()
      return { x: rect.x, right: rect.right, width: rect.width, height: rect.height }
    })(),
  }))
}

async function inspectOverflow(page) {
  return page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
}

async function runPage(browser, viewport, route, baseUrl) {
  const tag = `${viewport.name} ${route.name}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    const response = await page.goto(`${baseUrl}${withBase(route.path)}`, {
      waitUntil: 'networkidle',
    })
    const selector = '.learn-topbar__actions .english-entry-link'
    await page.locator(selector).waitFor({ state: 'attached' })
    const link = await inspectLink(page, selector)
    const overflow = await inspectOverflow(page)

    check(`${tag} route responds 200`, response?.status() === 200, `status=${response?.status()}`)
    check(
      `${tag} Header exposes ordinary /en/ anchor`,
      link.tag === 'A' && link.href === withBase('/en/') && link.label === 'EN',
      JSON.stringify(link),
    )
    check(
      `${tag} Header link has no target or nofollow`,
      link.target === null && !link.rel.toLowerCase().split(/\s+/).includes('nofollow'),
      JSON.stringify(link),
    )
    const expectedHeaderVisibility = viewport.width > 900 || !route.path.startsWith('/learn/')
    check(
      `${tag} Header EN visibility matches responsive layout`,
      link.visible === expectedHeaderVisibility,
      JSON.stringify({ expectedHeaderVisibility, ...link }),
    )
    check(
      `${tag} no horizontal overflow`,
      overflow.scrollWidth <= overflow.width + 1 && overflow.bodyScrollWidth <= overflow.width + 1,
      JSON.stringify(overflow),
    )

    if (viewport.width <= 900 && route.path.startsWith('/learn/')) {
      await page.locator('.sidebar-toggle').click()
      await page.locator('.course-sidebar.is-open').waitFor()
      const menuSelector = '.course-sidebar__english-link'
      const menuLink = await inspectLink(page, menuSelector)
      const sidebarBounds = await page.locator('.course-sidebar').evaluate((sidebar) => ({
        scrollWidth: sidebar.scrollWidth,
        clientWidth: sidebar.clientWidth,
        right: sidebar.getBoundingClientRect().right,
      }))

      check(
        `${tag} mobile Learn menu exposes ordinary /en/ anchor`,
        menuLink.tag === 'A' &&
          menuLink.href === withBase('/en/') &&
          menuLink.label === 'English' &&
          menuLink.visible,
        JSON.stringify(menuLink),
      )
      check(
        `${tag} mobile menu anchor has no target or nofollow`,
        menuLink.target === null && !menuLink.rel.toLowerCase().split(/\s+/).includes('nofollow'),
        JSON.stringify(menuLink),
      )
      check(
        `${tag} mobile menu stays within viewport`,
        sidebarBounds.scrollWidth <= sidebarBounds.clientWidth + 1 &&
          sidebarBounds.right <= viewport.width + 1,
        JSON.stringify(sidebarBounds),
      )

      if (route.path === '/learn/' && viewport.width === 390) {
        await Promise.all([
          page.waitForURL((url) => url.pathname === withBase('/en/')),
          page.locator(menuSelector).click(),
        ])
        const englishHome = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          heading: document.querySelector('h1')?.textContent?.trim() ?? '',
        }))
        check(
          `${tag} mobile menu link enters English center`,
          englishHome.lang === 'en' && /SQL and data engineering/.test(englishHome.heading),
          JSON.stringify({ pathname: new URL(page.url()).pathname, ...englishHome }),
        )
      }
    }

    check(`${tag} no pageerror`, errors.length === 0, errors.join(' | '))
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
    console.log(`[${SCRIPT_NAME}] checking Chinese header links against ${preview.baseUrl}`)

    for (const viewport of VIEWPORTS) {
      for (const route of PAGES) {
        await runPage(browser, viewport, route, preview.baseUrl)
      }
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
