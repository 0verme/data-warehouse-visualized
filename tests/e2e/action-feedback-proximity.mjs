#!/usr/bin/env node
/**
 * Interaction Journey — Primary Action ↔ Primary Feedback proximity (Playwright).
 *
 * Issue #138 Pattern 1 (`action-feedback-proximity`, implemented by #144): when
 * a learner taps the *primary action* of a lab, the block that actually changed
 * (the *primary feedback*) must not be more than **one viewport** away, and it
 * must be reachable without hunting. The 2026-09 audit measured 0.9–2.3 screens
 * for the lessons below because the linear mobile document pushed the updated
 * block outside the viewport (F1 forward / F2 reverse) with no positioning
 * fallback anywhere in the project.
 *
 * What is asserted (geometry, not markup — a class change or a mounted node is
 * never enough):
 *
 *   1. `gap ≤ maxScreens` — the post-action distance between the control and
 *      the feedback, in document space, normalised by the viewport height.
 *   2. `requireVisible` — the feedback has to be *in the viewport right after
 *      the tap* (its start is visible, or at least half of the block is).
 *   3. no auto-scroll — the scroll owner must not move on its own. This pins
 *      the fix to information-structure work instead of `scrollIntoView()`.
 *   4. secondary assertions per journey (checkpoint nav state, …).
 *
 * The click is dispatched with raw mouse coordinates so Playwright never scrolls
 * on the app's behalf: the pre-click control rectangle plus `scrollTop` are the
 * reference frame for the measurement, exactly like the phone in the audit.
 *
 * Usage:
 *   npm run test:e2e:proximity                  # build + preview + journey
 *   npm run test:e2e:proximity -- --skip-build  # reuse existing dist/
 *   npm run test:e2e:proximity -- --base http://127.0.0.1:4321
 *   npm run test:e2e:proximity -- --json report.json   # dump raw measurements
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
const SCRIPT_NAME = 'proximity'

/** The two phone viewports owned by #144 (390×844 is the audit baseline). */
const MOBILE_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '320x720', width: 320, height: 720 },
]

/**
 * One journey = one primary action plus the primary feedback it mutates.
 *
 * `feedback` holds several blocks so a single action can be held to a different
 * budget per changed block; the conclusion block always carries the tightest
 * one. `maxScreens` is expressed in viewport heights, `requireVisible` demands
 * the block to be on screen right after the tap.
 */
