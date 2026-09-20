#!/usr/bin/env node
/**
 * Learn page fragment (deep link) regression — #148 P1-A.
 *
 * Learn pages lock the document (`html.learn-page`) and scroll
 * `.learn-main__scroll` instead, so Astro's ClientRouter cannot position a
 * fragment link: the hash updates but the inner scroller never moves. This
 * suite pins the contract that fixes it:
 *
 *   1. hard navigation to `/learn/<slug>/#<anchor>` still lands on the heading
 *      (browser-native, must not regress);
 *   2. a ClientRouter soft navigation from lesson A to lesson B with a
 *      fragment lands on the heading;
 *   3. an in-page fragment click only scrolls the lesson scroller — no
 *      navigation / swap / lesson reload;
 *   4. an unknown anchor degrades to the lesson top without throwing;
 *   5. a `/learn/` hard load that restores a lazily loaded progress lesson is
 *      positioned after `useLessonContent` resolves (no native scroll target);
 *   6. a fragment jump never introduces horizontal or document-level vertical
 *      scrolling at 390 / 320, and never duplicates a DOM id.
 *
 * Targets the narrative heading ids added by P1-A (`{lessonId}-section-N-title`),
 * because those are exactly the anchors the search index will link to.
 *
 * Usage:
 *   npm run test:e2e:learn-anchor                 # build + preview + run
 *   npm run test:e2e:learn-anchor -- --skip-build # reuse existing dist/
 *   npm run test:e2e:learn-anchor -- --base http://127.0.0.1:4321
 *
 * Requires the `playwright` devDependency and a Chromium build:
 *   npx playwright install chromium
 * Override resolution with `PLAYWRIGHT_MODULE=/path/to/node_modules/playwright`.
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
const SCRIPT_NAME = 'learn-anchor'

const DESKTOP_VIEWPORT = { name: 'desktop-1280x800', width: 1280, height: 800 }
const MOBILE_VIEWPORT = { name: 'mobile-390x844', width: 390, height: 844 }
const SMALL_MOBILE_VIEWPORT = { name: 'mobile-320x720', width: 320, height: 720 }

const FROM_SLUG = 'why-data-warehouse'
const TO_SLUG = 'scheduling-sla'
const TO_LESSON_ID = 'lesson-scheduling-sla'
/** Narrative heading added by P1-A — the anchor shape the search index will use. */
const TO_NARRATIVE_ANCHOR = `${TO_LESSON_ID}-section-2-title`
const TO_TAKEAWAY_ANCHOR = `${TO_LESSON_ID}-section-3-takeaway-title`
const INVALID_TARGET_SLUG = 'grain'
const INVALID_TARGET_LESSON_ID = 'lesson-grain'
const INVALID_ANCHOR = 'lesson-grain-section-99-title'

/** Mirrors `PROGRESS_STORAGE_KEY` in `src/utils/progress.ts` (plain-node e2e). */
const PROGRESS_STORAGE_KEY = 'data-warehouse-visualized:progress'

/** Delay the target lesson chunk so "content first, then position" is deterministic. */
const SLOW_LESSON_REQUEST_PATTERN = `**/${TO_SLUG}.*.js`
const SLOW_LESSON_DELAY_MS = 700

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null

const { check, report } = createChecker()

function checkPageErrors(tag, errors, { ignore } = {}) {
  const snapshot = errors.splice(0, errors.length).filter((message) => !(ignore && ignore(message)))
  check(`${tag} 无 pageerror`, snapshot.length === 0, snapshot.join(' | '))
}

/**
 * Everything the fragment assertions need in one evaluate round-trip:
 * scroll owner geometry, target geometry, document extents, duplicate ids.
 */
async function readAnchorState(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('.learn-main__scroll')
    const scrollerRect = scroller ? scroller.getBoundingClientRect() : null

    let anchorId = window.location.hash.slice(1)
    try {
      anchorId = decodeURIComponent(anchorId)
    } catch {
      // keep the raw value; the lookup below simply misses
    }

    const target = anchorId ? document.getElementById(anchorId) : null
    const targetRect = target ? target.getBoundingClientRect() : null

    const seen = new Set()
    const duplicateIds = []
    for (const element of document.querySelectorAll('[id]')) {
      if (seen.has(element.id)) {
        duplicateIds.push(element.id)
      } else {
        seen.add(element.id)
      }
    }

    return {
      hash: window.location.hash,
      pathname: window.location.pathname,
      scrollTop: scroller ? Math.round(scroller.scrollTop) : 0,
      scrollerTop: scrollerRect ? Math.round(scrollerRect.top) : null,
      scrollerHeight: scroller ? scroller.clientHeight : null,
      targetExists: Boolean(target),
      targetTop: targetRect ? Math.round(targetRect.top) : null,
      windowScrollY: window.scrollY,
      docScrollWidth: document.documentElement.scrollWidth,
      docScrollHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      duplicateIds,
    }
  })
}

