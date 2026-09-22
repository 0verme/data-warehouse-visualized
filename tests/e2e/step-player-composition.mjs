#!/usr/bin/env node
/**
 * Interaction Journey — Step Player / Timeline mobile composition (Playwright).
 *
 * Issue #138 Pattern 2 (`step-player-mobile-composition`, implemented by #145).
 * The #144 probe proves "action → feedback ≤ 1 viewport" for one-shot labs. This
 * probe covers the *step players*: after `下一步 / 上一步 / 单步推进 / 推进到完成`
 * the learner must be able to see **what this step changed** without hunting.
 *
 * A journey clicks the step control with a raw mouse click (Playwright never
 * scrolls on the app's behalf) and then measures, in document space:
 *
 *   1. `gap ≤ maxScreens` — distance from the tapped button to the declared
 *      primary state block, normalised by the viewport height.
 *   2. `requireVisible` — the block must be in the viewport right after the tap.
 *   3. no auto-scroll — the scroll owner must not move on its own, so the fix
 *      stays structural instead of `scrollIntoView()`.
 *   4. `expectChange` — the primary block must actually report a different step
 *      state than before the click (a mounted node is never enough).
 *
 * Journeys also cover the Pattern 2 **No Change** rows (#145 AC) — `grain`,
 * `data-lineage-impact`, `lifecycle-path-failure` — as distance regressions.
 *
 * Usage:
 *   npm run test:e2e:steps                     # build + preview + journeys
 *   npm run test:e2e:steps -- --skip-build     # reuse existing dist/
 *   npm run test:e2e:steps -- --base http://127.0.0.1:4321
 *   npm run test:e2e:steps -- --only sql-transformation-join,scheduling-failure
 *   npm run test:e2e:steps -- --json report.json
 *
 * Requires the `playwright` devDependency and a Chromium build:
 *   npx playwright install chromium
 * Override resolution with `PLAYWRIGHT_MODULE=/path/to/node_modules/playwright`.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'steps'

/** The two phone viewports owned by #145 (390×844 is the audit baseline). */
const MOBILE_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '320x720', width: 320, height: 720 },
]

const DESKTOP_VIEWPORT = { name: '1280x800', width: 1280, height: 800 }

/** New primary state block of the four focused scheduler lessons. */
const SCHEDULER_STEP_BLOCK = {
  selector: '[data-scheduler-step-change]',
  label: '本步变化（primary state block）',
  maxScreens: 0.5,
  requireVisible: true,
}

/**
 * One journey = one lesson, one step control and a sequence of actions.
 *
 * `control` is the step-player container that has to exist before interacting.
 * Every action re-measures the same `feedback` budget, so `下一步 → 下一步 →
 * 上一步` is held to the contract at each step.
 */