const JOURNEYS = [
  {
    id: 'capstone-mission-brief',
    slug: 'build-a-warehouse',
    component: 'CapstoneWorkbench',
    action: { role: 'button', name: '确认 Mission Brief', exact: true },
    feedback: [
      {
        selector: '.capstone-workbench__main',
        label: 'checkpoint main',
        maxScreens: 1,
        requireVisible: true,
      },
    ],
    // #146 owns the horizontal rail affordance; here only the state sync that
    // the confirm action causes is asserted.
    assertExtra: async ({ page, check: assert, label }) => {
      const state = await page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll('.capstone-checkpoint-nav .capstone-checkpoint'),
        )
        return {
          labels: items.map((item) => item.querySelector('small')?.textContent?.trim() ?? ''),
          active: items.filter((item) => item.classList.contains('is-active')).length,
          ariaCurrent: items.filter(
            (item) => item.querySelector('button')?.getAttribute('aria-current') === 'step',
          ).length,
          mainStage: document.querySelector('.capstone-stage')?.getAttribute('aria-labelledby'),
        }
      })
      assert(
        `${label} checkpoint nav 反映新状态`,
        state.labels[0] === '已完成' && state.active === 1 && state.ariaCurrent === 1,
        `labels=${state.labels.join('|')} active=${state.active} aria-current=${state.ariaCurrent}`,
      )
      assert(
        `${label} main 切换到下一个 checkpoint`,
        state.mainStage === 'capstone-stage-design',
        `stage=${state.mainStage}`,
      )
    },
  },
  {
    id: 'governance-lifecycle-migrate',
    slug: 'data-governance-lifecycle',
    component: 'GovernanceWorkbench(lifecycle)',
    action: { role: 'button', name: '切换到替代资产', exact: true },
    feedback: [
      {
        selector: '.governance-definition-card',
        label: '资产定义 detail',
        maxScreens: 1,
        requireVisible: true,
      },
      {
        selector: '[data-governance-migration-conclusion]',
        label: '迁移结论（动作旁）',
        maxScreens: 0.5,
        requireVisible: true,
      },
    ],
    assertExtra: async ({ page, check: assert, label }) => {
      const migrated = await page.evaluate(() => ({
        message:
          document
            .querySelector('.governance-live-message')
            ?.textContent?.trim()
            .replace(/\s+/g, ' ') ?? '',
        detail: document.querySelector('.governance-definition-card')?.textContent ?? '',
      }))
      assert(
        `${label} 迁移结论写回 detail`,
        migrated.detail.includes('ads_deposit_balance') && migrated.detail.includes('active'),
        migrated.message.slice(0, 60),
      )
    },
  },
  {
    id: 'lakehouse-replication-sync',
    slug: 'lakehouse-replication',
    component: 'LakehouseArchitectureLab(replication)',
    action: { role: 'button', name: '执行一次 Transform / Sync', exact: true },
    feedback: [
      {
        selector: '[data-detail-role="replica-summary"]',
        label: '同步面板',
        maxScreens: 1,
        requireVisible: true,
      },
      {
        selector: '.lakehouse-zones--replication',
        label: 'zone 图',
        informational: true,
      },
      {
        selector: '[data-lakehouse-action-result]',
        label: '本次同步结论',
        maxScreens: 0.5,
        requireVisible: true,
      },
    ],
  },
  {
    id: 'lakehouse-table-layer-commit',
    slug: 'lakehouse-table-layer',
    component: 'LakehouseArchitectureLab(table-layer)',
    action: { role: 'button', name: 'Commit：发布 v2', exact: true },
    feedback: [
      {
        selector: '.lakehouse-pointer-panel',
        label: 'Snapshot Visibility 面板',
        maxScreens: 1,
        requireVisible: true,
      },
      {
        selector: '[data-detail-role="snapshot-table"]',
        label: 'snapshot 表',
        informational: true,
      },
      {
        selector: '[data-lakehouse-action-result]',
        label: '本次 Commit 结论',
        maxScreens: 0.5,
        requireVisible: true,
      },
    ],
  },
  {
    id: 'lakehouse-unity-mode',
    slug: 'lakehouse-unity',
    component: 'LakehouseArchitectureLab(unity)',
    action: { role: 'button', name: '共享基础能力的形态', exact: false },
    feedback: [
      {
        // The observation table is the reference detail for the selected mode; the
        // action-adjacent conclusion below it is what has to enter the viewport.
        selector: '[data-detail-role="comparison"]',
        label: '一体化观察表',
        maxScreens: 1,
      },
      {
        selector: '[data-lakehouse-action-result]',
        label: '本次形态切换结论',
        maxScreens: 0.5,
        requireVisible: true,
      },
    ],
  },
  {
    id: 'banking-metric-scope-preset',
    slug: 'metric-system',
    component: 'BankingMetricScopeLab(preset)',
    action: { selector: '.banking-metric-scope__scenario', index: 1 },
    feedback: [
      {
        selector: '.banking-metric-scope__selected',
        label: '当前口径成员表',
        informational: true,
      },
      {
        selector: '[data-scope-conclusion]',
        label: '就近口径摘要（同屏或 ≤1 viewport）',
        maxScreens: 1,
      },
    ],
  },
  {
    id: 'banking-metric-scope-chip',
    slug: 'metric-system',
    component: 'BankingMetricScopeLab(chip)',
    action: { selector: '.banking-metric-scope__choice', index: 12 },
    feedback: [
      {
        selector: '.banking-metric-scope__selected',
        label: '当前口径成员表',
        informational: true,
      },
      {
        selector: '[data-scope-conclusion]',
        label: '就近口径摘要（同屏或 ≤1 viewport）',
        maxScreens: 1,
      },
    ],
  },
  {
    id: 'data-quality-rules-evidence',
    slug: 'data-quality-rules',
    component: 'DataQualityWorkbench(rules)',
    action: { selector: '.data-quality-rule', index: 0 },
    feedback: [
      {
        selector: '.data-quality-focus',
        label: 'rule evidence',
        maxScreens: 0.5,
        requireVisible: true,
      },
    ],
    assertExtra: async ({ page, check: assert, label }) => {
      const state = await page.evaluate(() => {
        const focus = document.querySelector('.data-quality-focus')
        const grid = document.querySelector('.data-quality-rule-grid')
        const selected = document.querySelector('.data-quality-rule.is-selected')
        const focusRect = focus?.getBoundingClientRect()
        const selectedRect = selected?.getBoundingClientRect()
        return {
          insideGrid: Boolean(focus && grid && focus.parentElement === grid),
          selectedRule: selected?.textContent?.match(/dq_[a-z_]+/)?.[0] ?? '',
          gap: focusRect && selectedRect ? Math.round(focusRect.top - selectedRect.bottom) : null,
        }
      })
      assert(
        `${label} evidence 变为所选 rule 的同组详情`,
        state.insideGrid && state.gap !== null && state.gap <= 24,
        `insideGrid=${state.insideGrid} rule=${state.selectedRule} gap=${state.gap}`,
      )
    },
  },
  {
    id: 'performance-stage-evidence',
    slug: 'performance-and-practice',
    component: 'PerformanceDiagnosisLab',
    action: { selector: '.performance-stage', index: 1 },
    feedback: [
      {
        selector: '[data-stage-evidence-summary]',
        label: '就近阶段证据摘要',
        maxScreens: 0.5,
        requireVisible: true,
      },
      {
        selector: '.performance-diagnosis__evidence',
        label: '完整证据记录',
        informational: true,
      },
    ],
  },
  {
    id: 'loan-process-step',
    slug: 'data-modeling',
    component: 'LoanBusinessProcessLab',
    action: { selector: '.loan-process__step', index: 3 },
    feedback: [
      {
        selector: '[data-loan-step-conclusion]',
        label: '同一句问题的结果（声明）',
        maxScreens: 0.5,
        requireVisible: true,
      },
      {
        selector: '.loan-process__step-detail-panel',
        label: '业务环节 detail',
        maxScreens: 1,
        requireVisible: true,
      },
      {
        selector: '.loan-process__measure-detail',
        label: '同一句问题数值（不随环节变化）',
        informational: true,
      },
      {
        selector: '.loan-process__declaration',
        label: '完整记录声明',
        informational: true,
      },
    ],
  },
  {
    id: 'scheduler-rerun-apply',
    slug: 'scheduling-rerun',
    component: 'SchedulerRunSimulator(rerun)',
    action: { role: 'button', name: '执行这个', exact: false },
    feedback: [
      {
        selector: '[data-rerun-result]',
        label: '本次运行结论',
        maxScreens: 1,
        requireVisible: true,
      },
      {
        // Full run record (business date / partition / status / event count): the
        // action-adjacent conclusion above is what has to be on screen.
        selector: '.scheduler-focused-evidence',
        label: '完整运行证据',
        informational: true,
      },
    ],
  },
]

