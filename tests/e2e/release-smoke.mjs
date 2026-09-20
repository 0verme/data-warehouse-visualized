#!/usr/bin/env node
/**
 * Minimum release gate browser smoke (Playwright, Chromium only).
 *
 * Scope is deliberately tiny: this is the release gate, not a test suite.
 * It visits a handful of Learn pages at exactly two viewports (1280×800 and
 * 390×844) and asserts the paths that a release would break loudly:
 *
 *   1. `/learn` loads without `pageerror`;
 *   2. sidebar → lesson navigation switches lessons (URL + rendered title);
 *   3. the document never owns vertical scrolling (no double scrollbar);
 *   4. no lesson-level horizontal overflow (document / Learn scroller /
 *      `.visualization-section`);
 *   5. table wrappers may scroll locally instead of widening the page;
 *   6. one Step Player interaction advances on click;
 *   7. the Capstone workbench core interaction advances a checkpoint on click.
 *
 * Checks 6 / 7 assert "the interaction works and visibly changed state" — they
 * intentionally do not encode lesson copy or Capstone recovery semantics, so
 * the Capstone verification work (#140 §A) can change behaviour without
 * invalidating this gate.
 *
 * Explicitly out of scope: full-site E2E, multiple browsers, screenshot /
 * visual regression, pixel comparison.
 *
 * Usage:
 *   npm run test:e2e:smoke                 # build + preview + smoke
 *   npm run test:e2e:smoke -- --skip-build # reuse existing dist/
 *   npm run test:e2e:smoke -- --base http://127.0.0.1:4321
 *
 * Requires Chromium: `npx playwright install chromium` (CI installs it).
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
const SCRIPT_NAME = 'release-smoke'

const VIEWPORTS = [
  { name: 'desktop-1280x800', ...DESKTOP_VIEWPORT },
  { name: 'mobile-390x844', ...MOBILE_VIEWPORT },
]

/** Representative lessons: one Step Player, one Capstone, one table-heavy page. */
const LESSON_INDEX = '/learn/'
const NAVIGATION_FROM = '/learn/why-data-warehouse/'
const NAVIGATION_TO_SLUG = 'grain'
const STEP_PLAYER_SLUG = 'sql-transformation-join'
const CAPSTONE_SLUG = 'build-a-warehouse'

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null

const { check, report } = createChecker()

async function measureLayout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const shell = document.querySelector('.learn-main__scroll')
    const sections = Array.from(document.querySelectorAll('.visualization-section'))
    const tables = Array.from(
      document.querySelectorAll('.join-fanout__table-scroll, .capstone-table-wrap'),
    ).map((element) => ({
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollWidth: doc.scrollWidth,
      docScrollHeight: doc.scrollHeight,
      scrollY: window.scrollY,
      shellOverflow: shell ? shell.scrollWidth - shell.clientWidth : null,
      sectionCount: sections.length,
      sectionMaxOverflow: sections.length
        ? Math.max(0, ...sections.map((section) => section.scrollWidth - section.clientWidth))
        : 0,
      tables,
    }
  })
}

function checkLayout(tag, layout, { requireTableScroller = false } = {}) {
  check(
    `${tag} document 不产生横向滚动`,
    layout.docScrollWidth - layout.innerWidth <= TOLERANCE,
    `docScrollWidth=${layout.docScrollWidth} innerWidth=${layout.innerWidth}`,
  )
  check(
    `${tag} Learn 滚动区没有横向溢出`,
    layout.shellOverflow !== null && layout.shellOverflow <= TOLERANCE,
    `shellOverflow=${layout.shellOverflow}`,
  )
  check(
    `${tag} visualization 容器没有横向溢出`,
    layout.sectionMaxOverflow <= TOLERANCE,
    `sections=${layout.sectionCount} maxOverflow=${layout.sectionMaxOverflow}`,
  )
  check(
    `${tag} document 不产生纵向滚动（无双滚动条）`,
    layout.docScrollHeight - layout.innerHeight <= TOLERANCE && layout.scrollY === 0,
    `docScrollHeight=${layout.docScrollHeight} innerHeight=${layout.innerHeight} scrollY=${layout.scrollY}`,
  )

  if (requireTableScroller) {
    const scrollers = layout.tables.filter(
      (table) => table.overflowX === 'auto' || table.overflowX === 'scroll',
    )
    check(
      `${tag} 表格容器保留自身的局部横向滚动`,
      layout.tables.length > 0 && scrollers.length === layout.tables.length,
      `wrappers=${layout.tables.length} scrollers=${scrollers.length}`,
    )
  }
}

