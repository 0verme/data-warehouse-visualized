#!/usr/bin/env node
/**
 * Learn page scroll-boundary regression (Playwright).
 *
 * Encodes the Learning Shell layout invariant discovered while fixing the
 * document-level overscroll caused by absolutely positioned `.sr-only` boxes:
 *
 *   1. /learn/* documents never own vertical scrolling
 *      (`documentElement.scrollHeight ≈ innerHeight`, `window.scrollY === 0`).
 *   2. `.learn-main__scroll` and `.course-sidebar` stay the scroll owners.
 *   3. The shared `.sr-only` utility never contributes to document scroll
 *      extent (verified by temporarily hiding every `.sr-only` node).
 *   4. `.sr-only` content is still exposed to assistive technology.
 *   5. Ordinary (non-Learn) pages still scroll the document normally.
 *
 * The script is opt-in because the repository has no browser-test CI job yet.
 * The CI-runnable CSS/SSR contract lives in `tests/learn-shell-layout.test.tsx`.
 *
 * Usage:
 *   npm run test:e2e:learn-scroll                 # build + preview + scan
 *   npm run test:e2e:learn-scroll -- --skip-build # reuse existing dist/
 *   npm run test:e2e:learn-scroll -- --base http://127.0.0.1:4321
 *
 * Requires the `playwright` package (not an app dependency):
 *   npm i -D playwright && npx playwright install chromium
 * Override resolution with `PLAYWRIGHT_MODULE=/path/to/node_modules/playwright`.
 */
import { execFileSync, spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST_LEARN = join(ROOT, 'dist', 'learn')
const TOLERANCE = 1

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-320x720', width: 320, height: 720 },
]

/** Lessons that reproduced the original document overscroll at 1440x900. */
const REGRESSION_LESSONS = [
  'deposit-metric-derivations',
  'deposit-metric-time',
  'fact-table-types',
  'lakehouse-table-layer',
  'lakehouse-unity',
  'metric-system',
  'slowly-changing-dimension',
  'sql-and-transformation',
  'sql-transformation-cleaning',
  'sql-transformation-contract',
  'sql-transformation-join',
  'sql-transformation-layers',
  'data-lineage',
]

/** Lessons whose captions were only safe because an ancestor had a transform. */
const TRANSFORM_PROTECTED_LESSONS = ['grain', 'star-schema-and-grain']

const INTERACTION_LESSONS = ['deposit-metric-derivations', 'sql-transformation-join', 'grain']
const SHORT_LESSON = 'why-data-warehouse'

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null

let failures = 0
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (!condition) {
    failures += 1
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  const candidates = process.env.PLAYWRIGHT_MODULE
    ? [process.env.PLAYWRIGHT_MODULE, 'playwright']
    : ['playwright']

  for (const id of candidates) {
    try {
      return require(id)
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'playwright not found. Install it with `npm i -D playwright && npx playwright install chromium` ' +
      'or point PLAYWRIGHT_MODULE at an existing installation.',
  )
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`preview server did not become ready: ${url}`)
}

function readLessonSlugs() {
  return readdirSync(DIST_LEARN, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function measureShell(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('.learn-main__scroll')
    const sidebar = document.querySelector('.course-sidebar')
    const nav = document.querySelector('.lesson-nav')
    const app = document.querySelector('.learn-app')
    const srOnlyNodes = Array.from(document.querySelectorAll('.sr-only'))

    const docScrollHeight = document.documentElement.scrollHeight
    for (const node of srOnlyNodes) {
      node.style.display = 'none'
    }
    const docScrollHeightWithoutSrOnly = document.documentElement.scrollHeight
    for (const node of srOnlyNodes) {
      node.style.display = ''
    }

    const shellRect = app.getBoundingClientRect()
    const navRect = nav.getBoundingClientRect()
    const scrollRect = scroller.getBoundingClientRect()

    return {
      innerHeight: window.innerHeight,
      docScrollHeight,
      docScrollHeightWithoutSrOnly,
      windowScrollY: window.scrollY,
      shellTop: Math.round(shellRect.top),
      shellBottom: Math.round(shellRect.bottom),
      navTop: Math.round(navRect.top),
      navBottom: Math.round(navRect.bottom),
      scrollTop: Math.round(scrollRect.top),
      scrollBottom: Math.round(scrollRect.bottom),
      scrollerClientHeight: scroller.clientHeight,
      scrollerScrollHeight: scroller.scrollHeight,
      sidebarClientHeight: sidebar.clientHeight,
      sidebarScrollHeight: sidebar.scrollHeight,
      srOnlyCount: srOnlyNodes.length,
      srOnlySemanticsViolations: srOnlyNodes.filter((node) => {
        const style = getComputedStyle(node)
        return (
          style.display === 'none' || style.visibility === 'hidden' || style.position === 'static'
        )
      }).length,
    }
  })
}

