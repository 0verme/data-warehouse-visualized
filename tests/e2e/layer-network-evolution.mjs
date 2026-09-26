#!/usr/bin/env node
/**
 * Focused browser journey for the Chapter 01 production layer-evolution lesson.
 *
 * Usage:
 *   npm run test:e2e:layers
 *   npm run test:e2e:layers -- --skip-build
 *   npm run test:e2e:layers -- --base http://127.0.0.1:4321
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const baseIndex = args.indexOf('--base')
const base = baseIndex >= 0 ? args[baseIndex + 1] : null
const checker = createChecker()
let preview
let browser

async function waitForTheme(page, theme) {
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
  )
  await page.waitForTimeout(200)
}

async function scrollLessonToTop(page) {
  await page.locator('.learn-main__scroll').evaluate((element) => {
    element.scrollTop = 0
  })
}

try {
  preview = await startPreview({
    root: ROOT,
    base,
    skipBuild: args.includes('--skip-build'),
    scriptName: 'layer-network-evolution',
  })
  browser = await launchChromium()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const pageErrors = trackPageErrors(page)
  const lessonUrl = `${preview.baseUrl}/learn/warehouse-layers/`

  await page.goto(lessonUrl)
  await page.locator('.layer-evolution__phase-choices').waitFor()
  checker.check(
    'ideal phase is the initial state',
    (await page.getByRole('button', { name: /理想结构/ }).getAttribute('aria-pressed')) === 'true',
  )
  checker.check(
    'ideal diagram starts with the shared-processing example',
    (await page.locator('.layer-evolution__diagram.is-shared').count()) === 1,
  )

  await page.getByRole('button', { name: /多年叠加/ }).click()
  const accumulatedGraph = page.locator('[data-layer-network-stage="accumulated"]')
  await accumulatedGraph.waitFor()
  checker.check(
    'accumulated graph shows eight separate dependencies',
    (await accumulatedGraph.locator('.layer-network__edge').count()) === 8,
  )
  checker.check(
    'accumulated graph includes cross-layer and temporary links',
    (await accumulatedGraph.locator('[data-edge-kind="cross-layer"]').count()) === 2 &&
      (await accumulatedGraph.locator('[data-edge-kind="temporary"]').count()) === 2,
  )

  await page.getByRole('button', { name: /渐进治理/ }).click()
  const governedGraph = page.locator('[data-layer-network-stage="governance"]')
  await governedGraph.waitFor()
  checker.check(
    'governance removes the duplicated temporary path, not every cross-layer read',
    (await governedGraph.locator('[data-edge-kind="temporary"]').count()) === 0 &&
      (await governedGraph.locator('[data-edge-kind="cross-layer"]').count()) === 2,
  )
  checker.check(
    'governance marks one path as reused and converged',
    (await governedGraph.locator('[data-edge-id="summary-partner-api"]').count()) === 1,
  )
  checker.check(
    'governance shows the optional new-link agreement',
    (await governedGraph.locator('.layer-network__new-link ol li').count()) === 3,
  )

  const desktopGeometry = await page.evaluate(() => {
    const scroll = document.querySelector('.learn-main__scroll')
    const rows = [...document.querySelectorAll('.layer-network__edge')]
    return {
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      lessonOverflow: scroll ? scroll.scrollWidth > scroll.clientWidth + 1 : true,
      rowOverflow: rows.some((row) => row.getBoundingClientRect().right > window.innerWidth + 1),
    }
  })
  checker.check(
    'desktop network has no horizontal overflow',
    !desktopGeometry.pageOverflow &&
      !desktopGeometry.lessonOverflow &&
      !desktopGeometry.rowOverflow,
  )

  await page.screenshot({ path: '/tmp/issue-157-desktop-light.png' })
  await page.locator('.theme-toggle').click()
  await waitForTheme(page, 'dark')
  checker.check(
    'desktop dark theme is applied',
    (await page.locator('html').getAttribute('data-theme')) === 'dark',
  )
  await page.screenshot({ path: '/tmp/issue-157-desktop-dark.png' })

  await page.locator('.lesson-nav__link--previous').click()
  await page.waitForURL('**/learn/why-data-warehouse/')
  checker.check(
    'previous lesson navigation reaches chapter 01-1',
    new URL(page.url()).pathname.endsWith('/learn/why-data-warehouse/'),
  )
  await page.locator('.lesson-nav__link--next').click()
  await page.waitForURL('**/learn/warehouse-layers/')
  checker.check(
    'next lesson navigation returns to chapter 01-2',
    new URL(page.url()).pathname.endsWith('/learn/warehouse-layers/'),
  )

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const mobilePageErrors = trackPageErrors(mobilePage)
  await mobilePage.goto(lessonUrl)
  await mobilePage.locator('.layer-evolution__phase-choices').waitFor()
  await scrollLessonToTop(mobilePage)
  if ((await mobilePage.locator('html').getAttribute('data-theme')) !== 'light') {
    await mobilePage.locator('.theme-toggle').click()
    await waitForTheme(mobilePage, 'light')
  }
  await mobilePage.getByRole('button', { name: /多年叠加/ }).click()
  await mobilePage.locator('[data-layer-network-stage="accumulated"]').waitFor()
  await mobilePage.waitForTimeout(200)
  await scrollLessonToTop(mobilePage)

  const mobileGeometry = async () =>
    mobilePage.evaluate(() => {
      const scroll = document.querySelector('.learn-main__scroll')
      const bounds = [...document.querySelectorAll('.layer-network__edge')].map((row) => {
        const rect = row.getBoundingClientRect()
        return rect.left >= -1 && rect.right <= window.innerWidth + 1
      })
      return {
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        lessonOverflow: scroll ? scroll.scrollWidth > scroll.clientWidth + 1 : true,
        rowsFit: bounds.length > 0 && bounds.every(Boolean),
      }
    })

  const mobileLight = await mobileGeometry()
  checker.check(
    '390px light theme keeps the dependency list readable without horizontal overflow',
    !mobileLight.pageOverflow && !mobileLight.lessonOverflow && mobileLight.rowsFit,
  )
  await mobilePage.screenshot({ path: '/tmp/issue-157-mobile-light.png' })

  await mobilePage.locator('.theme-toggle').click()
  await waitForTheme(mobilePage, 'dark')
  await mobilePage.getByRole('button', { name: /渐进治理/ }).click()
  await mobilePage.locator('[data-layer-network-stage="governance"]').waitFor()
  await mobilePage.waitForTimeout(200)
  await scrollLessonToTop(mobilePage)
  const mobileDark = await mobileGeometry()
  checker.check(
    '390px dark theme retains the governed state without horizontal overflow',
    !mobileDark.pageOverflow && !mobileDark.lessonOverflow && mobileDark.rowsFit,
  )
  await mobilePage.screenshot({ path: '/tmp/issue-157-mobile-dark.png' })

  await mobilePage.setViewportSize({ width: 320, height: 720 })
  await scrollLessonToTop(mobilePage)
  await mobilePage.getByRole('button', { name: /多年叠加/ }).click()
  await mobilePage.locator('[data-layer-network-stage="accumulated"]').waitFor()
  await mobilePage.waitForTimeout(200)
  await scrollLessonToTop(mobilePage)
  const narrowMobileGeometry = await mobileGeometry()
  checker.check(
    '320px view stacks dependency endpoints without horizontal overflow',
    !narrowMobileGeometry.pageOverflow &&
      !narrowMobileGeometry.lessonOverflow &&
      narrowMobileGeometry.rowsFit,
  )
  await mobilePage.screenshot({ path: '/tmp/issue-157-mobile-320-dark.png' })

  const browserErrors = [...pageErrors, ...mobilePageErrors]
  checker.check('no uncaught browser errors', browserErrors.length === 0, browserErrors.join('; '))
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await browser?.close()
  preview?.stop()
}

if (checker.report('layer-network-evolution') > 0) {
  process.exitCode = 1
}
