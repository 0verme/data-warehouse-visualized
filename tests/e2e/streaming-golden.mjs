#!/usr/bin/env node
/** Deterministic browser journey for Issue #75's one Advanced Golden Lesson. */
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
const SCRIPT_NAME = 'streaming-golden'
const LESSON_PATH = '/learn/streaming-warehouse-golden/'
const CONFIGURATIONS = [
  { name: 'desktop-1280x800/light', width: 1280, height: 800, theme: 'light' },
  { name: 'mobile-390x844/dark', width: 390, height: 844, theme: 'dark' },
  {
    name: 'mobile-320x720/light/reduced-motion',
    width: 320,
    height: 720,
    theme: 'light',
    reducedMotion: true,
  },
]
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

async function checkNoOverflow(page, tag) {
  const geometry = await page.evaluate(() => {
    const doc = document.documentElement
    const lab = document.querySelector('[data-diagram-type="state"]')
    const section = lab?.closest('.visualization-section')
    return {
      viewport: window.innerWidth,
      document: Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      lab: lab ? lab.scrollWidth - lab.clientWidth : null,
      section: section ? section.scrollWidth - section.clientWidth : null,
    }
  })
  check(
    `${tag} no horizontal overflow in document / lesson / visualization`,
    geometry.document <= TOLERANCE &&
      geometry.lab !== null &&
      geometry.lab <= TOLERANCE &&
      geometry.section !== null &&
      geometry.section <= TOLERANCE,
    JSON.stringify(geometry),
  )
}