async function scanPage(page, baseUrl, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.learn-main__scroll', { timeout: 15_000 })
  const m = await measureShell(page)

  check(
    `${path} document 不产生纵向滚动`,
    m.docScrollHeight - m.innerHeight <= TOLERANCE,
    `docScrollHeight=${m.docScrollHeight} innerHeight=${m.innerHeight}`,
  )
  check(`${path} window.scrollY 为 0`, m.windowScrollY === 0, `scrollY=${m.windowScrollY}`)
  check(
    `${path} .sr-only 不贡献 document 高度`,
    m.docScrollHeightWithoutSrOnly === m.docScrollHeight,
    `with=${m.docScrollHeight} without=${m.docScrollHeightWithoutSrOnly}`,
  )
  check(
    `${path} .sr-only 语义未退化为不可访问`,
    m.srOnlySemanticsViolations === 0,
    `violations=${m.srOnlySemanticsViolations}/${m.srOnlyCount}`,
  )
  check(`${path} shell 顶部对齐 viewport`, m.shellTop === 0, `shellTop=${m.shellTop}`)
  check(
    `${path} shell 占满 viewport 且底部导航可见`,
    m.shellBottom <= m.innerHeight + TOLERANCE && m.navBottom <= m.innerHeight + TOLERANCE,
    `shellBottom=${m.shellBottom} navBottom=${m.navBottom} innerHeight=${m.innerHeight}`,
  )
  check(
    `${path} 正文滚动区与底部导航无缝衔接`,
    Math.abs(m.scrollBottom - m.navTop) <= TOLERANCE,
    `scrollBottom=${m.scrollBottom} navTop=${m.navTop}`,
  )
  check(
    `${path} 正文滚动区内部滚动模型成立`,
    m.scrollerScrollHeight >= m.scrollerClientHeight,
    `clientHeight=${m.scrollerClientHeight} scrollHeight=${m.scrollerScrollHeight}`,
  )

  return m
}

async function scrollOwnershipProbe(page, baseUrl, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.learn-main__scroll', { timeout: 15_000 })

  const maxMainScroll = await page.evaluate(() => {
    const scroller = document.querySelector('.learn-main__scroll')
    return scroller.scrollHeight - scroller.clientHeight
  })

  await page.hover('.learn-main__scroll')
  await page.mouse.wheel(0, 2400)
  await page.waitForTimeout(200)
  const afterWheel = await page.evaluate(() => {
    const scroller = document.querySelector('.learn-main__scroll')
    return { scrollY: window.scrollY, mainScrollTop: scroller.scrollTop }
  })

  const afterInnerEnd = await page.evaluate(() => {
    const scroller = document.querySelector('.learn-main__scroll')
    scroller.scrollTop = scroller.scrollHeight
    return {
      scrollY: window.scrollY,
      mainScrollTop: scroller.scrollTop,
      maxMainScroll: scroller.scrollHeight - scroller.clientHeight,
    }
  })

  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
  })
  await page.keyboard.press('End')
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(150)
  const afterKeyboard = await page.evaluate(() => window.scrollY)

  const afterForce = await page.evaluate(() => {
    window.scrollTo(0, 600)
    document.documentElement.scrollTop = 600
    document.body.scrollTop = 600
    return window.scrollY
  })

  check(
    `${path} wheel 滚动由正文滚动区拥有`,
    afterWheel.scrollY === 0 && (maxMainScroll === 0 || afterWheel.mainScrollTop > 0),
    `scrollY=${afterWheel.scrollY} mainScrollTop=${afterWheel.mainScrollTop} max=${maxMainScroll}`,
  )
  check(`${path} 内部可以滚到底`, afterInnerEnd.scrollY === 0, `scrollY=${afterInnerEnd.scrollY}`)
  check(`${path} 键盘滚动不会驱动 document`, afterKeyboard === 0, `scrollY=${afterKeyboard}`)
  check(`${path} 无法强制 document 滚动`, afterForce === 0, `scrollY=${afterForce}`)

  return { maxMainScroll }
}

