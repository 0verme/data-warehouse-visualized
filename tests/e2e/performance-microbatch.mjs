#!/usr/bin/env node
/**
 * Browser journey for #163's local 11-5 microbatch strategy lab.
 *
 * Covers the same late-arrival/update input across fixed windows, checkpoint
 * retries and daily rescans, plus responsive geometry and theme checks.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TOLERANCE,
  createChecker,
  launchChromium,
  startPreview,
  trackPageErrors,
} from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'performance-microbatch'
const LESSON_PATH = '/learn/performance-tradeoffs/'
const VIEWPORTS = [
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-320x720', width: 320, height: 720 },
]
const THEMES = ['light', 'dark']
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

function strategy(page, id) {
  return page.locator(`[data-microbatch-strategy="${id}"]`)
}

async function checkNoHorizontalOverflow(page, tag) {
  const layout = await page.evaluate(() => {
    const doc = document.documentElement
    const shell = document.querySelector('.learn-main__scroll')
    const section = document.querySelector('.visualization-section:has([data-microbatch-lab])')
    const lab = document.querySelector('[data-microbatch-lab]')
    return {
      viewport: window.innerWidth,
      document: Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      shell: shell ? shell.scrollWidth - shell.clientWidth : null,
      section: section ? section.scrollWidth - section.clientWidth : null,
      lab: lab ? lab.scrollWidth - lab.clientWidth : null,
    }
  })
  check(
    `${tag} no horizontal overflow in document / Learn shell / lesson / lab`,
    layout.document <= TOLERANCE &&
      layout.shell !== null &&
      layout.shell <= TOLERANCE &&
      layout.section !== null &&
      layout.section <= TOLERANCE &&
      layout.lab !== null &&
      layout.lab <= TOLERANCE,
    JSON.stringify(layout),
  )
}

async function checkFeedbackProximity(page, actionName, feedbackSelector, tag) {
  const gap = await page
    .locator(`[data-microbatch-action="${actionName}"]`)
    .evaluate((button, selector) => {
      const feedback = document.querySelector(selector)
      if (!feedback) return Number.POSITIVE_INFINITY
      const buttonRect = button.getBoundingClientRect()
      const feedbackRect = feedback.getBoundingClientRect()
      return Math.max(0, feedbackRect.top - buttonRect.bottom)
    }, feedbackSelector)
  check(`${tag} ${actionName} action has nearby feedback`, gap <= 24, `gap=${gap}px`)
}

async function runUpsertJourney(page, tag) {
  const first = page.locator('[data-microbatch-action="first"]')
  const inject = page.locator('[data-microbatch-action="inject"]')
  const next = page.locator('[data-microbatch-action="next"]')
  const status = page.locator('[data-microbatch-status]')

  check(
    `${tag} all three strategies use the same fixture`,
    (await page.locator('[data-microbatch-strategy]').count()) === 3,
  )
  check(
    `${tag} input starts with three visible changes`,
    (await page.locator('[data-transaction-change]').count()) === 3,
  )
  check(
    `${tag} idempotent upsert starts selected`,
    (await page.locator('[data-microbatch-write-mode="upsert"]').getAttribute('aria-pressed')) ===
      'true',
  )

  const boundarySetting = page.locator('[data-microbatch-window-boundary]')
  const arrivalSetting = page.locator('[data-microbatch-late-arrival]')
  await boundarySetting.selectOption('10:04')
  await arrivalSetting.selectOption('10:12')
  check(
    `${tag} window boundary and arrival lateness can be adjusted before execution`,
    (await boundarySetting.inputValue()) === '10:04' &&
      (await arrivalSetting.inputValue()) === '10:12' &&
      (await page.locator('[data-microbatch-boundary]').innerText()).includes('10:00–10:04'),
  )
  await boundarySetting.selectOption('10:05')
  await arrivalSetting.selectOption('10:08')

  await first.click()
  check(
    `${tag} first run reads both adjacent fixed windows`,
    (await strategy(page, 'fixed-window').locator('[data-microbatch-scope]').innerText()).includes(
      '10:00–10:05 + 10:05–10:10',
    ),
  )
  check(
    `${tag} exact boundary Transaction lands in second window`,
    (await page.locator('.performance-microbatch__boundary-note').innerText()).includes(
      '10:05–10:10',
    ),
  )
  check(
    `${tag} checkpoint captures initial time and ID`,
    (await strategy(page, 'checkpoint').locator('[data-microbatch-checkpoint]').innerText()) ===
      '10:05 / change-003-v1',
  )
  check(
    `${tag} strategy parameters lock after first execution`,
    (await boundarySetting.isDisabled()) && (await arrivalSetting.isDisabled()),
  )
  await checkNoHorizontalOverflow(page, `${tag} first run`)

  await inject.click()
  check(
    `${tag} late arrival and update are visible`,
    (await page.locator('[data-transaction-change]').count()) === 5,
  )
  check(
    `${tag} late row separates event and arrival time`,
    (await page.locator('[data-transaction-change="change-004-v1"]').innerText()).includes(
      '发生 10:04',
    ) &&
      (await page.locator('[data-transaction-change="change-004-v1"]').innerText()).includes(
        '到达 / 更新 10:08',
      ),
  )
  await next.click()
  await checkFeedbackProximity(page, 'next', '[data-microbatch-status]', tag)

  check(
    `${tag} fixed next window leaves late data and update unresolved`,
    (await strategy(page, 'fixed-window')
      .locator('[data-microbatch-missing]')
      .getAttribute('data-microbatch-missing')) === 'TX-1004' &&
      (await strategy(page, 'fixed-window')
        .locator('[data-microbatch-stale]')
        .getAttribute('data-microbatch-stale')) === 'TX-1001',
  )
  check(
    `${tag} checkpoint consumes two post-cursor changes and advances`,
    (await strategy(page, 'checkpoint').locator('[data-microbatch-checkpoint]').innerText()) ===
      '10:09 / change-001-v2' &&
      (
        await strategy(page, 'checkpoint').locator('[data-microbatch-last-read]').innerText()
      ).includes('2 / 2'),
  )
  check(
    `${tag} daily rescan catches latest four Transactions at seven cumulative rows`,
    (await strategy(page, 'daily-rescan').locator('[data-microbatch-scanned]').innerText()) ===
      '7 条源记录' &&
      (await strategy(page, 'daily-rescan')
        .locator('[data-microbatch-output-rows]')
        .getAttribute('data-microbatch-output-rows')) === '4',
  )
  await checkNoHorizontalOverflow(page, `${tag} after next batch`)

  await page.locator('[data-microbatch-action="backfill"]').click()
  await checkFeedbackProximity(
    page,
    'backfill',
    '[data-microbatch-strategy="fixed-window"] [data-microbatch-feedback]',
    tag,
  )
  check(
    `${tag} fixed-window backfill restores the current four-row result`,
    (await strategy(page, 'fixed-window')
      .locator('[data-microbatch-output-rows]')
      .getAttribute('data-microbatch-output-rows')) === '4' &&
      (await strategy(page, 'fixed-window')
        .locator('[data-microbatch-missing]')
        .getAttribute('data-microbatch-missing')) === '' &&
      (await strategy(page, 'fixed-window')
        .locator('[data-microbatch-stale]')
        .getAttribute('data-microbatch-stale')) === '',
  )

  await page.locator('[data-microbatch-action="retry"]').click()
  await checkFeedbackProximity(
    page,
    'retry',
    '[data-microbatch-strategy="checkpoint"] [data-microbatch-feedback]',
    tag,
  )
  check(
    `${tag} checkpoint retry re-reads while upsert prevents duplicate output`,
    (await strategy(page, 'checkpoint').locator('[data-microbatch-scanned]').innerText()) ===
      '7 条源记录' &&
      (await strategy(page, 'checkpoint')
        .locator('[data-microbatch-duplicates]')
        .getAttribute('data-microbatch-duplicates')) === '0',
  )

  await page.locator('[data-microbatch-action="rescan"]').click()
  await checkFeedbackProximity(
    page,
    'rescan',
    '[data-microbatch-strategy="daily-rescan"] [data-microbatch-feedback]',
    tag,
  )
  check(
    `${tag} repeated daily rescan grows scan count without upsert duplicates`,
    (await strategy(page, 'daily-rescan').locator('[data-microbatch-scanned]').innerText()) ===
      '11 条源记录' &&
      (await strategy(page, 'daily-rescan')
        .locator('[data-microbatch-duplicates]')
        .getAttribute('data-microbatch-duplicates')) === '0',
  )
  check(
    `${tag} status explains that all strategies ran`,
    (await status.innerText()).includes('第二次运行完成'),
  )
  await checkNoHorizontalOverflow(page, `${tag} after strategy-specific recovery`)
}

async function runAppendJourney(page, tag) {
  await page.locator('[data-microbatch-action="reset"]').click()
  await page.locator('[data-microbatch-write-mode="append"]').click()
  check(
    `${tag} append target selected before execution`,
    (await page.locator('[data-microbatch-write-mode="append"]').getAttribute('aria-pressed')) ===
      'true',
  )
  await page.locator('[data-microbatch-action="first"]').click()
  await page.locator('[data-microbatch-action="inject"]').click()
  await page.locator('[data-microbatch-action="next"]').click()
  await page.locator('[data-microbatch-action="backfill"]').click()
  await page.locator('[data-microbatch-action="retry"]').click()
  await page.locator('[data-microbatch-action="rescan"]').click()

  const expected = {
    'fixed-window': { rows: '8', duplicates: '4' },
    checkpoint: { rows: '7', duplicates: '3' },
    'daily-rescan': { rows: '11', duplicates: '7' },
  }
  for (const [id, result] of Object.entries(expected)) {
    check(
      `${tag} append ${id} exposes repeated output rows`,
      (await strategy(page, id)
        .locator('[data-microbatch-output-rows]')
        .getAttribute('data-microbatch-output-rows')) === result.rows &&
        (await strategy(page, id)
          .locator('[data-microbatch-duplicates]')
          .getAttribute('data-microbatch-duplicates')) === result.duplicates,
    )
  }
  await checkNoHorizontalOverflow(page, `${tag} append and replay`)
}

async function runViewportTheme(browser, viewport, theme, baseUrl, { reducedMotion = false } = {}) {
  const tag = `${viewport.name}/${theme}${reducedMotion ? '/reduced-motion' : ''}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: theme,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}${LESSON_PATH}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-microbatch-lab]', { timeout: 15_000 })
    await page.locator('html').evaluate((element, selectedTheme) => {
      element.setAttribute('data-theme', selectedTheme)
    }, theme)
    check(
      `${tag} requested theme is active`,
      (await page.locator('html').getAttribute('data-theme')) === theme,
    )
    if (reducedMotion) {
      check(
        `${tag} reduced-motion media preference is active`,
        await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      )
    }
    await checkNoHorizontalOverflow(page, `${tag} initial`)
    await runUpsertJourney(page, tag)
    if (viewport.width === 1280 && theme === 'light' && !reducedMotion) {
      await runAppendJourney(page, tag)
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
    console.log(`[${SCRIPT_NAME}] testing ${preview.baseUrl}`)

    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await runViewportTheme(browser, viewport, theme, preview.baseUrl)
        console.log(`[${SCRIPT_NAME}] ${viewport.name}/${theme} done`)
      }
    }
    await runViewportTheme(browser, VIEWPORTS[1], 'dark', preview.baseUrl, { reducedMotion: true })
    console.log(`[${SCRIPT_NAME}] mobile-390x844/dark/reduced-motion done`)
  } finally {
    await browser.close()
    preview?.stop()
  }

  if (report(SCRIPT_NAME) > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
