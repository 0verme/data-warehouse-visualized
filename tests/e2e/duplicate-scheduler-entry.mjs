#!/usr/bin/env node
/**
 * Browser evidence for #158's separate duplicate-schedule-entry teaching lab.
 *
 * Runs the actual lesson at desktop and 390px mobile in light and dark themes;
 * exercises old-only, new-only, both-on, idempotent / append targets, old-entry
 * disable cutover, and deterministic reset. Can reuse a built preview via
 * `npm run test:e2e:duplicate-entry -- --skip-build`.
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
const SCRIPT_NAME = 'duplicate-scheduler-entry'
const LESSON_PATH = '/learn/scheduling-rerun/'
const VIEWPORTS = [
  { name: 'desktop-1280x800', ...DESKTOP_VIEWPORT },
  { name: 'mobile-390x844', ...MOBILE_VIEWPORT },
]
const THEMES = ['light', 'dark']
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

async function metric(page, name) {
  return Number(await page.locator(`[data-metric="${name}"] strong`).innerText())
}

async function checkMetricSet(page, tag, expected) {
  for (const [name, value] of Object.entries(expected)) {
    const actual = await metric(page, name)
    check(`${tag} ${name}=${value}`, actual === value, `actual=${actual}`)
  }
}

async function runDate(page, tag, expectedTriggerCount) {
  await page.locator('[data-run-business-date]').click()
  await page.waitForFunction(
    ({ selector, expected }) =>
      Number(document.querySelector(`[data-metric="${selector}"] strong`)?.textContent) ===
      expected,
    { selector: 'triggerCount', expected: expectedTriggerCount },
  )
  check(
    `${tag} run reaches ${expectedTriggerCount} triggers`,
    (await metric(page, 'triggerCount')) === expectedTriggerCount,
  )
}

async function checkNoHorizontalOverflow(page, tag) {
  const layout = await page.evaluate(() => {
    const doc = document.documentElement
    const shell = document.querySelector('.learn-main__scroll')
    const section = document.querySelector('.visualization-section:has([data-duplicate-entry-lab])')
    const lab = document.querySelector('[data-duplicate-entry-lab]')
    return {
      viewport: window.innerWidth,
      document: doc.scrollWidth - window.innerWidth,
      shell: shell ? shell.scrollWidth - shell.clientWidth : null,
      section: section ? section.scrollWidth - section.clientWidth : null,
      lab: lab ? lab.scrollWidth - lab.clientWidth : null,
    }
  })
  check(
    `${tag} no horizontal overflow at all owned levels`,
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

async function runScenario(page, tag) {
  const oldJob = page.locator('[data-entry-toggle="old-job"]')
  const newJob = page.locator('[data-entry-toggle="new-job"]')
  const idempotent = page.locator('[data-target-semantics="idempotent"]')
  const append = page.locator('[data-target-semantics="non-idempotent"]')
  const status = page.locator('[data-duplicate-entry-status]')

  check(
    `${tag} both entries visibly enabled initially`,
    (await oldJob.getAttribute('aria-pressed')) === 'true' &&
      (await newJob.getAttribute('aria-pressed')) === 'true',
  )
  check(
    `${tag} idempotent target selected initially`,
    (await idempotent.getAttribute('aria-pressed')) === 'true',
  )
  checkNoHorizontalOverflow(page, `${tag} initial`)

  await runDate(page, `${tag} both/idempotent`, 2)
  await checkMetricSet(page, `${tag} both/idempotent`, {
    triggerCount: 2,
    executionCount: 2,
    writeCount: 2,
    outputRows: 1,
    fileCount: 2,
    pushCount: 2,
  })
  check(
    `${tag} idempotent data correct but side effects repeat`,
    (await status.innerText()).includes('仍只有 1 行正确结果') &&
      (await status.innerText()).includes('2 个文件') &&
      (await status.innerText()).includes('推送 2 次'),
  )
  check(
    `${tag} two independent run records shown`,
    (await page.locator('.duplicate-scheduler-entry__run-history li').count()) === 2,
  )

  await append.click()
  await checkNoHorizontalOverflow(page, `${tag} append selected`)
  await runDate(page, `${tag} both/append`, 2)
  await checkMetricSet(page, `${tag} both/append`, {
    triggerCount: 2,
    executionCount: 2,
    writeCount: 2,
    outputRows: 2,
    fileCount: 2,
    pushCount: 2,
  })
  check(
    `${tag} append consequence is explicit`,
    (await status.innerText()).includes('1 行重复数据') &&
      (await status.innerText()).includes('接口推送'),
  )

  await oldJob.click()
  await checkNoHorizontalOverflow(page, `${tag} old entry disabled`)
  await runDate(page, `${tag} new-only cutover`, 1)
  await checkMetricSet(page, `${tag} new-only cutover`, {
    triggerCount: 1,
    executionCount: 1,
    writeCount: 1,
    outputRows: 1,
    fileCount: 1,
    pushCount: 1,
  })
  check(
    `${tag} disabling old entry removes duplicate run`,
    (await page.locator('.duplicate-scheduler-entry__run-history li').count()) === 1 &&
      (await status.innerText()).includes('只有一个有效入口'),
  )

  await newJob.click()
  await oldJob.click()
  await runDate(page, `${tag} old-only`, 1)
  check(
    `${tag} old-only run is attributed to old entry`,
    (await page.locator('.duplicate-scheduler-entry__run-history li strong').innerText()) ===
      '旧入口触发',
  )

  await oldJob.click()
  await newJob.click()
  await runDate(page, `${tag} new-only`, 1)
  check(
    `${tag} new-only run is attributed to new entry`,
    (await page.locator('.duplicate-scheduler-entry__run-history li strong').innerText()) ===
      '新入口触发',
  )

  await page.getByRole('button', { name: '重置实验' }).click()
  check(
    `${tag} reset returns both schedules to ON`,
    (await oldJob.getAttribute('aria-pressed')) === 'true' &&
      (await newJob.getAttribute('aria-pressed')) === 'true',
  )
  check(
    `${tag} reset selects idempotent target and clears prior outputs`,
    (await idempotent.getAttribute('aria-pressed')) === 'true' &&
      (await metric(page, 'triggerCount')) === 0 &&
      (await page.locator('[data-run-business-date]').isEnabled()),
  )
  await runDate(page, `${tag} reset deterministic pass 1`, 2)
  const firstResetRecords = await page
    .locator('.duplicate-scheduler-entry__run-history')
    .innerText()
  await checkMetricSet(page, `${tag} reset deterministic pass 1`, {
    triggerCount: 2,
    executionCount: 2,
    writeCount: 2,
    outputRows: 1,
    fileCount: 2,
    pushCount: 2,
  })
  await page.getByRole('button', { name: '重置实验' }).click()
  await runDate(page, `${tag} reset deterministic pass 2`, 2)
  const secondResetRecords = await page
    .locator('.duplicate-scheduler-entry__run-history')
    .innerText()
  check(`${tag} reset reproduces identical run history`, firstResetRecords === secondResetRecords)
  await checkMetricSet(page, `${tag} reset deterministic pass 2`, {
    triggerCount: 2,
    executionCount: 2,
    writeCount: 2,
    outputRows: 1,
    fileCount: 2,
    pushCount: 2,
  })
  checkNoHorizontalOverflow(page, `${tag} after interactions`)
}

async function runViewportTheme(browser, viewport, theme, baseUrl) {
  const tag = `${viewport.name}/${theme}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: theme,
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}${LESSON_PATH}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-duplicate-entry-lab]', { timeout: 15_000 })
    await page.locator('html').evaluate((element, selectedTheme) => {
      element.setAttribute('data-theme', selectedTheme)
    }, theme)
    check(
      `${tag} requested theme is active`,
      (await page.locator('html').getAttribute('data-theme')) === theme,
    )
    check(
      `${tag} double-entry state is clearly labeled`,
      (await page.locator('.duplicate-scheduler-entry__sources article.is-enabled').count()) ===
        2 &&
        (await page.getByRole('heading', { name: '两个有效 JOB，指向同一生产逻辑' }).count()) === 1,
    )
    await runScenario(page, tag)
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