async function sidebarProbe(page, baseUrl) {
  await page.goto(`${baseUrl}/learn/sql-transformation-join/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.course-sidebar')
  const result = await page.evaluate(() => {
    const sidebar = document.querySelector('.course-sidebar')
    sidebar.scrollTop = sidebar.scrollHeight
    return {
      clientHeight: sidebar.clientHeight,
      scrollHeight: sidebar.scrollHeight,
      scrollTop: sidebar.scrollTop,
      scrollY: window.scrollY,
    }
  })

  check(
    'sidebar 内容超高时可独立滚动',
    result.scrollHeight <= result.clientHeight || (result.scrollTop > 0 && result.scrollY === 0),
    `clientHeight=${result.clientHeight} scrollHeight=${result.scrollHeight} scrollTop=${result.scrollTop}`,
  )
}

async function srOnlyAccessibilityProbe(context, page, baseUrl) {
  await page.goto(`${baseUrl}/learn/deposit-metric-derivations/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('caption.sr-only', { timeout: 15_000 })
  const captionInfo = await page.evaluate(() => {
    const caption = document.querySelector('caption.sr-only')
    const style = getComputedStyle(caption)
    return {
      text: caption.textContent.trim(),
      display: style.display,
      visibility: style.visibility,
      ariaHidden: caption.getAttribute('aria-hidden'),
      width: caption.getBoundingClientRect().width,
      height: caption.getBoundingClientRect().height,
    }
  })

  check('sr-only caption 仍保留 caption 文本', captionInfo.text.length > 0, captionInfo.text)
  check(
    'sr-only caption 未被 display/visibility 隐藏',
    captionInfo.display !== 'none' && captionInfo.visibility !== 'hidden',
  )
  check('sr-only caption 未设置 aria-hidden', captionInfo.ariaHidden === null)
  check(
    'sr-only caption 尺寸被裁剪到 1px 级',
    captionInfo.width <= 2 && captionInfo.height <= 2,
    `${captionInfo.width}x${captionInfo.height}`,
  )

  const client = await context.newCDPSession(page)
  await client.send('Accessibility.enable')
  const tree = await client.send('Accessibility.getFullAXTree')
  const exposed = tree.nodes.some((node) => node.name?.value?.includes(captionInfo.text))
  check('sr-only caption 仍出现在 accessibility tree', exposed, captionInfo.text)
  await client.detach()
}

async function navigationStateProbe(page, baseUrl) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  const home = await page.evaluate(() => ({
    hasLearnClass: document.documentElement.classList.contains('learn-page'),
    docScrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }))
  check('普通首页不携带 learn-page', !home.hasLearnClass)

  const homeScrollable = await page.evaluate(async () => {
    window.scrollTo({ top: 400, behavior: 'instant' })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return window.scrollY
  })
  check(
    '普通首页仍允许 document 滚动',
    home.docScrollHeight > home.innerHeight && homeScrollable > 0,
    `docScrollHeight=${home.docScrollHeight} innerHeight=${home.innerHeight} scrollY=${homeScrollable}`,
  )

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.click('.home-hero__actions a')
  await page.waitForSelector('.learn-app')
  await page.waitForTimeout(300)
  const learn = await page.evaluate(() => ({
    hasLearnClass: document.documentElement.classList.contains('learn-page'),
    pathname: location.pathname,
  }))
  check('客户端跳转到 /learn/ 后 learn-page 生效', learn.hasLearnClass, learn.pathname)

  await page.click('.brand--learn')
  await page.waitForSelector('.home-main')
  await page.waitForTimeout(300)
  const backHome = await page.evaluate(() => ({
    hasLearnClass: document.documentElement.classList.contains('learn-page'),
    pathname: location.pathname,
    scrollY: window.scrollY,
  }))
  check('离开 /learn/ 后 learn-page 恢复', !backHome.hasLearnClass, backHome.pathname)
}