async function runGoldenJourney(page, tag) {
  const lab = page.locator('[data-diagram-type="state"]')
  const next = page.locator('[data-streaming-action="next"]')
  const stepProgress = page.locator('[role="progressbar"][aria-label="Golden Lesson 推进进度"]')

  check(
    `${tag} exactly 7 causal visualization steps`,
    (await stepProgress.getAttribute('aria-valuemax')) === '7',
  )
  check(
    `${tag} same fixed eight source deliveries`,
    (await lab.locator('.streaming-golden__event').count()) === 8,
  )
  check(
    `${tag} T+1 batch and microbatch share the stream fixture`,
    (await lab.locator('[data-mode="batch"]').innerText()).includes('RUN 完成') &&
      (await lab.locator('.streaming-golden__microbatch-list li').count()) === 4,
  )
  check(
    `${tag} source position starts independently from watermark`,
    (await lab.getAttribute('data-current-offset')) === '0' &&
      (await lab.getAttribute('data-watermark')) === 'none',
  )

  await next.click()
  await page.getByLabel('Arrival Time', { exact: true }).check()
  check(
    `${tag} arrival-time bucket differs from business event-time bucket`,
    (await lab.locator('[data-testid="streaming-clock-window"]').innerText()).includes(
      '[10:05, 10:10)',
    ),
  )
  await page.getByLabel('Event Time', { exact: true }).check()
  check(
    `${tag} event-time membership uses the old five-minute window`,
    (await lab.locator('[data-testid="streaming-clock-window"]').innerText()).includes(
      '[10:00, 10:05)',
    ),
  )

  await next.click()
  check(
    `${tag} offsets 1–4 emit after W=10:05`,
    (await lab.getAttribute('data-current-offset')) === '4' &&
      (await lab.getAttribute('data-watermark')) === '2026-05-12T10:05:00+08:00' &&
      (await lab.locator('.streaming-golden__windows').innerText()).includes('300 CNY'),
  )
  await next.click()
  check(`${tag} late-action step waits for an explicit event`, await next.isDisabled())
  await page.locator('[data-streaming-action="inject-late"]').click()
  check(
    `${tag} accepted late TX-005 revises 300 → 450`,
    (await lab
      .locator('.streaming-golden__event[data-offset="5"]')
      .getAttribute('data-disposition')) === 'revision' &&
      (await lab.locator('.streaming-golden__windows').innerText()).includes('450 CNY'),
  )

  await page.locator('[data-streaming-action="advance-watermark"]').click()
  check(
    `${tag} duplicate TX-006 is de-duplicated before finalization`,
    (await lab
      .locator('.streaming-golden__event[data-offset="7"]')
      .getAttribute('data-disposition')) === 'duplicate',
  )
  check(
    `${tag} W=10:07 finalizes old window; offset 8 becomes side evidence`,
    (await lab.getAttribute('data-watermark')) === '2026-05-12T10:07:00+08:00' &&
      (await lab.getAttribute('data-current-offset')) === '8' &&
      (await page.locator('[data-testid="streaming-side-output"]').innerText()).includes('TX-008'),
  )
  await checkNoOverflow(page, `${tag} finalized state`)

  await next.click()
  check(
    `${tag} keyed/window state keeps both branch windows and the current output`,
    (await lab.getAttribute('data-step-id')) === 'stream-state' &&
      (await lab.locator('.streaming-golden__windows li').count()) === 3,
  )
  await next.click()
  check(`${tag} recovery step explicitly waits for restore/replay`, await next.isDisabled())
  await page.locator('[data-streaming-action="restore-replay"]').click()
  const recoveryText = await lab.locator('.streaming-golden__recovery-cases').innerText()
  check(
    `${tag} inconsistent checkpoint can skip TX-005 / TX-006`,
    recoveryText.includes('source 6 · state 4') && recoveryText.includes('TX-005、TX-006'),
  )
  check(
    `${tag} consistent replay can duplicate append sink writes`,
    recoveryText.includes('append 写入 2 → 4') && recoveryText.includes('可能重复 2 次'),
  )

  await next.click()
  const reconciliation = await lab
    .locator('[aria-label="Online 与 offline cutoff reconciliation"]')
    .innerText()
  check(
    `${tag} final Grain reconciliation explains +60 with TX-008`,
    (await lab.getAttribute('data-step-id')) === 'reconciliation' &&
      reconciliation.includes('Online 3 / 450 CNY') &&
      reconciliation.includes('Offline reference 4 / 510 CNY') &&
      reconciliation.includes('Difference +1 / +60 CNY · TX-008'),
  )
  check(
    `${tag} offline reference is explicitly cutoff-bounded`,
    reconciliation.includes('2026-05-13 02:00') &&
      reconciliation.includes('不是脱离 cutoff 的绝对真值'),
  )
  check(`${tag} final lesson has no further step`, (await next.count()) === 0)
  await checkNoOverflow(page, `${tag} completed reconciliation`)
}

async function runConfiguration(browser, baseUrl, config) {
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    colorScheme: config.theme,
    reducedMotion: config.reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  const tag = config.name

  try {
    await page.goto(`${baseUrl}${LESSON_PATH}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-diagram-type="state"][data-step-id="bounded-input"]', {
      timeout: 15_000,
    })
    await page
      .locator('html')
      .evaluate((element, theme) => element.setAttribute('data-theme', theme), config.theme)
    check(
      `${tag} lesson has its canonical title`,
      (await page.locator('h1').first().innerText()).includes(
        '同一批交易，为什么批处理、微批和流处理',
      ),
    )
    check(
      `${tag} exactly one visualization section`,
      (await page.locator('[data-diagram-type="state"]').count()) === 1,
    )
    check(
      `${tag} 320px reduced motion is honored`,
      !config.reducedMotion ||
        (await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)),
    )
    await checkNoOverflow(page, `${tag} initial`)
    await runGoldenJourney(page, tag)
    check(`${tag} no browser page errors`, errors.length === 0, errors.join(' | '))
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

    for (const configuration of CONFIGURATIONS) {
      await runConfiguration(browser, preview.baseUrl, configuration)
      console.log(`[${SCRIPT_NAME}] ${configuration.name} done`)
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