/** Attribute every uncaught error to the stage that produced it, then drain. */
function checkPageErrors(tag, errors) {
  const snapshot = errors.splice(0, errors.length)
  check(`${tag} 无 pageerror`, snapshot.length === 0, snapshot.join(' | '))
}

async function openLearnPage(page, baseUrl, path, waitForSelector) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(waitForSelector, { timeout: 15_000 })
}

async function learnIndexProbe(page, baseUrl, tag, errors) {
  await openLearnPage(page, baseUrl, LESSON_INDEX, '.learn-main__scroll')
  const layout = await measureLayout(page)
  checkLayout(`${tag} ${LESSON_INDEX}`, layout)

  const lessonLinks = await page.locator('.course-sidebar a.course-lesson').count()
  check(`${tag} ${LESSON_INDEX} 渲染章节目录`, lessonLinks > 0, `links=${lessonLinks}`)
  checkPageErrors(`${tag} ${LESSON_INDEX}`, errors)
}

async function lessonNavigationProbe(page, baseUrl, tag, errors) {
  await openLearnPage(page, baseUrl, NAVIGATION_FROM, '.lesson-header h1')
  const heading = page.locator('.lesson-header h1')
  const before = (await heading.innerText()).trim()

  const sidebarToggle = page.locator('.sidebar-toggle')
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click()
  }

  const link = page.locator(`a.course-lesson[href$="/learn/${NAVIGATION_TO_SLUG}/"]`).first()
  if (!(await link.isVisible())) {
    // Sidebar chapters are a single-expand accordion; open the target chapter first.
    await page
      .locator(
        `.course-chapter:has(a.course-lesson[href$="/learn/${NAVIGATION_TO_SLUG}/"]) .course-chapter__heading`,
      )
      .first()
      .click()
  }
  await link.waitFor({ state: 'visible', timeout: 15_000 })
  const linkTitle = (await link.locator('.course-lesson__title').innerText()).trim()
  await link.click()
  await page.waitForURL(new RegExp(`/learn/${NAVIGATION_TO_SLUG}/$`), { timeout: 15_000 })
  await page.waitForFunction(
    (previous) =>
      (document.querySelector('.lesson-header h1')?.textContent ?? '').trim() !== previous,
    before,
    { timeout: 15_000 },
  )
  const after = (await heading.innerText()).trim()

  check(
    `${tag} sidebar 切课改变 URL`,
    page.url().endsWith(`/learn/${NAVIGATION_TO_SLUG}/`),
    page.url(),
  )
  check(
    `${tag} sidebar 切课渲染目标课程`,
    after === linkTitle && after !== before,
    `before=${before} after=${after} link=${linkTitle}`,
  )

  const layout = await measureLayout(page)
  checkLayout(`${tag} ${NAVIGATION_TO_SLUG}`, layout)
  checkPageErrors(`${tag} sidebar 切课`, errors)
}

