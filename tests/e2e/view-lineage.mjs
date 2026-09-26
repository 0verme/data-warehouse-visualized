#!/usr/bin/env node
/** Focused browser check for Issue #161: View lineage disclosure and responsive layout. */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'view-lineage'
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const viewports = [
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-320x720', width: 320, height: 720 },
]
const { check, report } = createChecker()

async function setTheme(page, theme) {
  const current = await page.locator('html').getAttribute('data-theme')
  if (current !== theme) await page.locator('.theme-toggle').click()
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
  )
}

async function clickVisibleLessonLink(page, slug) {
  const links = await page.locator(`a[href$="/learn/${slug}/"]`).all()
  for (const link of links) {
    if (await link.isVisible()) {
      await link.click()
      return
    }
  }
  throw new Error(`Could not find a visible lesson link for ${slug}`)
}

async function checkNoHorizontalOverflow(page, label) {
  const geometry = await page.evaluate(() => {
    const section = document.querySelector('.visualization-section')
    return {
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      sectionClient: section?.clientWidth ?? 0,
      sectionScroll: section?.scrollWidth ?? 0,
    }
  })
  check(
    `${label}: document has no horizontal viewport overflow`,
    geometry.document <= geometry.viewport,
    JSON.stringify(geometry),
  )
  check(
    `${label}: visualization has no horizontal overflow`,
    geometry.sectionScroll <= geometry.sectionClient + 1,
    JSON.stringify(geometry),
  )
}

async function main() {
  const browser = await launchChromium()
  const preview = await startPreview({
    root: ROOT,
    base: externalBase,
    skipBuild,
    scriptName: SCRIPT_NAME,
  })
  const baseUrl = preview.baseUrl
  const themeBackgrounds = new Map()

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const page = await context.newPage()
      const errors = trackPageErrors(page)
      try {
        await page.goto(`${baseUrl}/learn/data-lineage/`)
        await page.locator('[data-perspective="sql-lineage"]').waitFor()

        for (const theme of ['light', 'dark']) {
          await setTheme(page, theme)
          const panel = page.locator('[data-perspective="sql-lineage"]')
          const toggle = panel.locator('.lineage-view-dependency__toggle')
          const sources = panel.locator('[data-view-sql-upstream]')
          check(
            `${viewport.name} ${theme}: collapsed button reports false`,
            (await toggle.getAttribute('aria-expanded')) === 'false',
          )
          check(
            `${viewport.name} ${theme}: SQL source branch starts hidden`,
            await sources.isHidden(),
          )
          check(
            `${viewport.name} ${theme}: button offers expansion`,
            (await toggle.textContent())?.includes('展开真实依赖'),
          )

          const background = await panel.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          )
          themeBackgrounds.set(`${viewport.name}-${theme}`, background)

          await toggle.click()
          check(
            `${viewport.name} ${theme}: expands real SQL sources`,
            (await toggle.getAttribute('aria-expanded')) === 'true' && !(await sources.isHidden()),
          )
          check(
            `${viewport.name} ${theme}: expanded path contains both sources`,
            (await sources.innerText()).includes('Customer') &&
              (await sources.innerText()).includes('Account'),
          )
          await checkNoHorizontalOverflow(page, `${viewport.name} ${theme} expanded`)

          await toggle.click()
          check(
            `${viewport.name} ${theme}: collapses real SQL sources`,
            (await toggle.getAttribute('aria-expanded')) === 'false' && (await sources.isHidden()),
          )
          await checkNoHorizontalOverflow(page, `${viewport.name} ${theme} collapsed`)
        }

        if (viewport.width === 1280) {
          await setTheme(page, 'dark')
          await page.locator('.lineage-view-dependency__toggle').click()
          await clickVisibleLessonLink(page, 'data-lineage-fields')
          await page.waitForURL(/data-lineage-fields\/?$/)
          await clickVisibleLessonLink(page, 'data-lineage')
          await page.waitForURL(/data-lineage\/?$/)
          await page.locator('[data-perspective="sql-lineage"]').waitFor()
          const returnedToggle = page.locator('.lineage-view-dependency__toggle')
          const returnedSources = page.locator(
            '[data-perspective="sql-lineage"] [data-view-sql-upstream]',
          )
          check(
            'switching courses resets the disclosure to collapsed',
            (await returnedToggle.getAttribute('aria-expanded')) === 'false' &&
              (await returnedSources.isHidden()),
          )
        }

        check(
          `${viewport.name}: no uncaught browser errors`,
          errors.length === 0,
          errors.join(' | '),
        )
      } finally {
        await page.close()
        await context.close()
      }
      console.log(`[${SCRIPT_NAME}] ${viewport.name} complete`)
    }

    for (const viewport of viewports) {
      const light = themeBackgrounds.get(`${viewport.name}-light`)
      const dark = themeBackgrounds.get(`${viewport.name}-dark`)
      check(
        `${viewport.name}: light and dark themes render distinct panel surfaces`,
        Boolean(light && dark && light !== dark),
        `light=${light}; dark=${dark}`,
      )
    }
  } finally {
    await browser.close()
    preview.stop()
  }

  if (report(SCRIPT_NAME) > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