const JOURNEYS = [
  {
    id: 'sql-transformation-join',
    slug: 'sql-transformation-join',
    component: 'JoinFanoutSimulator',
    control: '.join-fanout__toolbar',
    actions: [
      { role: 'button', name: '下一步', exact: true },
      { role: 'button', name: '下一步', exact: true },
      { role: 'button', name: '上一步', exact: true },
    ],
    feedback: [
      {
        selector: '.join-fanout__equation',
        label: '当前 Step 结果摘要（equation）',
        maxScreens: 0.5,
        requireVisible: true,
      },
      {
        selector: '.join-fanout__result',
        label: '当前 Step 结果表',
        maxScreens: 1,
        requireVisible: true,
      },
    ],
    expectChange: true,
    assertExtra: async ({ page, check: assert, label }) => {
      const order = await page.evaluate(() => {
        const result = document.querySelector('.join-fanout__result')
        const tables = document.querySelector('.join-fanout__tables')
        if (!result || !tables) return null
        return {
          resultTop: Math.round(result.getBoundingClientRect().top),
          tablesTop: Math.round(tables.getBoundingClientRect().top),
        }
      })
      assert(
        `${label} 移动端结果表排在两张输入表之前`,
        order !== null && order.resultTop < order.tablesTop,
        order ? `result=${order.resultTop} tables=${order.tablesTop}` : 'missing',
      )
    },
  },
  {
    id: 'scheduling-system',
    slug: 'scheduling-system',
    component: 'SchedulerRunSimulator(business-date)',
    control: '.scheduler-focused-controls',
    actions: [{ role: 'button', name: '单步推进', exact: true }],
    feedback: [
      SCHEDULER_STEP_BLOCK,
      { selector: '.scheduler-time-semantics__timeline', label: '时间语义时间轴', maxScreens: 1 },
      { selector: '.scheduler-focused-evidence', label: 'run 证据块', maxScreens: 1 },
    ],
    expectChange: true,
  },
  {
    id: 'scheduling-readiness',
    slug: 'scheduling-readiness',
    component: 'SchedulerRunSimulator(readiness)',
    control: '.scheduler-focused-controls',
    actions: [{ role: 'button', name: '单步推进', exact: true }],
    feedback: [
      SCHEDULER_STEP_BLOCK,
      { selector: '.scheduler-condition-grid', label: '放行条件网格', maxScreens: 1 },
      { selector: '.scheduler-dag', label: '依赖图', maxScreens: 1, informational: true },
    ],
    expectChange: true,
  },
  {
    id: 'scheduling-failure',
    slug: 'scheduling-failure',
    component: 'SchedulerRunSimulator(failure)',
    control: '.scheduler-focused-controls',
    actions: [{ role: 'button', name: '跳到失败', exact: true }],
    feedback: [
      SCHEDULER_STEP_BLOCK,
      {
        selector: '.scheduler-propagation',
        label: '失败传播链',
        maxScreens: 1,
        requireVisible: true,
      },
      {
        selector: '.scheduler-dag',
        label: '依赖图（完整证据）',
        maxScreens: 4,
        informational: true,
      },
      { selector: '.scheduler-event-log', label: '事件日志（完整证据）', informational: true },
    ],
    expectChange: true,
  },
  {
    id: 'scheduling-sla',
    slug: 'scheduling-sla',
    component: 'SchedulerRunSimulator(sla)',
    control: '.scheduler-focused-controls',
    actions: [{ role: 'button', name: '推进到完成', exact: true }],
    feedback: [
      SCHEDULER_STEP_BLOCK,
      { selector: '.scheduler-sla-timeline__events', label: 'SLA 时间轴', maxScreens: 1 },
      { selector: '.scheduler-focused-evidence', label: 'run 证据块', maxScreens: 1 },
    ],
    expectChange: true,
  },
  // Pattern 2 No Change rows: #145 only guards that the measured distances did
  // not grow (baseline: grain 0.08 / impact 0.22 / lifecycle 0.46 screens); the
  // layouts themselves are untouched, so no visibility requirement is added.
  {
    id: 'grain-no-change',
    slug: 'grain',
    component: 'LoanGrainLab (No Change)',
    control: '.loan-grain__error-actions',
    actions: [{ role: 'button', name: '执行 SUM(contract_amount)', exact: true }],
    feedback: [{ selector: '.loan-grain__error-result', label: '聚合结果', maxScreens: 0.5 }],
  },
  {
    id: 'lineage-impact-no-change',
    slug: 'data-lineage-impact',
    component: 'LineageTeachingLab(ImpactPanel) (No Change)',
    control: '.lineage-teaching-prediction',
    actions: [
      { role: 'button', name: '提交直接下游预测', exact: true },
      { role: 'button', name: '展开下一层影响', exact: true },
    ],
    feedback: [
      { selector: '.lineage-teaching-blast-radius', label: '影响面板', maxScreens: 0.5 },
      {
        selector: '.lineage-teaching-impact-stats',
        label: '影响统计',
        maxScreens: 0.5,
      },
    ],
    before: async ({ page }) => {
      await page.locator('.lineage-teaching-impact-choice').first().click()
    },
  },
  {
    id: 'lifecycle-path-no-change',
    slug: 'lifecycle-path-failure',
    component: 'LifecyclePathLab (No Change)',
    control: '.lifecycle-path__toolbar',
    actions: [{ role: 'button', name: '下一步', exact: true }],
    feedback: [{ selector: '.lifecycle-path__days', label: 'Day 执行路径', maxScreens: 0.5 }],
  },
]

