#!/usr/bin/env node
/**
 * Focused browser journey for the Chapter 05 date-semantics experiment (#159).
 *
 * Usage:
 *   npm run test:e2e:date-semantics
 *   npm run test:e2e:date-semantics -- --skip-build
 *   npm run test:e2e:date-semantics -- --base http://127.0.0.1:4321
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

const expectedScenarios = [
  {
    id: 'nightly-t1',
    label: '夜间 T-1 日批',
    currentDate: '2026-09-27',
    scheduleDate: '2026-09-27',
    businessDate: '2026-09-26',
    partition: '2026-09-26',
  },
  {
    id: 'same-day',
    label: '当日微批',
    currentDate: '2026-09-27',
    scheduleDate: '2026-09-27',
    businessDate: '2026-09-27',
    partition: '2026-09-27',
  },
  {
    id: 'late-retry',
    label: '迟到后跨日 Retry',
    currentDate: '2026-09-28',
    scheduleDate: '2026-09-27',
    businessDate: '2026-09-26',
    partition: '2026-09-26',
  },
  {
    id: 'next-day-rerun',
    label: '次日 Rerun',
    currentDate: '2026-09-28',
    scheduleDate: '2026-09-28',
    businessDate: '2026-09-26',
    partition: '2026-09-26',
  },
  {
    id: 'cross-day-backfill',
    label: '跨日 Backfill',
    currentDate: '2026-09-28',
    scheduleDate: '2026-09-28',
    businessDate: '2026-09-25',
    partition: '2026-09-25',
  },
]

async function waitForTheme(page, theme) {
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
  )
}

async function selectScenario(page, scenario, label) {
  const lab = page.locator('[data-date-semantics-lab]')
  await lab
    .locator('.scheduler-date-semantics__scenario')
    .filter({ hasText: scenario.label })
    .click()
  checker.check(
    `${label}: ${scenario.label} is selected`,
    (await lab.getAttribute('data-date-scenario')) === scenario.id,
  )

  for (const [field, value] of [
    ['currentDate', scenario.currentDate],
    ['scheduleDate', scenario.scheduleDate],
    ['businessDate', scenario.businessDate],
  ]) {
    const actual = await lab.locator(`[data-date-field="${field}"] + dd`).innerText()
    checker.check(
      `${label}: ${scenario.label} ${field}`,
      actual === value,
      `expected ${value}, got ${actual}`,
    )
  }

  const partition = lab.locator('.scheduler-date-semantics__partition')
  checker.check(
    `${label}: ${scenario.label} target partition follows biz_date`,
    (await partition.getAttribute('data-date-partition-value')) === scenario.partition &&
      (await partition.getAttribute('data-partition-aligned')) === 'true',
  )
}

async function checkNoOverflow(page, label) {
  const geometry = await page.evaluate(() => {
    const selectors = [
      'html',
      'body',
      '.learn-main__scroll',
      '.visualization-section',
      '[data-date-semantics-lab]',
    ]
    return selectors.map((selector) => {
      const element = document.querySelector(selector)
      return element
        ? { selector, overflow: element.scrollWidth > element.clientWidth + 1 }
        : { selector, overflow: false }
    })
  })
  checker.check(
    `${label}: no horizontal viewport/container overflow`,
    geometry.every((item) => !item.overflow),
    JSON.stringify(geometry),
  )
}

try {
  preview = await startPreview({
    root: ROOT,
    base,
    skipBuild: args.includes('--skip-build'),
    scriptName: 'scheduler-date-semantics',
  })
  browser = await launchChromium()
  const lessonUrl = `${preview.baseUrl}/learn/scheduling-system/`
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const desktopErrors = trackPageErrors(desktop)
  await desktop.goto(lessonUrl)
  const desktopLab = desktop.locator('[data-date-semantics-lab]')
  await desktopLab.waitFor()
  checker.check(
    'the experiment is mounted alongside the existing Scheduler timeline',
    (await desktop.locator('.scheduler-time-semantics__timeline').count()) === 1,
  )
  checker.check(
    'initial Wall Clock is explicitly shown in Asia/Shanghai',
    (await desktopLab.locator('[data-date-field="wallClock"] + dd').innerText()).includes(
      '2026-09-27 01:00 · Asia/Shanghai',
    ),
  )

  for (const scenario of expectedScenarios) {
    await selectScenario(desktop, scenario, 'desktop light')
    await checkNoOverflow(desktop, `desktop light / ${scenario.id}`)
  }

  await desktop
    .locator('.scheduler-date-semantics__scenario')
    .filter({ hasText: '夜间 T-1 日批' })
    .click()
  await desktop.getByLabel(/错误对照/).check()
  const wrongPartition = desktop.locator('.scheduler-date-semantics__partition')
  checker.check(
    'wrong current_date mapping marks 2026-09-27 and explains the stale/missing business partition',
    (await wrongPartition.getAttribute('data-date-partition-value')) === '2026-09-27' &&
      (await wrongPartition.getAttribute('role')) === 'alert' &&
      (await wrongPartition.innerText()).includes('正确的 2026-09-26 分区'),
  )
  await desktop
    .locator('.scheduler-date-semantics__scenario')
    .filter({ hasText: '次日 Rerun' })
    .click()
  checker.check(
    'scenario switching resets the deliberate wrong-partition toggle',
    !(await desktop.getByLabel(/错误对照/).isChecked()) &&
      (await wrongPartition.getAttribute('data-date-partition-value')) === '2026-09-26',
  )
  await desktop
    .locator('.scheduler-date-semantics__scenario')
    .filter({ hasText: '当日微批' })
    .click()
  await desktop.getByLabel(/错误对照/).check()
  checker.check(
    'same-day coincidence is called out rather than presented as a rule',
    (await wrongPartition.getAttribute('data-partition-aligned')) === 'true' &&
      (await wrongPartition.innerText()).includes('日期碰巧相同'),
  )
  await desktop.getByRole('button', { name: '重置日期实验' }).click()
  checker.check(
    'reset restores the initial nightly scenario and correct partition',
    (await desktopLab.getAttribute('data-date-scenario')) === 'nightly-t1' &&
      !(await desktop.getByLabel(/错误对照/).isChecked()) &&
      (await wrongPartition.getAttribute('data-date-partition-value')) === '2026-09-26',
  )

  await desktop.locator('.theme-toggle').click()
  await waitForTheme(desktop, 'dark')
  await selectScenario(desktop, expectedScenarios[2], 'desktop dark')
  await checkNoOverflow(desktop, 'desktop dark')
  await desktop.screenshot({ path: '/tmp/issue-159-date-semantics-desktop-dark.png' })
  await desktop.locator('.theme-toggle').click()
  await waitForTheme(desktop, 'light')
  await desktop.screenshot({ path: '/tmp/issue-159-date-semantics-desktop-light.png' })

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const mobileErrors = trackPageErrors(mobile)
  await mobile.goto(lessonUrl)
  const mobileLab = mobile.locator('[data-date-semantics-lab]')
  await mobileLab.waitFor()
  for (const scenario of expectedScenarios) {
    await selectScenario(mobile, scenario, '390px light')
    await checkNoOverflow(mobile, `390px light / ${scenario.id}`)
  }
  await mobile.screenshot({ path: '/tmp/issue-159-date-semantics-mobile-light.png' })

  await mobile.locator('.theme-toggle').click()
  await waitForTheme(mobile, 'dark')
  await selectScenario(mobile, expectedScenarios[4], '390px dark')
  await mobile.getByLabel(/错误对照/).check()
  await checkNoOverflow(mobile, '390px dark / wrong partition')
  await mobile.screenshot({ path: '/tmp/issue-159-date-semantics-mobile-dark.png' })

  await mobile.setViewportSize({ width: 320, height: 720 })
  await checkNoOverflow(mobile, '320px dark')

  const browserErrors = [...desktopErrors, ...mobileErrors]
  checker.check('no uncaught browser errors', browserErrors.length === 0, browserErrors.join('; '))
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await browser?.close()
  preview?.stop()
}

if (checker.report('scheduler-date-semantics') > 0) {
  process.exitCode = 1
}