/** Wait (bounded) for the target to exist and the scroller to leave the top. */
async function waitForAnchorPosition(page, anchorId, timeout = 15_000) {
  try {
    await page.waitForFunction(
      (id) => {
        const target = document.getElementById(id)
        const scroller = document.querySelector('.learn-main__scroll')
        return Boolean(target && scroller && scroller.scrollTop > 0)
      },
      anchorId,
      { timeout },
    )
    return true
  } catch {
    return false
  }
}

function checkGeometry(tag, state, viewport) {
  check(
    `${tag} document 不产生横向滚动`,
    state.docScrollWidth - viewport.width <= TOLERANCE,
    `docScrollWidth=${state.docScrollWidth} viewport=${viewport.width}`,
  )
  check(
    `${tag} document 不产生额外纵向滚动`,
    state.docScrollHeight - viewport.height <= TOLERANCE && state.windowScrollY === 0,
    `docScrollHeight=${state.docScrollHeight} viewport=${viewport.height} scrollY=${state.windowScrollY}`,
  )
  check(`${tag} 页面 id 无重复`, state.duplicateIds.length === 0, state.duplicateIds.join(', '))
}

function checkTargetVisible(tag, state) {
  const insideScrollport =
    state.targetExists &&
    state.targetTop !== null &&
    state.scrollerTop !== null &&
    state.scrollerHeight !== null &&
    state.targetTop >= state.scrollerTop - TOLERANCE &&
    state.targetTop <= state.scrollerTop + state.scrollerHeight - TOLERANCE

  check(`${tag} 目标 heading 落在滚动口内`, insideScrollport, `state=${JSON.stringify(state)}`)
  check(
    `${tag} 目标 heading 未被顶部裁切`,
    state.targetTop !== null && state.scrollerTop !== null
      ? state.targetTop >= state.scrollerTop - TOLERANCE
      : false,
  )
}

/** Inject a same-origin link and click it, so ClientRouter performs a soft navigation. */
async function clickInjectedLink(page, href, linkId) {
  await page.evaluate(
    ({ targetHref, id }) => {
      const link = document.createElement('a')
      link.id = id
      link.href = targetHref
      link.textContent = 'probe'
      link.style.position = 'fixed'
      link.style.top = '0'
      link.style.left = '0'
      link.style.zIndex = '9999'
      document.body.appendChild(link)
    },
    { targetHref: href, id: linkId },
  )

  await page.click(`#${linkId}`)
}

async function hardNavigationProbe(browser, baseUrl, viewport) {
  const tag = `${viewport.name} 硬导航`
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}/learn/${TO_SLUG}/#${TO_NARRATIVE_ANCHOR}`, {
      waitUntil: 'networkidle',
    })
    const positioned = await waitForAnchorPosition(page, TO_NARRATIVE_ANCHOR)
    const state = await readAnchorState(page)

    check(`${tag} hash 保持`, state.hash === `#${TO_NARRATIVE_ANCHOR}`, `hash=${state.hash}`)
    check(`${tag} 浏览器原生定位生效`, positioned)
    check(`${tag} 滚动容器已滚动`, state.scrollTop > 0, `scrollTop=${state.scrollTop}`)
    checkTargetVisible(tag, state)
    checkGeometry(tag, state, viewport)
    checkPageErrors(tag, errors)
  } finally {
    await page.close()
    await context.close()
  }
}