async function stepPlayerProbe(page, baseUrl, tag, errors) {
  const path = `/learn/${STEP_PLAYER_SLUG}/`
  await openLearnPage(page, baseUrl, path, '.learn-main__scroll')

  const layout = await measureLayout(page)
  checkLayout(`${tag} ${path}`, layout, { requireTableScroller: true })

  const progress = page.locator('[role="progressbar"][aria-label="分步进度"]').first()
  await progress.waitFor({ state: 'attached', timeout: 15_000 })
  const stepTitle = page.locator('.join-fanout__toolbar p').first()
  const before = Number(await progress.getAttribute('aria-valuenow'))
  const beforeTitle = (await stepTitle.innerText()).trim()

  const nextButton = page.getByRole('button', { name: '下一步' }).first()
  await nextButton.scrollIntoViewIfNeeded()
  await nextButton.click()
  await page.waitForFunction(
    (previous) =>
      Number(
        document
          .querySelector('[role="progressbar"][aria-label="分步进度"]')
          ?.getAttribute('aria-valuenow'),
      ) > previous,
    before,
    { timeout: 15_000 },
  )

  const after = Number(await progress.getAttribute('aria-valuenow'))
  const afterTitle = (await stepTitle.innerText()).trim()
  check(`${tag} Step Player 点击后步骤前进`, after > before, `before=${before} after=${after}`)
  check(
    `${tag} Step Player 点击后步骤文案变化`,
    afterTitle !== beforeTitle && afterTitle.length > 0,
    `before=${beforeTitle.slice(0, 30)} after=${afterTitle.slice(0, 30)}`,
  )
  checkPageErrors(`${tag} Step Player`, errors)
}

async function capstoneProbe(page, baseUrl, tag, errors) {
  const path = `/learn/${CAPSTONE_SLUG}/`
  await openLearnPage(page, baseUrl, path, '.capstone-workbench')

  const layout = await measureLayout(page)
  checkLayout(`${tag} ${path}`, layout, { requireTableScroller: true })

  const checkpointSignature = () =>
    page.evaluate(() => {
      const completed = document.querySelector('.capstone-header-meta b')?.textContent?.trim() ?? ''
      const states = Array.from(document.querySelectorAll('.capstone-checkpoint'))
        .map(
          (item) =>
            Array.from(item.classList).find((name) => name.startsWith('capstone-checkpoint--')) ??
            '',
        )
        .join(',')
      const status =
        document.querySelector('.capstone-workbench')?.getAttribute('data-capstone-status') ?? ''
      return { completed, states, status }
    })

  const before = await checkpointSignature()
  const action = page
    .locator('.capstone-stage button.capstone-primary-button:not([disabled])')
    .first()
  await action.scrollIntoViewIfNeeded()
  await action.click()
  await page.waitForFunction(
    (previous) =>
      (document.querySelector('.capstone-header-meta b')?.textContent ?? '').trim() !== previous,
    before.completed,
    { timeout: 15_000 },
  )
  const after = await checkpointSignature()

  check(
    `${tag} Capstone 核心交互推进 checkpoint`,
    after.completed !== before.completed,
    `before=${before.completed} after=${after.completed}`,
  )
  check(
    `${tag} Capstone 核心交互更新 checkpoint 状态`,
    after.states !== before.states,
    `before=${before.states.slice(0, 60)} after=${after.states.slice(0, 60)}`,
  )
  checkPageErrors(`${tag} Capstone`, errors)
}

async function runViewport(browser, viewport, baseUrl) {
  const tag = viewport.name
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await learnIndexProbe(page, baseUrl, tag, errors)
    await lessonNavigationProbe(page, baseUrl, tag, errors)
    await stepPlayerProbe(page, baseUrl, tag, errors)
    await capstoneProbe(page, baseUrl, tag, errors)
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
    console.log(`[${SCRIPT_NAME}] smoke against ${preview.baseUrl}`)

    for (const viewport of VIEWPORTS) {
      await runViewport(browser, viewport, preview.baseUrl)
      console.log(`[${SCRIPT_NAME}] ${viewport.name} done`)
    }
  } finally {
    await browser.close()
    preview?.stop()
  }

  if (report(SCRIPT_NAME) > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