const A11Y_SLUGS = [
  'sql-transformation-join',
  'scheduling-system',
  'scheduling-readiness',
  'scheduling-failure',
  'scheduling-sla',
]

function resolve(page, spec) {
  if (spec.selector) {
    return page.locator(spec.selector).nth(spec.index ?? 0)
  }

  return page.getByRole(spec.role, { name: spec.name, exact: spec.exact ?? false }).first()
}

function describeSpec(spec) {
  if (spec.selector) return `${spec.selector}[${spec.index ?? 0}]`
  return `${spec.role}:"${spec.name}"`
}

/**
 * Scroll the control into view exactly like a learner, then make sure a raw
 * mouse click will actually reach it (sticky chrome can cover the centre).
 * Returns the control rectangle in content space and the click point.
 */
async function prepareAction(page, locator) {
  await locator.evaluate((element) => element.setAttribute('data-step-target', ''))
  await locator.scrollIntoViewIfNeeded()

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const box = await locator.boundingBox()
    if (!box) return null
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      return Boolean(element && element.closest('[data-step-target]'))
    }, point)
    const control = await page.evaluate(({ x, y }) => {
      const scroller = document.querySelector('.learn-main__scroll')
      const target = document.elementFromPoint(x, y)?.closest('[data-step-target]')
      const rect = (target ?? document.body).getBoundingClientRect()
      return {
        top: rect.top + scroller.scrollTop - scroller.getBoundingClientRect().top,
        bottom: rect.bottom + scroller.scrollTop - scroller.getBoundingClientRect().top,
      }
    }, point)
    if (hit) return { point, box, control }

    await page.evaluate(
      (delta) => {
        const scroller = document.querySelector('.learn-main__scroll')
        scroller.scrollTop += delta
      },
      point.y < 140 ? -90 : 90,
    )
    await page.waitForTimeout(60)
  }

  return null
}

/** Geometry of the declared blocks, in document space, relative to the button. */
async function measureProximity(page, controlRect, feedback) {
  return page.evaluate(
    ({ controlRect, feedbackSpecs }) => {
      const scroller = document.querySelector('.learn-main__scroll')
      const scrollerRect = scroller.getBoundingClientRect()

      return {
        scrollerTop: Math.round(scrollerRect.top),
        scrollerBottom: Math.round(scrollerRect.bottom),
        feedback: feedbackSpecs.map((entry) => {
          const element = document.querySelector(entry.selector)
          if (!element) return { ...entry, missing: true }
          const rect = element.getBoundingClientRect()
          const top = rect.top + scroller.scrollTop - scrollerRect.top
          const bottom = rect.bottom + scroller.scrollTop - scrollerRect.top
          const gap =
            top >= controlRect.bottom
              ? top - controlRect.bottom
              : controlRect.top >= bottom
                ? controlRect.top - bottom
                : 0
          const visibleTop = Math.max(rect.top, scrollerRect.top)
          const visibleBottom = Math.min(rect.bottom, scrollerRect.bottom)
          const visibleHeight = Math.max(0, visibleBottom - visibleTop)
          return {
            ...entry,
            missing: false,
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            contentTop: Math.round(top),
            contentBottom: Math.round(bottom),
            gaps: Math.round(gap),
            screens: Number((gap / window.innerHeight).toFixed(3)),
            visibleRatio: Number((visibleHeight / Math.max(1, rect.height)).toFixed(3)),
            visibleStart: rect.top >= scrollerRect.top && rect.top <= scrollerRect.bottom,
          }
        }),
      }
    },
    { controlRect, feedbackSpecs: feedback },
  )
}

async function readScroll(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('.learn-main__scroll')
    return {
      scrollTop: Math.round(scroller.scrollTop),
      maxScroll: Math.round(scroller.scrollHeight - scroller.clientHeight),
      windowScrollY: window.scrollY,
    }
  })
}

/**
 * Turn off browser scroll anchoring for the measured click so any movement of
 * the scroll owner is produced by the page, not by Chrome compensating for a
 * layout shift above the viewport.
 */