async function softNavigationProbe(browser, baseUrl) {
  const tag = `${DESKTOP_VIEWPORT.name} 软跳转`
  const context = await browser.newContext({
    viewport: { width: DESKTOP_VIEWPORT.width, height: DESKTOP_VIEWPORT.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}/learn/${FROM_SLUG}/`, { waitUntil: 'networkidle' })
    await page.evaluate(() => {
      window.__learnAnchorSoftNavToken = 'alive'
    })

    await clickInjectedLink(
      page,
      `${baseUrl}/learn/${TO_SLUG}/#${TO_NARRATIVE_ANCHOR}`,
      '__learn-anchor-soft-link',
    )

    const positioned = await waitForAnchorPosition(page, TO_NARRATIVE_ANCHOR)
    const state = await readAnchorState(page)
    const token = await page.evaluate(() => window.__learnAnchorSoftNavToken)

    check(`${tag} 最终定位到目标 heading`, positioned)
    check(`${tag} hash 保持`, state.hash === `#${TO_NARRATIVE_ANCHOR}`, `hash=${state.hash}`)
    check(`${tag} 滚动容器已滚动`, state.scrollTop > 0, `scrollTop=${state.scrollTop}`)
    check(
      `${tag} 未发生整页刷新（ClientRouter 软跳转）`,
      token === 'alive' && state.pathname.endsWith(`/learn/${TO_SLUG}/`),
      `token=${token} pathname=${state.pathname}`,
    )
    checkTargetVisible(tag, state)
    checkGeometry(tag, state, DESKTOP_VIEWPORT)
    checkPageErrors(tag, errors)

    await sameLessonFragmentProbe(page, tag, errors)
  } finally {
    await page.close()
    await context.close()
  }
}

async function sameLessonFragmentProbe(page, tag, errors) {
  const before = await readAnchorState(page)

  await page.evaluate(() => {
    window.__learnAnchorAfterSwap = 0
    document.addEventListener('astro:after-swap', () => {
      window.__learnAnchorAfterSwap += 1
    })
    const scroller = document.querySelector('.learn-main__scroll')
    if (scroller) {
      scroller.scrollTo({ top: 0, behavior: 'instant' })
    }
  })

  await clickInjectedLink(page, `#${TO_TAKEAWAY_ANCHOR}`, '__learn-anchor-same-link')
  await waitForAnchorPosition(page, TO_TAKEAWAY_ANCHOR)

  const state = await readAnchorState(page)
  const afterSwapCount = await page.evaluate(() => window.__learnAnchorAfterSwap)

  check(`${tag} 同课 hash 只滚动不重新导航`, afterSwapCount === 0, `afterSwap=${afterSwapCount}`)
  check(`${tag} 同课 hash 不改变 pathname`, state.pathname === before.pathname)
  check(
    `${tag} 同课 hash 更新到目标 anchor`,
    state.hash === `#${TO_TAKEAWAY_ANCHOR}`,
    `hash=${state.hash}`,
  )
  check(`${tag} 同课 hash 已滚动`, state.scrollTop > 0, `scrollTop=${state.scrollTop}`)
  checkTargetVisible(`${tag} 同课`, state)
  checkPageErrors(`${tag} 同课`, errors)
}

async function invalidAnchorProbe(browser, baseUrl) {
  const tag = `${DESKTOP_VIEWPORT.name} 无效 anchor`
  const context = await browser.newContext({
    viewport: { width: DESKTOP_VIEWPORT.width, height: DESKTOP_VIEWPORT.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}/learn/${FROM_SLUG}/`, { waitUntil: 'networkidle' })
    await page.evaluate(() => {
      const scroller = document.querySelector('.learn-main__scroll')
      if (scroller) {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' })
      }
    })
    const before = await readAnchorState(page)
    check(`${tag} 出发页先滚动离开顶部`, before.scrollTop > 0, `scrollTop=${before.scrollTop}`)

    await clickInjectedLink(
      page,
      `${baseUrl}/learn/${INVALID_TARGET_SLUG}/#${INVALID_ANCHOR}`,
      '__learn-anchor-invalid-link',
    )

    const targetTitleId = `${INVALID_TARGET_LESSON_ID}-title`
    const ready = await page
      .waitForFunction(
        (lessonTitleId) => Boolean(document.getElementById(lessonTitleId)),
        targetTitleId,
        {
          timeout: 15_000,
        },
      )
      .then(() => true)
      .catch(() => false)
    check(`${tag} 目标课程内容已加载`, ready)

    const settled = await page
      .waitForFunction(
        (lessonTitleId) => {
          const scroller = document.querySelector('.learn-main__scroll')
          if (!document.getElementById(lessonTitleId) || !scroller) {
            return false
          }
          return scroller.scrollTop === 0
        },
        targetTitleId,
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false)

    const state = await readAnchorState(page)

    check(
      `${tag} 安全降级到课程顶部`,
      settled && state.scrollTop === 0,
      `scrollTop=${state.scrollTop}`,
    )
    check(
      `${tag} 失效 hash 不再指向任何元素`,
      !state.targetExists,
      `targetExists=${state.targetExists}`,
    )
    checkGeometry(tag, state, DESKTOP_VIEWPORT)
    checkPageErrors(tag, errors)
  } finally {
    await page.close()
    await context.close()
  }
}

