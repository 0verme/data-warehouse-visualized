#!/usr/bin/env node
/**
 * Knowledge Search browser regression — #148 P1-C.
 *
 * Exercises lazy loading, dialog keyboard/focus behavior, desktop/mobile entry
 * points, result rendering, real anchor positioning, and browser history using
 * the production build served by astro preview.
 *
 * Usage:
 *   npm run test:e2e:search                 # build + preview + run
 *   npm run test:e2e:search -- --skip-build # reuse dist/
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'knowledge-search'
const PROGRESS_STORAGE_KEY = 'data-warehouse-visualized:progress'
const CURRENT_SLUG = 'performance-first-seen'
const CROSS_FROM_SLUG = 'why-data-warehouse'
const CROSS_TO_SLUG = 'scheduling-rerun'

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

async function waitForIndexReady(page) {
  await page.waitForFunction(() => {
    const status = document.querySelector('.learn-search-dialog__status')
    return Boolean(
      status &&
      !status.textContent?.includes('正在加载') &&
      !status.textContent?.includes('Loading'),
    )
  })
}

async function getResultHrefs(page) {
  return page
    .locator('[role="option"]')
    .evaluateAll((options) => options.map((option) => option.getAttribute('href')).filter(Boolean))
}

async function waitForVisibleAnchor(page, timeout = 15_000) {
  return page
    .waitForFunction(
      () => {
        let anchor = window.location.hash.slice(1)
        try {
          anchor = decodeURIComponent(anchor)
        } catch {
          // Keep the literal hash and let the lookup fail normally.
        }
        const target = anchor ? document.getElementById(anchor) : null
        const scroller = document.querySelector('.learn-main__scroll')
        if (!target || !scroller || scroller.scrollTop <= 0) return false
        const targetRect = target.getBoundingClientRect()
        const scrollerRect = scroller.getBoundingClientRect()
        return targetRect.top >= scrollerRect.top - 1 && targetRect.top < scrollerRect.bottom
      },
      undefined,
      { timeout },
    )
    .then(() => true)
    .catch(() => false)
}

function parseRgb(color) {
  const values = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number)
  return values?.length === 3 ? values : null
}

function contrastRatio(foreground, background) {
  const fg = parseRgb(foreground)
  const bg = parseRgb(background)
  if (!fg || !bg) return 0

  const luminance = ([red, green, blue]) => {
    const channels = [red, green, blue].map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const first = luminance(fg)
  const second = luminance(bg)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

async function ensureTheme(page, theme) {
  await page.waitForFunction(() =>
    ['light', 'dark'].includes(document.documentElement.dataset.theme),
  )
  if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
    await page.locator('.theme-toggle').click()
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.theme === expected,
      theme,
    )
  }
}

async function recordGeometry(page, tag, viewport) {
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    scrollY: window.scrollY,
    dialog: (() => {
      const element = document.querySelector('.learn-search-dialog')
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      }
    })(),
  }))

  check(
    `${tag} document 无横向溢出`,
    geometry.width <= viewport.width + 1,
    `scrollWidth=${geometry.width} viewport=${viewport.width}`,
  )
  check(
    `${tag} document 无额外滚动`,
    geometry.height <= viewport.height + 1 && geometry.scrollY === 0,
    `scrollHeight=${geometry.height} viewport=${viewport.height} scrollY=${geometry.scrollY}`,
  )
  if (geometry.dialog) {
    check(
      `${tag} dialog 在视口内`,
      geometry.dialog.left >= -1 && geometry.dialog.right <= viewport.width + 1,
      `dialog=${JSON.stringify(geometry.dialog)}`,
    )
  }
}

async function desktopProbe(browser, baseUrl) {
  const viewport = { width: 1280, height: 800 }
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  const indexRequests = []
  const dialogChunkRequests = []
  page.on('request', (request) => {
    if (request.url().includes('/search-index.json')) indexRequests.push(request.url())
    if (request.url().includes('/_astro/SearchDialog.') && request.url().endsWith('.js')) {
      dialogChunkRequests.push(request.url())
    }
  })

  try {
    await page.goto(`${baseUrl}/learn/${CROSS_FROM_SLUG}/`, { waitUntil: 'networkidle' })
    const progressBeforeOpen = await page.evaluate(
      (key) => localStorage.getItem(key),
      PROGRESS_STORAGE_KEY,
    )
    const initialSearchRequests = indexRequests.length
    check('普通 Learn 首屏未请求 search index', initialSearchRequests === 0)
    check('普通 Learn 首屏未下载 SearchDialog chunk', dialogChunkRequests.length === 0)
    check(
      'Desktop 顶栏搜索入口可见',
      await page.locator('.learn-search-trigger--desktop').isVisible(),
    )

    // Keyboard-only open, suggestions, focus, result states, and modifier shortcuts.
    await page.keyboard.press('Control+k')
    const dialog = page.locator('#learn-search-dialog')
    await dialog.waitFor({ state: 'visible' })
    const input = page.getByRole('combobox', { name: '搜索课程内容' })
    await waitForIndexReady(page)
    check('Ctrl+K 打开 SearchDialog', await dialog.isVisible())
    check(
      '打开后初始 focus 进入 input',
      await input.evaluate((element) => element === document.activeElement),
    )
    check('空查询不渲染搜索结果', (await page.locator('[role="option"]').count()) === 0)
    check(
      '空查询显示轻量示例',
      await page.getByText('试试：拉链表、幂等、数据倾斜、first_seen').isVisible(),
    )
    check('首次打开只请求一次索引', indexRequests.length === 1, `requests=${indexRequests.length}`)
    check(
      'SearchDialog chunk 仅在首次打开时下载',
      dialogChunkRequests.length === 1,
      `requests=${dialogChunkRequests.length}`,
    )
    await recordGeometry(page, 'Desktop 1280', viewport)

    // The native modal plus the explicit boundary loop keep Tab / Shift+Tab inside.
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    const focusAfterReverseWrap = await page.evaluate(() =>
      document.activeElement?.textContent?.trim(),
    )
    check(
      'Shift+Tab 在 dialog 内循环 focus',
      focusAfterReverseWrap === 'first_seen',
      `focus=${focusAfterReverseWrap}`,
    )
    await page.keyboard.press('Tab')
    check(
      'Tab 从末尾入口循环回 Close button',
      (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ===
        '关闭搜索',
    )
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#learn-search-dialog'))
    await page.waitForFunction(() =>
      document.activeElement?.matches('.learn-search-trigger--desktop'),
    )
    check(
      'Escape 关闭并将 focus 还给 keyboard 打开的 Desktop 入口',
      await page.evaluate(
        () => document.activeElement?.matches('.learn-search-trigger--desktop') ?? false,
      ),
    )

    await page.locator('.learn-search-trigger--desktop').click()
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    await page.getByRole('button', { name: '关闭搜索' }).click()
    await page.waitForFunction(() => !document.querySelector('#learn-search-dialog'))
    await page.waitForFunction(() =>
      document.activeElement?.matches('.learn-search-trigger--desktop'),
    )
    check(
      'Close button 关闭 dialog 并恢复 focus',
      await page.evaluate(
        () => document.activeElement?.matches('.learn-search-trigger--desktop') ?? false,
      ),
    )

    // Click entry; no localStorage / progress change just from opening and searching.
    await page.locator('.learn-search-trigger--desktop').click()
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    await input.fill('不存在词xyz')
    await page.getByText('没有找到匹配内容。').waitFor({ state: 'visible' })
    check(
      '无结果状态有明确说明',
      await page.getByText('试试更短的关键词，例如：拉链表、幂等、血缘。').isVisible(),
    )
    check('无结果时没有空 option 残留', (await page.locator('[role="option"]').count()) === 0)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#learn-search-dialog'))
    await page.waitForFunction(() =>
      document.activeElement?.matches('.learn-search-trigger--desktop'),
    )
    const progressAfterSearch = await page.evaluate(
      (key) => localStorage.getItem(key),
      PROGRESS_STORAGE_KEY,
    )
    check('打开 / 查询 / 关闭搜索不改 progress storage', progressAfterSearch === progressBeforeOpen)
    check(
      '关闭后焦点回到点击入口',
      await page.evaluate(
        () => document.activeElement?.matches('.learn-search-trigger--desktop') ?? false,
      ),
    )

    // Keyboard shortcut aliases and session-memory fetch cache.
    await page.keyboard.press('Meta+k')
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    check('Cmd+K 打开 SearchDialog', await dialog.isVisible())
    check(
      '重新打开复用索引，不重复 fetch',
      indexRequests.length === 1,
      `requests=${indexRequests.length}`,
    )
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#learn-search-dialog'))

    // `/` remains a convenience shortcut; when an editable field is focused it types normally.
    await page.keyboard.press('/')
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    check('/ 快捷键可打开搜索且保持 P1 issue contract', await dialog.isVisible())
    await input.press('/')
    check('输入框内 / 不被快捷键拦截', (await input.inputValue()) === '/')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#learn-search-dialog'))
    await page.waitForFunction(() =>
      document.activeElement?.matches('.learn-search-trigger--desktop'),
    )

    const slashInput = await page.evaluate(() => {
      const editable = document.createElement('input')
      editable.id = '__search-shortcut-editable-probe'
      document.body.append(editable)
      editable.focus()
      return editable.id
    })
    await page.keyboard.press('/')
    check(
      '输入类控件聚焦时 / 不打开全站搜索',
      (await page.locator('#learn-search-dialog').count()) === 0,
    )
    check(
      '输入类控件聚焦时 / 保持为普通文本',
      (await page.locator(`#${slashInput}`).inputValue()) === '/',
    )
    await page.locator(`#${slashInput}`).evaluate((editable) => editable.remove())

    await ensureTheme(page, 'dark')
    await page.keyboard.press('Control+k')
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    await input.fill('幂等')
    await page.locator('[role="option"] mark').first().waitFor({ state: 'visible' })
    await recordGeometry(page, 'Desktop 1280 Dark results', viewport)
    const darkMark = await page
      .locator('[role="option"] mark')
      .first()
      .evaluate((mark) => ({
        color: getComputedStyle(mark).color,
        background: getComputedStyle(mark).backgroundColor,
      }))
    check(
      'Dark mark 文本对比度满足 WCAG AA',
      contrastRatio(darkMark.color, darkMark.background) >= 4.5,
      JSON.stringify(darkMark),
    )
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#learn-search-dialog'))
    await ensureTheme(page, 'light')

    // Search result → same lesson heading, actual inner scroller position, and direct load.
    await page.goto(`${baseUrl}/learn/${CURRENT_SLUG}/`, { waitUntil: 'networkidle' })
    await page.keyboard.press('Control+k')
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    await input.fill('first_seen')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0)
    await recordGeometry(page, 'Desktop 1280 Light results', viewport)
    const lightMark = await page
      .locator('[role="option"] mark')
      .first()
      .evaluate((mark) => ({
        color: getComputedStyle(mark).color,
        background: getComputedStyle(mark).backgroundColor,
      }))
    check(
      'Light mark 文本对比度满足 WCAG AA',
      contrastRatio(lightMark.color, lightMark.background) >= 4.5,
      JSON.stringify(lightMark),
    )
    const currentHref = (await getResultHrefs(page)).find((href) =>
      href.includes(`/learn/${CURRENT_SLUG}/#`),
    )
    check(
      '当前课查询包含可跳转 heading 命中',
      Boolean(currentHref),
      `hrefs=${JSON.stringify(await getResultHrefs(page))}`,
    )
    if (currentHref) {
      await page.evaluate(() => {
        window.__searchSamePageSwaps = 0
        document.addEventListener('astro:after-swap', () => {
          window.__searchSamePageSwaps += 1
        })
        window.__searchSamePageToken = 'alive'
      })
      await page.locator(`[role="option"][href="${currentHref}"]`).click()
      const samePagePositioned = await waitForVisibleAnchor(page)
      check('当前课搜索结果关闭 dialog 并定位到 heading', samePagePositioned)
      check(
        '当前课搜索没有 ClientRouter route swap',
        (await page.evaluate(() => window.__searchSamePageSwaps)) === 0,
      )
      check(
        '当前课搜索保持 LearnShell 活性',
        (await page.evaluate(() => window.__searchSamePageToken)) === 'alive',
      )
      check(
        '当前课搜索后 dialog 已关闭',
        (await page.locator('#learn-search-dialog').count()) === 0,
      )

      const directPage = await context.newPage()
      const directErrors = trackPageErrors(directPage)
      await directPage.goto(new URL(currentHref, baseUrl).href, { waitUntil: 'networkidle' })
      check('搜索结果 deep link 硬加载真正定位 heading', await waitForVisibleAnchor(directPage))
      check('direct deep link 无 pageerror', directErrors.length === 0, directErrors.join(' | '))
      await directPage.close()
    }

    // Cross-course selection uses ArrowDown + Enter, then back / forward restore deep links.
    await page.goto(`${baseUrl}/learn/${CROSS_FROM_SLUG}/`, { waitUntil: 'networkidle' })
    await page.keyboard.press('Control+k')
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    await input.fill('幂等')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0)
    const crossHrefs = await getResultHrefs(page)
    const crossHref = crossHrefs.find((href) => href.includes(`/learn/${CROSS_TO_SLUG}/#`))
    check(
      '幂等查询包含跨课 heading 命中',
      Boolean(crossHref),
      `hrefs=${JSON.stringify(crossHrefs)}`,
    )
    if (crossHref) {
      const selectedIndex = crossHrefs.indexOf(crossHref)
      for (let index = 0; index <= selectedIndex; index += 1) {
        await page.keyboard.press('ArrowDown')
      }
      const activeOption = await input.getAttribute('aria-activedescendant')
      const selectedHref = activeOption
        ? await page.locator(`#${activeOption}`).getAttribute('href')
        : null
      check('↑/↓ 以 aria-activedescendant / aria-selected 表达当前结果', selectedHref === crossHref)
      check(
        '选中结果有非颜色视觉标记',
        (await page.locator(`#${activeOption} .learn-search-result__selected-mark`).count()) === 1,
      )
      await page.evaluate(() => {
        window.__searchCrossPageToken = 'alive'
      })
      await page.keyboard.press('Enter')
      const crossPositioned = await waitForVisibleAnchor(page)
      check('Enter 跨课 ClientRouter 导航并真正定位 heading', crossPositioned)
      check('跨课搜索关闭 dialog', (await page.locator('#learn-search-dialog').count()) === 0)
      check(
        '跨课导航未整页刷新 LearnShell',
        (await page.evaluate(() => window.__searchCrossPageToken)) === 'alive',
      )
      check(
        '跨课结果 URL 与 deep link 一致',
        page.url() === new URL(crossHref, baseUrl).href,
        page.url(),
      )

      await page.goBack()
      await page.waitForFunction(
        (slug) => location.pathname.endsWith(`/learn/${slug}/`),
        CROSS_FROM_SLUG,
      )
      check('浏览器 Back 回到出发课程', page.url().includes(`/learn/${CROSS_FROM_SLUG}/`))
      await page.goForward()
      const forwardPositioned = await waitForVisibleAnchor(page)
      check('浏览器 Forward 恢复目标 heading viewport 位置', forwardPositioned)
      check(
        'Back / Forward 后目标深链 hash 保持',
        page.url() === new URL(crossHref, baseUrl).href,
        page.url(),
      )
    }

    check('Desktop 搜索 E2E 无 pageerror', errors.length === 0, errors.join(' | '))
  } finally {
    await page.close()
    await context.close()
  }
}

async function mobileEntryProbe(browser, baseUrl, viewport, theme) {
  const tag = `${viewport.width}px ${theme}`
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}/learn/${CROSS_FROM_SLUG}/`, { waitUntil: 'networkidle' })
    check(
      `${tag} Desktop 顶栏不显示搜索控件`,
      !(await page.locator('.learn-search-trigger--desktop').isVisible()),
    )
    const progressWidthBefore = await page
      .locator('.learn-topbar__progress')
      .evaluate((element) => element.getBoundingClientRect().width)

    await ensureTheme(page, theme)
    check(`${tag} 主题切换生效`, (await page.locator('html').getAttribute('data-theme')) === theme)

    await page.locator('.sidebar-toggle').click()
    const sidebar = page.locator('.course-sidebar')
    await page.locator('.course-sidebar__search').waitFor({ state: 'visible' })
    check(`${tag} 搜索可从目录抽屉发现`, await page.locator('.course-sidebar__search').isVisible())
    await page.locator('.course-sidebar__search').click()
    const dialog = page.locator('#learn-search-dialog')
    await dialog.waitFor({ state: 'visible' })
    await waitForIndexReady(page)
    check(
      `${tag} 打开搜索后抽屉关闭`,
      !(await sidebar.evaluate((element) => element.classList.contains('is-open'))),
    )
    check(
      `${tag} 顶栏进度宽度未因搜索入口变化`,
      Math.abs(
        (await page
          .locator('.learn-topbar__progress')
          .evaluate((element) => element.getBoundingClientRect().width)) - progressWidthBefore,
      ) <= 1,
    )
    await recordGeometry(page, tag, viewport)

    await page.locator('[role="combobox"]').fill('幂等')
    await page.locator('[role="option"]').first().waitFor({ state: 'visible' })
    const markStyle = await page
      .locator('[role="option"] mark')
      .first()
      .evaluate((mark) => ({
        color: getComputedStyle(mark).color,
        background: getComputedStyle(mark).backgroundColor,
      }))
    check(
      `${tag} 命中高亮文本对比度满足 WCAG AA`,
      contrastRatio(markStyle.color, markStyle.background) >= 4.5,
      JSON.stringify(markStyle),
    )
    await recordGeometry(page, `${tag} results`, viewport)

    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#learn-search-dialog'))
    await page.waitForFunction(() => document.activeElement?.matches('.sidebar-toggle'))
    check(
      `${tag} 关闭后焦点回到可见目录按钮`,
      await page.evaluate(() => document.activeElement?.matches('.sidebar-toggle') ?? false),
    )
    check(`${tag} 无 pageerror`, errors.length === 0, errors.join(' | '))
  } finally {
    await page.close()
    await context.close()
  }
}

async function retryProbe(browser, baseUrl) {
  const viewport = { width: 1280, height: 800 }
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  let attempts = 0
  let releaseFirstRequest
  let signalFirstRequest
  const firstRequestStarted = new Promise((resolve) => {
    signalFirstRequest = resolve
  })

  try {
    await page.route('**/search-index.json', async (route) => {
      attempts += 1
      if (attempts === 1) {
        signalFirstRequest()
        await new Promise((resolve) => {
          releaseFirstRequest = resolve
        })
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      } else {
        await route.continue()
      }
    })
    await page.goto(`${baseUrl}/learn/${CROSS_FROM_SLUG}/`, { waitUntil: 'networkidle' })
    await page.keyboard.press('Control+k')
    const dialog = page.locator('#learn-search-dialog')
    await dialog.waitFor({ state: 'visible' })
    const requestReached = await Promise.race([
      firstRequestStarted.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
    ])
    check('打开搜索后发出索引请求', requestReached)
    check(
      '索引请求期间显示 loading 状态',
      requestReached &&
        (await page.locator('.learn-search-dialog__status').textContent())?.includes(
          '正在加载搜索索引',
        ),
    )
    releaseFirstRequest?.()
    await page.getByRole('alert').waitFor({ state: 'visible' })
    check(
      '索引 fetch 失败时显示可恢复错误状态',
      await page.getByRole('alert').getByText('搜索暂时无法使用，请检查网络后重试。').isVisible(),
    )
    await page.getByRole('button', { name: '重试加载' }).click()
    await waitForIndexReady(page)
    check(
      '重试成功后索引恢复可用',
      attempts === 2 && (await dialog.isVisible()),
      `attempts=${attempts}`,
    )
    check('失败请求被淘汰，重试而非整页刷新', page.url().includes(`/learn/${CROSS_FROM_SLUG}/`))
  } finally {
    releaseFirstRequest?.()
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
    console.log(`[${SCRIPT_NAME}] search checks against ${preview.baseUrl}`)

    await desktopProbe(browser, preview.baseUrl)
    await retryProbe(browser, preview.baseUrl)
    for (const [viewport, theme] of [
      [{ width: 900, height: 900 }, 'light'],
      [{ width: 768, height: 900 }, 'dark'],
      [{ width: 390, height: 844 }, 'light'],
      [{ width: 320, height: 720 }, 'dark'],
    ]) {
      await mobileEntryProbe(browser, preview.baseUrl, viewport, theme)
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
