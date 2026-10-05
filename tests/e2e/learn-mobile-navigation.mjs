#!/usr/bin/env node
/**
 * Focused browser contract for Learn previous/next navigation density (Issue #201).
 *
 * Covers middle, long-title, first, and last lessons at 390×844 / 320×720 in
 * light and dark themes, plus 1280×800 / 1440×900 desktop layout parity.
 *
 * Usage:
 *   npm run test:e2e:learn-navigation
 *   npm run test:e2e:learn-navigation -- --skip-build
 *   npm run test:e2e:learn-navigation -- --base http://127.0.0.1:4321
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'learn-mobile-navigation'
const rawBasePath = process.env.BASE_PATH || '/'
const mountPath = rawBasePath === '/' ? '' : `/${rawBasePath.split('/').filter(Boolean).join('/')}`
const withBase = (path) => `${mountPath}${path}` || '/'
const MOBILE_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '320x720', width: 320, height: 720 },
]
const DESKTOP_VIEWPORTS = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
]
const THEMES = ['light', 'dark']
const CASES = [
  {
    name: 'middle',
    path: '/learn/warehouse-terms/',
    previous: '/learn/report-metric-journey/',
    next: '/learn/data-modeling/',
    boundary: '',
  },
  {
    name: 'long-title',
    path: '/learn/sql-transformation-layers/',
    previous: '/learn/sql-transformation-join/',
    next: '/learn/sql-transformation-contract/',
    boundary: '',
  },
  {
    name: 'first',
    path: '/learn/why-data-warehouse/',
    previous: null,
    next: '/learn/warehouse-layers/',
    boundary: 'first',
  },
  {
    name: 'last',
    path: '/learn/delivery-completion-signal/',
    previous: '/learn/lifecycle-path-failure/',
    next: null,
    boundary: 'last',
  },
]

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

async function inspectPage(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    const nav = document.querySelector('.lesson-nav')
    const complete = nav?.querySelector('.complete-button')
    const style = nav ? getComputedStyle(nav) : null
    const links = nav
      ? Array.from(nav.querySelectorAll('a.lesson-nav__link')).map((link) => {
          const title = link.querySelector('strong')
          const titleStyle = title ? getComputedStyle(title) : null
          const linkStyle = getComputedStyle(link)
          return {
            direction: link.classList.contains('lesson-nav__link--previous') ? 'previous' : 'next',
            tag: link.tagName,
            href: link.getAttribute('href'),
            name: (link.innerText || '').replace(/\s+/g, ' ').trim(),
            text: title?.textContent?.trim() ?? '',
            box: rect(link),
            titleBox: rect(title),
            lineClamp: titleStyle?.webkitLineClamp ?? '',
            whiteSpace: titleStyle?.whiteSpace ?? '',
            titleScrollWidth: title?.scrollWidth ?? 0,
            titleClientWidth: title?.clientWidth ?? 0,
            backgroundColor: linkStyle.backgroundColor,
            borderColor: linkStyle.borderTopColor,
          }
        })
      : []
    const root = document.documentElement
    const mainScroll = document.querySelector('.learn-main__scroll')

    return {
      theme: root.dataset.theme ?? '',
      boundary: nav?.dataset.boundary ?? '',
      nav: {
        box: rect(nav),
        position: style?.position ?? '',
        paddingLeft: Number.parseFloat(style?.paddingLeft ?? '0'),
        paddingRight: Number.parseFloat(style?.paddingRight ?? '0'),
        paddingBottom: style?.paddingBottom ?? '',
      },
      completion: {
        tag: complete?.tagName ?? '',
        pressed: complete?.getAttribute('aria-pressed') ?? '',
        text: (complete?.innerText ?? '').replace(/\s+/g, ' ').trim(),
        box: rect(complete),
      },
      links,
      document: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        bodyScrollWidth: document.body.scrollWidth,
      },
      mainScroll: mainScroll
        ? { scrollWidth: mainScroll.scrollWidth, clientWidth: mainScroll.clientWidth }
        : null,
    }
  })
}

async function runMobile(browser, viewport, theme, lesson, baseUrl) {
  const tag = `${viewport.name} ${theme} ${lesson.name}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  await page.addInitScript((storedTheme) => {
    localStorage.setItem('data-warehouse-visualized:theme', storedTheme)
  }, theme)

  try {
    const response = await page.goto(`${baseUrl}${withBase(lesson.path)}`, {
      waitUntil: 'networkidle',
    })
    await page.locator('.lesson-nav .complete-button').waitFor()
    const state = await inspectPage(page)
    const expectedHrefs = [lesson.previous, lesson.next].filter(Boolean).map(withBase)
    const visibleLinks = state.links.map((link) => link.href)
    const footerHeight = state.nav.box?.height ?? Number.POSITIVE_INFINITY
    const contentWidth =
      (state.nav.box?.width ?? 0) - state.nav.paddingLeft - state.nav.paddingRight

    check(`${tag} lesson 响应 200`, response?.status() === 200, `status=${response?.status()}`)
    check(`${tag} 主题生效`, state.theme === theme, `theme=${state.theme}`)
    check(
      `${tag} 无水平溢出`,
      state.document.scrollWidth === state.document.clientWidth &&
        state.document.bodyScrollWidth === state.document.clientWidth &&
        (state.mainScroll?.scrollWidth ?? 0) <= (state.mainScroll?.clientWidth ?? 0) + 1,
      JSON.stringify({ document: state.document, mainScroll: state.mainScroll }),
    )
    check(
      `${tag} footer 为普通流布局`,
      state.nav.position === 'static',
      `position=${state.nav.position}`,
    )
    check(
      `${tag} footer 比基线紧凑`,
      footerHeight < 141 && footerHeight <= 131,
      `height=${footerHeight}`,
    )
    check(
      `${tag} Completion CTA 保留为按钮`,
      state.completion.tag === 'BUTTON' && state.completion.pressed === 'false',
      JSON.stringify(state.completion),
    )
    check(
      `${tag} Completion CTA 保持主要整行动作`,
      (state.completion.box?.width ?? 0) >= contentWidth - 1 &&
        (state.completion.box?.height ?? 0) >= 40 &&
        (state.completion.box?.height ?? 0) <= 44,
      JSON.stringify({ completion: state.completion.box, contentWidth }),
    )
    check(`${tag} 边界标记正确`, state.boundary === lesson.boundary, `boundary=${state.boundary}`)
    check(
      `${tag} Previous / Next href 顺序正确`,
      JSON.stringify(visibleLinks) === JSON.stringify(expectedHrefs),
      `expected=${JSON.stringify(expectedHrefs)} actual=${JSON.stringify(visibleLinks)}`,
    )
    check(
      `${tag} 所有导航链接均为可访问的真实 <a>`,
      state.links.length === expectedHrefs.length &&
        state.links.every(
          (link) =>
            link.tag === 'A' &&
            link.name &&
            link.text &&
            (link.direction === 'previous'
              ? link.name.includes('上一节')
              : link.name.includes('下一节')),
        ),
      JSON.stringify(state.links),
    )
    const isTransparent = (color) =>
      color === 'transparent' ||
      Number(color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)$/)?.[1]) === 0
    check(
      `${tag} 次级导航没有卡片背景或边框`,
      state.links.every(
        (link) => isTransparent(link.backgroundColor) && isTransparent(link.borderColor),
      ),
      JSON.stringify(
        state.links.map(({ direction, backgroundColor, borderColor }) => ({
          direction,
          backgroundColor,
          borderColor,
        })),
      ),
    )
    check(
      `${tag} 导航链接点击区域至少 44×44px`,
      state.links.every((link) => link.box.width >= 44 && link.box.height >= 44),
      JSON.stringify(state.links.map(({ direction, box }) => ({ direction, box }))),
    )
    check(
      `${tag} title 最多两行且不横向裁切`,
      state.links.every(
        (link) =>
          link.lineClamp === '2' &&
          link.whiteSpace !== 'nowrap' &&
          link.titleScrollWidth <= link.titleClientWidth + 1,
      ),
      JSON.stringify(
        state.links.map(({ text, lineClamp, whiteSpace, titleScrollWidth, titleClientWidth }) => ({
          text,
          lineClamp,
          whiteSpace,
          titleScrollWidth,
          titleClientWidth,
        })),
      ),
    )
    if (lesson.boundary) {
      check(
        `${tag} 单侧导航使用整行而无空列`,
        state.links.length === 1 && (state.links[0].box.width ?? 0) >= contentWidth - 1,
        JSON.stringify(state.links.map(({ direction, box }) => ({ direction, box }))),
      )
    }

    if (lesson.name === 'long-title' && viewport.width === 390 && theme === 'light') {
      const previousAccessibleName = await page
        .getByRole('link', { name: /上一节 Join 为什么会让金额变大/ })
        .count()
      const nextAccessibleName = await page
        .getByRole('link', { name: /下一节 这段加工怎样交给下一环节/ })
        .count()
      check(
        `${tag} accessible name 包含明确方向和课程标题`,
        previousAccessibleName === 1 && nextAccessibleName === 1,
        JSON.stringify({ previousAccessibleName, nextAccessibleName }),
      )

      let previousFocus = null
      for (let index = 0; index < 100; index += 1) {
        await page.keyboard.press('Tab')
        previousFocus = await page.evaluate(() => {
          const element = document.activeElement
          if (!element.matches('.lesson-nav__link--previous')) return null
          const style = getComputedStyle(element)
          return {
            focusVisible: element.matches(':focus-visible'),
            outlineStyle: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
          }
        })
        if (previousFocus) break
      }
      check(
        `${tag} Previous 可键盘到达并显示 focus ring`,
        previousFocus?.focusVisible &&
          previousFocus.outlineStyle !== 'none' &&
          previousFocus.outlineWidth >= 2,
        JSON.stringify(previousFocus),
      )

      let nextFocus = null
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Tab')
        nextFocus = await page.evaluate(() => {
          const element = document.activeElement
          if (!element.matches('.lesson-nav__link--next')) return null
          const style = getComputedStyle(element)
          return {
            focusVisible: element.matches(':focus-visible'),
            outlineStyle: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
          }
        })
        if (nextFocus) break
      }
      check(
        `${tag} Next 可键盘到达并显示 focus ring`,
        nextFocus?.focusVisible && nextFocus.outlineStyle !== 'none' && nextFocus.outlineWidth >= 2,
        JSON.stringify(nextFocus),
      )

      const before = state.completion.box
      await page.locator('.complete-button').click()
      await page.locator('.complete-button[aria-pressed="true"]').waitFor()
      const completed = await inspectPage(page)
      check(
        `${tag} 完成状态文案 / pressed 语义保持`,
        completed.completion.text.includes('已学会') &&
          completed.completion.pressed === 'true' &&
          (completed.completion.box?.height ?? 0) === before.height,
        JSON.stringify({ before, completion: completed.completion }),
      )
      check(
        `${tag} completion 仍更新现有课程进度`,
        (await page.locator('[data-progress-count]').innerText()).replace(/\s+/g, ' ').trim() ===
          '1 / 55',
        await page.locator('[data-progress-count]').innerText(),
      )
      await page.locator('.complete-button').click()
      await page.locator('.complete-button[aria-pressed="false"]').waitFor()
      check(
        `${tag} completion 可按现有行为撤销`,
        (await page.locator('[data-progress-count]').innerText()).replace(/\s+/g, ' ').trim() ===
          '0 / 55',
      )

      await page.locator('.lesson-nav__link--previous').click()
      await page.waitForURL((url) => url.pathname === withBase(lesson.previous))
      check(
        `${tag} Previous 点击沿用正确 lesson route`,
        new URL(page.url()).pathname === withBase(lesson.previous),
        page.url(),
      )
      await page.locator('.lesson-nav__link--next').click()
      await page.waitForURL((url) => url.pathname === withBase(lesson.path))
      check(
        `${tag} Next 点击返回正确 lesson route`,
        new URL(page.url()).pathname === withBase(lesson.path),
        page.url(),
      )
    }

    if (lesson.name === 'first' && viewport.width === 390 && theme === 'light') {
      await page.locator('.lesson-nav__link--next').click()
      await page.waitForURL((url) => url.pathname === withBase(lesson.next))
      check(
        `${tag} 第一节 Next 点击进入第二节`,
        new URL(page.url()).pathname === withBase(lesson.next),
        page.url(),
      )
    }
    if (lesson.name === 'last' && viewport.width === 390 && theme === 'light') {
      await page.locator('.lesson-nav__link--previous').click()
      await page.waitForURL((url) => url.pathname === withBase(lesson.previous))
      check(
        `${tag} 最后一节 Previous 点击进入前一节`,
        new URL(page.url()).pathname === withBase(lesson.previous),
        page.url(),
      )
    }

    check(`${tag} 无 pageerror`, errors.length === 0, errors.join(' | '))
  } finally {
    await page.close()
    await context.close()
  }
}

async function runDesktop(browser, viewport, theme, baseUrl) {
  const tag = `desktop ${viewport.name} ${theme}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  await page.addInitScript((storedTheme) => {
    localStorage.setItem('data-warehouse-visualized:theme', storedTheme)
  }, theme)

  try {
    const response = await page.goto(`${baseUrl}${withBase('/learn/sql-transformation-layers/')}`, {
      waitUntil: 'networkidle',
    })
    const state = await inspectPage(page)
    check(`${tag} lesson 响应 200`, response?.status() === 200)
    check(
      `${tag} 无水平溢出`,
      state.document.scrollWidth === state.document.clientWidth &&
        state.document.bodyScrollWidth === state.document.clientWidth,
      JSON.stringify(state.document),
    )
    check(
      `${tag} 保持 Desktop 三列布局`,
      state.nav.position === 'static' &&
        state.links.length === 2 &&
        Math.abs((state.nav.box?.height ?? 0) - 92) <= 1,
      JSON.stringify({ nav: state.nav, links: state.links.map(({ box }) => box) }),
    )
    check(
      `${tag} Desktop CTA / 两个 cards 几何不变`,
      Math.abs((state.completion.box?.height ?? 0) - 42) <= 1 &&
        state.links.every((link) => Math.abs(link.box.height - 65) <= 1),
      JSON.stringify({
        completion: state.completion.box,
        links: state.links.map(({ box }) => box),
      }),
    )
    check(`${tag} 无 pageerror`, errors.length === 0, errors.join(' | '))
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
    console.log(`[${SCRIPT_NAME}] checking Learn navigation against ${preview.baseUrl}`)
    for (const viewport of MOBILE_VIEWPORTS) {
      for (const theme of THEMES) {
        for (const lesson of CASES)
          await runMobile(browser, viewport, theme, lesson, preview.baseUrl)
      }
    }
    for (const viewport of DESKTOP_VIEWPORTS) {
      for (const theme of THEMES) await runDesktop(browser, viewport, theme, preview.baseUrl)
    }
  } finally {
    preview?.stop()
    await browser.close()
  }
  if (report(SCRIPT_NAME) > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`[${SCRIPT_NAME}] ERROR`, error)
  process.exitCode = 1
})