async function lazyContentInitialLoadProbe(browser, baseUrl) {
  const tag = `${DESKTOP_VIEWPORT.name} 懒加载内容定位`
  const context = await browser.newContext({
    viewport: { width: DESKTOP_VIEWPORT.width, height: DESKTOP_VIEWPORT.height },
  })

  // `/learn/` restores the stored progress lesson; make that lesson the delayed
  // one so its content genuinely arrives through `useLessonContent`.
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value)
    },
    [
      PROGRESS_STORAGE_KEY,
      JSON.stringify({ completedLessonIds: [], currentLessonId: TO_LESSON_ID }),
    ],
  )
  await context.route(SLOW_LESSON_REQUEST_PATTERN, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_LESSON_DELAY_MS))
    await route.continue()
  })

  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}/learn/#${TO_NARRATIVE_ANCHOR}`, { waitUntil: 'domcontentloaded' })

    const initialState = await readAnchorState(page)
    check(`${tag} 内容加载前目标不存在`, !initialState.targetExists)
    check(`${tag} 内容加载前未被原生 fragment 误定位`, initialState.scrollTop === 0)

    const positioned = await waitForAnchorPosition(page, TO_NARRATIVE_ANCHOR)
    const state = await readAnchorState(page)

    check(`${tag} 异步内容加载后最终定位`, positioned)
    check(`${tag} hash 保持`, state.hash === `#${TO_NARRATIVE_ANCHOR}`, `hash=${state.hash}`)
    check(`${tag} 滚动容器已滚动`, state.scrollTop > 0, `scrollTop=${state.scrollTop}`)
    checkTargetVisible(tag, state)
    checkGeometry(tag, state, DESKTOP_VIEWPORT)
    // `/learn/` hydrates lesson 1 and then switches to the stored progress
    // lesson, which already logs a pre-existing React #418 text mismatch on
    // main. This probe is about fragment positioning, not hydration.
    checkPageErrors(tag, errors, {
      ignore: (message) => message.includes('Minified React error #418'),
    })
  } finally {
    await page.close()
    await context.close()
  }
}

async function mobileProbe(browser, baseUrl, viewport) {
  const tag = `${viewport.name} 移动端 fragment`
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    // Hard navigation
    await page.goto(`${baseUrl}/learn/${TO_SLUG}/#${TO_NARRATIVE_ANCHOR}`, {
      waitUntil: 'networkidle',
    })
    await waitForAnchorPosition(page, TO_NARRATIVE_ANCHOR)
    const hardState = await readAnchorState(page)
    checkTargetVisible(`${tag} 硬导航`, hardState)
    checkGeometry(`${tag} 硬导航`, hardState, viewport)

    // Soft navigation
    await page.goto(`${baseUrl}/learn/${FROM_SLUG}/`, { waitUntil: 'networkidle' })
    await clickInjectedLink(
      page,
      `${baseUrl}/learn/${TO_SLUG}/#${TO_NARRATIVE_ANCHOR}`,
      '__learn-anchor-mobile-link',
    )
    const positioned = await waitForAnchorPosition(page, TO_NARRATIVE_ANCHOR)
    const softState = await readAnchorState(page)

    check(`${tag} 软跳转定位`, positioned)
    checkTargetVisible(`${tag} 软跳转`, softState)
    checkGeometry(`${tag} 软跳转`, softState, viewport)
    checkPageErrors(tag, errors)
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
    console.log(`[${SCRIPT_NAME}] fragment checks against ${preview.baseUrl}`)

    await hardNavigationProbe(browser, preview.baseUrl, DESKTOP_VIEWPORT)
    await softNavigationProbe(browser, preview.baseUrl)
    await invalidAnchorProbe(browser, preview.baseUrl)
    await lazyContentInitialLoadProbe(browser, preview.baseUrl)
    await mobileProbe(browser, preview.baseUrl, MOBILE_VIEWPORT)
    await mobileProbe(browser, preview.baseUrl, SMALL_MOBILE_VIEWPORT)
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