async function main() {
  const { chromium } = loadPlaywright()
  const launchOptions = process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : {}
  const browser = await chromium.launch(launchOptions)

  let preview = null
  let baseUrl = externalBase

  try {
    if (!baseUrl) {
      if (!skipBuild) {
        console.log('[learn-scroll] building static site…')
        execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
      }
      const port = await getFreePort()
      baseUrl = `http://127.0.0.1:${port}`
      preview = spawn('npx', ['astro', 'preview', '--port', String(port), '--host', '127.0.0.1'], {
        cwd: ROOT,
        stdio: 'ignore',
        detached: true,
      })
      await waitForServer(`${baseUrl}/learn/`)
    }

    const lessonSlugs = readLessonSlugs()
    const pagePaths = ['/learn/', ...lessonSlugs.map((slug) => `/learn/${slug}/`)]
    console.log(
      `[learn-scroll] scanning ${pagePaths.length} Learn pages × ${VIEWPORTS.length} viewports at ${baseUrl}`,
    )

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      for (const path of pagePaths) {
        const page = await context.newPage()
        try {
          const m = await scanPage(page, baseUrl, path)
          if (m.docScrollHeight - m.innerHeight > TOLERANCE) {
            console.error(
              `  doc overflow: ${viewport.name} ${path} docH=${m.docScrollHeight} innerH=${m.innerHeight}`,
            )
          }
        } finally {
          await page.close()
        }
      }
      await context.close()
      console.log(`[learn-scroll] ${viewport.name} scanned`)
    }

    const interactionPaths = [
      ...new Set([
        '/learn/',
        ...[
          ...REGRESSION_LESSONS.slice(0, 3),
          ...TRANSFORM_PROTECTED_LESSONS,
          ...INTERACTION_LESSONS,
          SHORT_LESSON,
        ].map((slug) => `/learn/${slug}/`),
      ]),
    ]

    for (const viewport of [VIEWPORTS[0], VIEWPORTS[3]]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      for (const path of interactionPaths) {
        const page = await context.newPage()
        try {
          await scrollOwnershipProbe(page, baseUrl, path)
        } finally {
          await page.close()
        }
      }
      if (viewport.name === 'desktop-1440x900') {
        const sidebarPage = await context.newPage()
        try {
          await sidebarProbe(sidebarPage, baseUrl)
        } finally {
          await sidebarPage.close()
        }
      }
      await context.close()
      console.log(`[learn-scroll] ${viewport.name} interaction probe done`)
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      try {
        await srOnlyAccessibilityProbe(context, page, baseUrl)
        await navigationStateProbe(page, baseUrl)
      } finally {
        await page.close()
        await context.close()
      }
    }

    console.log(`[learn-scroll] ${checks - failures}/${checks} checks passed`)
    if (failures > 0) {
      console.error(`[learn-scroll] FAILED with ${failures} failing checks`)
    }
  } finally {
    await browser.close()
    if (preview?.pid) {
      try {
        process.kill(-preview.pid, 'SIGTERM')
      } catch {
        preview.kill('SIGTERM')
      }
    }
  }

  if (failures > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