async function disableScrollAnchoring(page) {
  await page.evaluate(() => {
    if (document.getElementById('steps-no-anchor')) return
    const style = document.createElement('style')
    style.id = 'steps-no-anchor'
    style.textContent = '.learn-main__scroll { overflow-anchor: none; }'
    document.head.append(style)
  })
}

async function readPrimaryText(page, feedback) {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector)
    return element ? (element.textContent ?? '').replace(/\s+/g, ' ').trim() : null
  }, feedback[0].selector)
}

async function runJourney(page, baseUrl, journey, viewport) {
  const label = `${journey.id} @${viewport.name}`
  await page.goto(`${baseUrl}/learn/${journey.slug}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.learn-main__scroll', { timeout: 15_000 })
  await page.waitForSelector(journey.control, { timeout: 15_000 })

  if (journey.before) {
    await journey.before({ page })
  }

  const record = {
    id: journey.id,
    component: journey.component,
    slug: journey.slug,
    viewport: viewport.name,
    steps: [],
  }

  let lastPrimaryText = null

  for (const [index, actionSpec] of journey.actions.entries()) {
    const stepLabel = `${label} step ${index + 1} (${describeSpec(actionSpec)})`
    const action = resolve(page, actionSpec)
    if ((await action.count()) === 0) {
      check(`${stepLabel} action 存在`, false, describeSpec(actionSpec))
      return record
    }

    const prepared = await prepareAction(page, action)
    if (!prepared) {
      check(`${stepLabel} action 可点击`, false, describeSpec(actionSpec))
      return record
    }

    await disableScrollAnchoring(page)
    const before = await readScroll(page)
    const beforeText = await readPrimaryText(page, journey.feedback)
    await page.mouse.click(prepared.point.x, prepared.point.y)
    await page.waitForTimeout(220)
    const after = await readScroll(page)

    const geometry = await measureProximity(page, prepared.control, journey.feedback)
    record.steps.push({
      action: describeSpec(actionSpec),
      control: {
        text: await action.innerText().catch(() => ''),
        contentTop: Math.round(prepared.control.top),
        contentBottom: Math.round(prepared.control.bottom),
      },
      scroll: { before: before.scrollTop, after: after.scrollTop, max: after.maxScroll },
      geometry,
    })

    for (const entry of geometry.feedback) {
      const entryLabel = `${stepLabel} ${entry.label}`
      if (entry.missing) {
        if (entry.informational) continue
        check(`${entryLabel} 存在`, false, entry.selector)
        continue
      }
      if (entry.informational) continue
      check(
        `${entryLabel} 与控件距离 ≤ ${entry.maxScreens} viewport`,
        entry.screens <= entry.maxScreens + 1e-3,
        `gap=${entry.gaps}px screens=${entry.screens} control=[${record.steps.at(-1).control.contentTop},${record.steps.at(-1).control.contentBottom}] feedback=[${entry.contentTop},${entry.contentBottom}]`,
      )
      if (entry.requireVisible) {
        check(
          `${entryLabel} 点击后进入 viewport`,
          entry.visibleStart || entry.visibleRatio >= 0.5,
          `visibleStart=${entry.visibleStart} visibleRatio=${entry.visibleRatio} feedback=[${entry.top},${entry.bottom}] scroller=[${geometry.scrollerTop},${geometry.scrollerBottom}]`,
        )
      }
    }

    // Scroll anchoring is disabled above, so any movement means the lab took
    // the viewport instead of placing the result where the learner already is.
    check(
      `${stepLabel} 点击后系统不抢回 viewport`,
      after.scrollTop === before.scrollTop && after.windowScrollY === 0,
      `before=${before.scrollTop} after=${after.scrollTop} windowScrollY=${after.windowScrollY}`,
    )

    const afterText = await readPrimaryText(page, journey.feedback)
    if (journey.expectChange && index === 0) {
      check(
        `${stepLabel} primary state block 报告新状态`,
        beforeText !== null && afterText !== null && beforeText !== afterText,
        `before=${(beforeText ?? '').slice(0, 60)} after=${(afterText ?? '').slice(0, 60)}`,
      )
    }
    lastPrimaryText = afterText
  }

  record.primaryTextAfter = lastPrimaryText
  if (journey.assertExtra) {
    await journey.assertExtra({ page, check, label, record })
  }

  return record
}

/** `prefers-reduced-motion: reduce` must not make the player move the viewport. */
async function reducedMotionProbe(browser, baseUrl, journey) {
  const label = `reduced-motion ${journey.id}`
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  try {
    await page.goto(`${baseUrl}/learn/${journey.slug}/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.learn-main__scroll', { timeout: 15_000 })
    if (journey.before) {
      await journey.before({ page })
    }
    const prepared = await prepareAction(page, resolve(page, journey.actions[0]))
    if (!prepared) {
      check(`${label} action 可点击`, false, describeSpec(journey.actions[0]))
      return
    }
    await disableScrollAnchoring(page)
    await page.evaluate(() => {
      const scroller = document.querySelector('.learn-main__scroll')
      window.__stepsScrollEvents = 0
      scroller.addEventListener('scroll', () => {
        window.__stepsScrollEvents += 1
      })
    })
    await page.waitForTimeout(160)
    const before = await readScroll(page)
    await page.mouse.click(prepared.point.x, prepared.point.y)
    await page.waitForTimeout(260)
    const after = await page.evaluate(() => ({
      scrollTop: Math.round(document.querySelector('.learn-main__scroll').scrollTop),
      events: window.__stepsScrollEvents,
      windowScrollY: window.scrollY,
    }))
    check(
      `${label} 不产生自动滚动`,
      after.scrollTop === before.scrollTop && after.windowScrollY === 0,
      `events=${after.events} before=${before.scrollTop} after=${after.scrollTop}`,
    )
  } finally {
    await page.close()
    await context.close()
  }
}