/**
 * Lessons whose controls / live regions are covered by the #144 side cleanups.
 *
 * `data-quality` is not a proximity journey (its status view is already in view),
 * but #144 explicitly folds its 24px text button and missing live region into
 * this change.
 */
const A11Y_LESSONS = [...new Set([...JOURNEYS.map((journey) => journey.slug), 'data-quality'])]

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
 * mouse click will actually reach it (sticky topbar / bottom nav can cover the
 * centre point even when the element itself is "in view").
 */
async function prepareAction(page, locator) {
  await locator.evaluate((element) => element.setAttribute('data-proximity-target', ''))
  await locator.scrollIntoViewIfNeeded()

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const box = await locator.boundingBox()
    if (!box) return null
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      return Boolean(element && element.closest('[data-proximity-target]'))
    }, point)
    // Content coordinates: the control and the feedback have to be measured in
    // one frame (the scroll container's content box), not from the viewport.
    const control = await page.evaluate(({ x, y }) => {
      const scroller = document.querySelector('.learn-main__scroll')
      const target = document.elementFromPoint(x, y)?.closest('[data-proximity-target]')
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

/** Geometry of the changed blocks, in document space, relative to the control. */
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

/**
 * Control size inside the visualization section.
 *
 * #144 also closes the a11y floor gap for the lessons it touches: a primary
 * control under 32px is not tappable on a phone.
 */
async function measureControlFloor(page) {
  return page.evaluate(() => {
    const section = document.querySelector('.visualization-section')
    if (!section) return null
    const controls = Array.from(
      section.querySelectorAll('button, a[href], select, input[type="checkbox"], [role="button"]'),
    )
    const small = []
    for (const control of controls) {
      if (control.closest('.sr-only')) continue
      const rect = control.getBoundingClientRect()
      if (rect.height === 0 && rect.width === 0) continue
      if (rect.height >= 32) continue
      small.push({
        tag: control.tagName.toLowerCase(),
        cls: typeof control.className === 'string' ? control.className.split(/\s+/)[0] : '',
        text: (control.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
        size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      })
    }
    return {
      small,
      liveRegions: section.querySelectorAll('[aria-live]').length,
      statusRoles: section.querySelectorAll('[role="status"]').length,
    }
  })
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
 * Turn off browser scroll anchoring for the measured click.
 *
 * Chrome silently compensates for layout shifts above the viewport, which is a
 * browser feature and not the lab moving the learner. Disabling it isolates the
 * real contract: the app itself must never scroll the page to reveal a result.
 */
async function disableScrollAnchoring(page) {
  await page.evaluate(() => {
    if (document.getElementById('proximity-no-anchor')) return
    const style = document.createElement('style')
    style.id = 'proximity-no-anchor'
    style.textContent = '.learn-main__scroll { overflow-anchor: none; }'
    document.head.append(style)
  })
}

async function runJourney(page, baseUrl, journey, viewport) {
  const label = `${journey.id} @${viewport.name}`
  await page.goto(`${baseUrl}/learn/${journey.slug}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.learn-main__scroll', { timeout: 15_000 })

  const action = resolve(page, journey.action)
  if ((await action.count()) === 0) {
    check(`${label} primary action 存在`, false, describeSpec(journey.action))
    return null
  }

  const prepared = await prepareAction(page, action)
  if (!prepared) {
    check(`${label} primary action 可点击`, false, describeSpec(journey.action))
    return null
  }

  await disableScrollAnchoring(page)
  const before = await readScroll(page)
  // Raw mouse click: Playwright does not scroll for `mouse.click`, so the scroll
  // owner can only move because the page itself moved it.
  await page.mouse.click(prepared.point.x, prepared.point.y)
  await page.waitForTimeout(220)
  const after = await readScroll(page)

  const geometry = await measureProximity(page, prepared.control, journey.feedback)
  const record = {
    id: journey.id,
    component: journey.component,
    slug: journey.slug,
    viewport: viewport.name,
    control: {
      selector: describeSpec(journey.action),
      text: await action.innerText().catch(() => ''),
      contentTop: Math.round(prepared.control.top),
      contentBottom: Math.round(prepared.control.bottom),
    },
    scroll: { before: before.scrollTop, after: after.scrollTop, max: after.maxScroll },
    geometry,
  }
  measurements.push(record)

  for (const entry of geometry.feedback) {
    const entryLabel = `${label} ${entry.label}`
    if (entry.missing) {
      if (entry.informational) continue
      check(`${entryLabel} 存在`, false, entry.selector)
      continue
    }
    if (entry.informational) continue
    check(
      `${entryLabel} 与控件距离 ≤ ${entry.maxScreens} viewport`,
      entry.screens <= entry.maxScreens + 1e-3,
      `gap=${entry.gaps}px screens=${entry.screens} control=[${record.control.contentTop},${record.control.contentBottom}] feedback=[${entry.contentTop},${entry.contentBottom}]`,
    )
    if (entry.requireVisible) {
      check(
        `${entryLabel} 点击后进入 viewport`,
        entry.visibleStart || entry.visibleRatio >= 0.5,
        `visibleStart=${entry.visibleStart} visibleRatio=${entry.visibleRatio} feedback=[${entry.top},${entry.bottom}] scroller=[${geometry.scrollerTop},${geometry.scrollerBottom}]`,
      )
    }
  }

  // Scroll anchoring is disabled above, so any scroll movement means the lab
  // itself moved the viewport instead of placing the feedback where the learner
  // already is.
  check(
    `${label} 点击后系统不抢回 viewport`,
    after.scrollTop === before.scrollTop && after.windowScrollY === 0,
    `before=${before.scrollTop} after=${after.scrollTop} maxAfter=${after.maxScroll} windowScrollY=${after.windowScrollY}`,
  )

  if (journey.assertExtra) {
    await journey.assertExtra({ page, check, label, geometry })
  }

  return record
}

async function reducedMotionProbe(browser, baseUrl, journey) {
  // `prefers-reduced-motion: reduce` must not introduce an automatic scroll, and
  // the fix has to be structural: the scroll owner stays where the learner left it.
  const label = `reduced-motion ${journey.id}`
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  try {
    await page.goto(`${baseUrl}/learn/${journey.slug}/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.learn-main__scroll', { timeout: 15_000 })
    const prepared = await prepareAction(page, resolve(page, journey.action))
    if (!prepared) {
      check(`${label} primary action 可点击`, false, describeSpec(journey.action))
      return
    }
    await disableScrollAnchoring(page)
    await page.evaluate(() => {
      const scroller = document.querySelector('.learn-main__scroll')
      window.__proximityScrollEvents = 0
      scroller.addEventListener('scroll', () => {
        window.__proximityScrollEvents += 1
      })
    })
    // Let the harness' own `scrollIntoViewIfNeeded` settle before the listener is
    // attached; from here on any viewport movement is produced by the page.
    await page.waitForTimeout(160)
    const before = await readScroll(page)
    await page.mouse.click(prepared.point.x, prepared.point.y)
    await page.waitForTimeout(260)
    const after = await page.evaluate(() => ({
      scrollTop: Math.round(document.querySelector('.learn-main__scroll').scrollTop),
      events: window.__proximityScrollEvents,
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
          await runJourney(page, baseUrl, journey, viewport)
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
        JOURNEYS.find((journey) => journey.id === 'capstone-mission-brief'),
      )
      await reducedMotionProbe(
        browser,
        baseUrl,
        JOURNEYS.find((journey) => journey.id === 'data-quality-rules-evidence'),
      )
    }

    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await context.newPage()
      try {
        for (const slug of onlyIds
          ? [...new Set(selectedJourneys.map((journey) => journey.slug))]
          : A11Y_LESSONS) {
          await page.goto(`${baseUrl}/learn/${slug}/`, { waitUntil: 'networkidle' })
          await page.waitForSelector('.visualization-section', { timeout: 15_000 })
          const floor = await measureControlFloor(page)
          if (!floor) {
            check(`${slug} visualization section 存在`, false)
            continue
          }
          check(
            `${slug} 触控目标 ≥32px`,
            floor.small.length === 0,
            floor.small.map((entry) => `${entry.cls || entry.tag}(${entry.size})`).join(', '),
          )
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
  } finally {
    await browser.close()
    preview.stop()
  }

  for (const record of measurements) {
    for (const entry of record.geometry.feedback) {
      console.log(
        `[${SCRIPT_NAME}] ${record.id} @${record.viewport} ${entry.label}: ` +
          (entry.missing
            ? 'MISSING\n'
            : `gap=${entry.gaps}px (${entry.screens} screens) visibleStart=${entry.visibleStart} ` +
              `visibleRatio=${entry.visibleRatio} control=[${record.control.contentTop},${record.control.contentBottom}] ` +
              `feedback=[${entry.contentTop},${entry.contentBottom}]${entry.informational ? ' (informational)' : ''}\n`),
      )
    }
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