/**
 * The Step Kernel is headless; the chrome has to stay keyboard-operable.
 * Focus the visible next button and press Enter (browser-level activation).
 */
async function keyboardProbe(browser, baseUrl) {
  const label = 'keyboard join-fanout 下一步'
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    await page.goto(`${baseUrl}/learn/sql-transformation-join/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.join-fanout', { timeout: 15_000 })
    const before = await page.locator('.join-fanout').getAttribute('data-step-id')
    const next = page.getByRole('button', { name: '下一步', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(160)
    const after = await page.locator('.join-fanout').getAttribute('data-step-id')
    check(
      `${label} 可用键盘推进 Step`,
      before === 'observe-tables' && after === 'match-left-row-1',
      `before=${before} after=${after}`,
    )
  } finally {
    await page.close()
    await context.close()
  }
}

/** Touch-target floor + a live region for every lesson this probe touches. */
async function a11yProbe(browser, baseUrl, slugs) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    for (const slug of slugs) {
      await page.goto(`${baseUrl}/learn/${slug}/`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.visualization-section', { timeout: 15_000 })
      const floor = await page.evaluate(() => {
        const section = document.querySelector('.visualization-section')
        const small = []
        for (const control of section.querySelectorAll(
          'button, a[href], select, input[type="checkbox"], input[type="radio"], [role="button"]',
        )) {
          if (control.closest('.sr-only')) continue
          const rect = control.getBoundingClientRect()
          if (rect.height === 0 && rect.width === 0) continue
          if (rect.height >= 32) continue
          small.push(
            `${(control.textContent || control.getAttribute('aria-label') || control.tagName).trim().slice(0, 18)}(${Math.round(rect.width)}x${Math.round(rect.height)})`,
          )
        }
        return {
          small,
          liveRegions: section.querySelectorAll('[aria-live]').length,
          statusRoles: section.querySelectorAll('[role="status"]').length,
        }
      })
      check(`${slug} 触控目标 ≥32px`, floor.small.length === 0, floor.small.join(', '))
      check(
        `${slug} primary feedback 有 aria-live / role=status`,
        floor.liveRegions + floor.statusRoles > 0,
        `aria-live=${floor.liveRegions} role=status=${floor.statusRoles}`,
      )
    }
  } finally {
    await page.close()
    await context.close()
  }
}

/**
 * Desktop regression: compact geometry guard so the mobile-only composition
 * changes cannot leak into 1280 (join keeps source tables before the result,
 * nothing overflows horizontally, the scheduler step block is rendered).
 */
async function desktopProbe(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: DESKTOP_VIEWPORT.width, height: DESKTOP_VIEWPORT.height },
  })
  const page = await context.newPage()
  try {
    for (const journey of JOURNEYS) {
      await page.goto(`${baseUrl}/learn/${journey.slug}/`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.visualization-section', { timeout: 15_000 })
      const geometry = await page.evaluate(() => {
        const section = document.querySelector('.visualization-section')
        const result = document.querySelector('.join-fanout__result')
        const tables = document.querySelector('.join-fanout__tables')
        return {
          overflow: section.scrollWidth - section.clientWidth,
          resultTop: result ? Math.round(result.getBoundingClientRect().top) : null,
          tablesTop: tables ? Math.round(tables.getBoundingClientRect().top) : null,
        }
      })
      check(
        `${journey.slug} @${DESKTOP_VIEWPORT.name} 无横向溢出`,
        geometry.overflow <= 1,
        `overflow=${geometry.overflow}px`,
      )
      if (geometry.resultTop !== null && geometry.tablesTop !== null) {
        check(
          `${journey.slug} @${DESKTOP_VIEWPORT.name} 保留桌面阅读顺序（输入表在结果表之前）`,
          geometry.tablesTop < geometry.resultTop,
          `tables=${geometry.tablesTop} result=${geometry.resultTop}`,
        )
      }
    }
  } finally {
    await page.close()
    await context.close()
  }
}

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const jsonArgIndex = args.indexOf('--json')
const jsonPath = jsonArgIndex >= 0 ? args[jsonArgIndex + 1] : null
const onlyArgIndex = args.indexOf('--only')
const onlyIds =
  onlyArgIndex >= 0
    ? new Set(
        (args[onlyArgIndex + 1] ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : null
const selectedJourneys = onlyIds ? JOURNEYS.filter((journey) => onlyIds.has(journey.id)) : JOURNEYS

const { check, report } = createChecker()
const measurements = []

async function main() {
  const browser = await launchChromium()
  const preview = await startPreview({
    root: ROOT,
    base: externalBase,
    skipBuild,
    scriptName: SCRIPT_NAME,
  })
  const baseUrl = preview.baseUrl

  try {
    for (const viewport of MOBILE_VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      const page = await context.newPage()
      try {
        for (const journey of selectedJourneys) {
          measurements.push(await runJourney(page, baseUrl, journey, viewport))
        }
      } finally {
        await page.close()
        await context.close()
      }
      console.log(`[${SCRIPT_NAME}] ${viewport.name} journeys done`)
    }

    if (!onlyIds) {
      await reducedMotionProbe(
        browser,
        baseUrl,
        JOURNEYS.find((journey) => journey.id === 'sql-transformation-join'),
      )
      await reducedMotionProbe(
        browser,
        baseUrl,
        JOURNEYS.find((journey) => journey.id === 'scheduling-failure'),
      )
      await keyboardProbe(browser, baseUrl)
      await desktopProbe(browser, baseUrl)
    }

    await a11yProbe(
      browser,
      baseUrl,
      onlyIds ? [...new Set(selectedJourneys.map((j) => j.slug))] : A11Y_SLUGS,
    )
  } finally {
    await browser.close()
    preview.stop()
  }

  for (const record of measurements) {
    record.steps?.forEach((step, index) => {
      for (const entry of step.geometry.feedback) {
        console.log(
          `[${SCRIPT_NAME}] ${record.id} @${record.viewport} step${index + 1} ${entry.label}: ` +
            (entry.missing
              ? 'MISSING\n'
              : `gap=${entry.gaps}px (${entry.screens} screens) visibleStart=${entry.visibleStart} ` +
                `visibleRatio=${entry.visibleRatio} control=[${step.control.contentTop},${step.control.contentBottom}] ` +
                `feedback=[${entry.contentTop},${entry.contentBottom}]${entry.informational ? ' (informational)' : ''}\n`),
        )
      }
    })
  }

  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify(measurements, null, 2)}\n`)
    console.log(`[${SCRIPT_NAME}] raw measurements written to ${jsonPath}`)
  }

  if (report(SCRIPT_NAME) > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
