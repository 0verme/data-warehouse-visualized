#!/usr/bin/env node
/**
 * Browser contract for the homepage primary navigation and the "从哪里开始？"
 * onboarding router (Issue #195).
 *
 * Visits the built homepage at desktop, tablet, breakpoint-edge, and mobile
 * viewports in both themes and asserts the release-relevant paths:
 *
 *   1. the header renders the five content entries in a stable order;
 *   2. exactly one entry carries `aria-current="page"` (首页);
 *   3. locale / theme utility controls stay outside the content navigation;
 *   4. the "从哪里开始？" block sits between the hero and `#data-lesson`,
 *      with the same three paths and links on every viewport;
 *   5. three cards share a row on desktop and stack on mobile without
 *      horizontal overflow;
 *   6. 路线 and the homepage Roadmap CTA share `/roadmap/`; the route opens
 *      with 路线 active, and 学习 still reaches `/learn/` (BASE_PATH aware).
 *
 * Usage:
 *   npm run test:e2e:home                  # build + preview + checks
 *   npm run test:e2e:home -- --skip-build  # reuse existing dist/
 *   BASE_PATH=/x/ npm run build && BASE_PATH=/x/ npm run test:e2e:home -- --skip-build
 *   npm run test:e2e:home -- --base http://127.0.0.1:4321
 *
 * Requires Chromium: `npx playwright install chromium` (CI installs it).
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
const SCRIPT_NAME = 'home-onboarding'

const rawBasePath = process.env.BASE_PATH || '/'
const mountPath = rawBasePath === '/' ? '' : `/${rawBasePath.split('/').filter(Boolean).join('/')}`
const withBase = (path) => `${mountPath}${path}` || '/'

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'desktop-1024x768', width: 1024, height: 768 },
  { name: 'tablet-768x800', width: 768, height: 800 },
  { name: 'breakpoint-601x800', width: 601, height: 800 },
  { name: 'breakpoint-600x800', width: 600, height: 800 },
  { name: 'breakpoint-561x800', width: 561, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-320x720', width: 320, height: 720 },
]
const THEMES = ['light', 'dark']

const NAV_CONTRACT = [
  { label: '首页', href: withBase('/') },
  { label: '学习', href: withBase('/learn/') },
  { label: '路线', href: withBase('/roadmap/') },
  { label: '案例', href: withBase('/learn/lifecycle-path-failure/') },
  { label: '关于', href: 'https://github.com/0verme/data-warehouse-visualized' },
]
const START_CONTRACT = [
  { audience: '第一次学数据仓库', cta: '从基础开始', href: withBase('/learn/') },
  {
    audience: '已经会 SQL，想系统理解数仓',
    cta: '进入进阶路线',
    href: withBase('/learn/data-modeling/'),
  },
  {
    audience: '已经在做数据工程',
    cta: '看生产实践',
    href: withBase('/learn/lifecycle-path-failure/'),
  },
]

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const { check, report } = createChecker()

function overlaps(a, b) {
  return Boolean(
    a &&
    b &&
    a.x < b.right - TOLERANCE &&
    b.x < a.right - TOLERANCE &&
    a.y < b.bottom - TOLERANCE &&
    b.y < a.bottom - TOLERANCE,
  )
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    const header = document.querySelector('header.site-header')
    const nav = header?.querySelector('nav.site-header__nav')
    const brand = header?.querySelector('.brand')
    const actions = header?.querySelector('.learn-topbar__actions')
    const links = nav ? Array.from(nav.querySelectorAll(':scope > a')) : []
    const current = nav ? Array.from(nav.querySelectorAll('[aria-current="page"]')) : []
    const hero = document.querySelector('main.home-main > .home-hero')
    const start = document.querySelector('main.home-main > .home-start')
    const dataLesson = document.querySelector('main.home-main > #data-lesson')
    const cards = Array.from(document.querySelectorAll('.home-start-path'))

    return {
      theme: document.documentElement.dataset.theme ?? '',
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      nav: {
        present: Boolean(nav),
        ariaLabel: nav?.getAttribute('aria-label') ?? '',
        labels: links.map((link) => (link.textContent ?? '').trim()),
        hrefs: links.map((link) => link.getAttribute('href')),
        currentCount: current.length,
        currentText: (current[0]?.textContent ?? '').trim(),
        utilityControlsInside: nav ? nav.querySelectorAll('.topbar-control').length : 0,
      },
      roadmapCtaHref:
        document.querySelector('.home-course-map__roadmap-entry a')?.getAttribute('href') ?? null,
      utilityControls: actions ? actions.querySelectorAll('.topbar-control').length : 0,
      headerRects: {
        header: rect(header),
        brand: rect(brand),
        brandDomain: rect(brand?.querySelector('.home-brand__domain')),
        nav: rect(nav),
        actions: rect(actions),
      },
      navLinkHeights: links.map((link) => link.getBoundingClientRect().height),
      sectionOrder: {
        heroPresent: Boolean(hero),
        startPresent: Boolean(start),
        dataLessonPresent: Boolean(dataLesson),
        heroBeforeStart: Boolean(
          hero && start && hero.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        startBeforeDataLesson: Boolean(
          start &&
          dataLesson &&
          start.compareDocumentPosition(dataLesson) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      },
      startHeading: document.querySelector('#home-start-title')?.textContent?.trim() ?? '',
      startCards: cards.map((card) => ({
        audience: card.querySelector('.home-start-path__audience')?.textContent?.trim() ?? '',
        cta: (card.querySelector('.home-start-path__cta')?.textContent ?? '')
          .replace(/\s*→\s*$/, '')
          .trim(),
        href: card.getAttribute('href'),
        rect: rect(card),
      })),
    }
  })
}

async function runTheme(browser, viewport, theme, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  const tag = `${viewport.name} ${theme}`

  await page.addInitScript((storedTheme) => {
    localStorage.setItem('data-warehouse-visualized:theme', storedTheme)
  }, theme)

  try {
    const response = await page.goto(`${baseUrl}${withBase('/')}`, { waitUntil: 'networkidle' })
    check(`${tag} 首页响应 200`, response?.status() === 200, `status=${response?.status()}`)

    const state = await inspectPage(page)

    check(`${tag} 主题生效`, state.theme === theme, `theme=${state.theme}`)
    check(
      `${tag} 一级导航存在且有可访问名称`,
      state.nav.present && state.nav.ariaLabel === '主导航',
      JSON.stringify(state.nav),
    )
    check(
      `${tag} 导航顺序为 首页 / 学习 / 路线 / 案例 / 关于`,
      state.nav.labels.length === 5 &&
        state.nav.labels.every((label, index) => label.startsWith(NAV_CONTRACT[index].label)),
      JSON.stringify(state.nav.labels),
    )
    check(
      `${tag} 导航 href 与契约一致`,
      JSON.stringify(state.nav.hrefs) === JSON.stringify(NAV_CONTRACT.map((item) => item.href)),
      JSON.stringify(state.nav.hrefs),
    )
    check(
      `${tag} 路线导航与首页 Roadmap CTA href 一致`,
      state.nav.hrefs[2] === state.roadmapCtaHref,
      JSON.stringify({ nav: state.nav.hrefs[2], cta: state.roadmapCtaHref }),
    )
    check(
      `${tag} 仅首页带 aria-current="page"`,
      state.nav.currentCount === 1 && state.nav.currentText.startsWith('首页'),
      `count=${state.nav.currentCount} text=${state.nav.currentText}`,
    )
    const activeNavStyle = await page
      .locator('header.site-header nav.site-header__nav > a[aria-current="page"]')
      .evaluate((link) => {
        const style = getComputedStyle(link)
        return {
          fontWeight: style.fontWeight,
          borderBottomWidth: style.borderBottomWidth,
          borderBottomStyle: style.borderBottomStyle,
          borderBottomColor: style.borderBottomColor,
        }
      })
    check(
      `${tag} active 导航视觉状态保持`,
      activeNavStyle.fontWeight === '700' &&
        activeNavStyle.borderBottomWidth === '2px' &&
        activeNavStyle.borderBottomStyle === 'solid' &&
        activeNavStyle.borderBottomColor !== 'rgba(0, 0, 0, 0)',
      JSON.stringify(activeNavStyle),
    )
    const hoverLink = page.locator('header.site-header nav.site-header__nav > a[href$="/learn/"]')
    const baseLinkColor = await hoverLink.evaluate((link) => getComputedStyle(link).color)
    await hoverLink.hover()
    await page.waitForTimeout(200)
    const hoverLinkColor = await hoverLink.evaluate((link) => getComputedStyle(link).color)
    check(`${tag} 导航 hover 样式保持`, hoverLinkColor !== baseLinkColor, hoverLinkColor)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const keyboardFocus = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement)
      return {
        isCurrentNav: document.activeElement?.getAttribute('aria-current') === 'page',
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      }
    })
    check(
      `${tag} 键盘可聚焦主导航且保留 focus ring`,
      keyboardFocus.isCurrentNav &&
        keyboardFocus.outlineStyle === 'solid' &&
        keyboardFocus.outlineWidth === '3px',
      JSON.stringify(keyboardFocus),
    )
    check(
      `${tag} 内容导航与 utility 控件分离`,
      state.nav.utilityControlsInside === 0 && state.utilityControls >= 2,
      `navControls=${state.nav.utilityControlsInside} utility=${state.utilityControls}`,
    )
    check(
      `${tag} Header 不重叠`,
      !overlaps(state.headerRects.brand, state.headerRects.nav) &&
        !overlaps(state.headerRects.brand, state.headerRects.actions) &&
        !overlaps(state.headerRects.nav, state.headerRects.actions),
      JSON.stringify(state.headerRects),
    )
    if (viewport.width > 560) {
      check(
        `${tag} sql.sb 保留在品牌区`,
        state.headerRects.brandDomain.width > 0,
        JSON.stringify(state.headerRects.brandDomain),
      )
    }
    if (viewport.width > 600) {
      const { header, brand, brandDomain, nav, actions } = state.headerRects
      const navActionsGap = actions.x - nav.right
      check(
        `${tag} 主导航靠右并与全局操作保持 24px 间距`,
        nav.x > brand.right && Math.abs(navActionsGap - 24) <= TOLERANCE,
        JSON.stringify({ brand, brandDomain, nav, actions, navActionsGap }),
      )
      check(`${tag} 桌面 Header 高度保持 76px`, header.height === 76, `height=${header.height}`)
    } else {
      const firstRowBottom = Math.max(
        state.headerRects.brand.bottom,
        state.headerRects.actions.bottom,
      )
      check(
        `${tag} 主导航仍在 Header 第二行`,
        state.headerRects.nav.y >= firstRowBottom - TOLERANCE,
        JSON.stringify(state.headerRects),
      )
    }
    const minNavHeight = Math.min(...state.navLinkHeights)
    const minTarget = viewport.width <= 600 ? 32 : 24
    check(
      `${tag} 导航链接可点击高度 ${minTarget}px+`,
      minNavHeight >= minTarget,
      `minHeight=${minNavHeight}`,
    )

    check(
      `${tag} 「从哪里开始」位于 Hero 与 Data Flow 之间`,
      state.sectionOrder.heroPresent &&
        state.sectionOrder.startPresent &&
        state.sectionOrder.dataLessonPresent &&
        state.sectionOrder.heroBeforeStart &&
        state.sectionOrder.startBeforeDataLesson,
      JSON.stringify(state.sectionOrder),
    )
    check(`${tag} 显示「从哪里开始？」`, state.startHeading === '从哪里开始？', state.startHeading)
    check(
      `${tag} 三路径内容与目标稳定`,
      state.startCards.length === 3 &&
        state.startCards.every(
          (card, index) =>
            card.audience === START_CONTRACT[index].audience &&
            card.cta === START_CONTRACT[index].cta &&
            card.href === START_CONTRACT[index].href,
        ),
      JSON.stringify(state.startCards.map(({ audience, cta, href }) => ({ audience, cta, href }))),
    )

    const cardRects = state.startCards.map((card) => card.rect)
    const isStacked = viewport.width <= 760
    check(
      `${tag} 三路径${isStacked ? '纵向堆叠' : '同排展示'}`,
      cardRects.length === 3 &&
        (isStacked
          ? cardRects[0].bottom <= cardRects[1].y + TOLERANCE &&
            cardRects[1].bottom <= cardRects[2].y + TOLERANCE
          : Math.abs(cardRects[0].y - cardRects[1].y) <= TOLERANCE &&
            Math.abs(cardRects[1].y - cardRects[2].y) <= TOLERANCE),
      JSON.stringify(cardRects.map(({ x, y, bottom, right }) => ({ x, y, bottom, right }))),
    )
    check(
      `${tag} 路径卡片不横向溢出`,
      cardRects.every((card) => card.right <= state.innerWidth + TOLERANCE),
      JSON.stringify(cardRects),
    )
    check(
      `${tag} 无文档级横向滚动`,
      state.docScrollWidth - state.innerWidth <= TOLERANCE,
      `scrollWidth=${state.docScrollWidth} innerWidth=${state.innerWidth}`,
    )

    if (theme === 'light') {
      await page.locator('.locale-switcher__trigger').click()
      await page.locator('.locale-switcher__option').nth(1).click()
      await page.waitForFunction(
        () => localStorage.getItem('data-warehouse-visualized:locale') === 'en',
      )
      await page.waitForFunction(() =>
        document
          .querySelector('.locale-switcher__option[aria-checked="true"]')
          ?.textContent?.includes('English · Preview'),
      )
      const englishPreview = await inspectPage(page)
      const englishNavActionsGap =
        englishPreview.headerRects.actions.x - englishPreview.headerRects.nav.right
      check(
        `${tag} English preview 不改变 Header 布局`,
        englishPreview.docScrollWidth <= englishPreview.innerWidth + TOLERANCE &&
          (viewport.width <= 600 ||
            (englishPreview.headerRects.nav.x > englishPreview.headerRects.brand.right &&
              Math.abs(englishNavActionsGap - 24) <= TOLERANCE)),
        JSON.stringify(englishPreview.headerRects),
      )
    }

    if (theme === 'dark' && [1440, 390].includes(viewport.width)) {
      await page.click(
        `header.site-header nav.site-header__nav > a[href="${withBase('/roadmap/')}"]`,
      )
      await page.waitForURL((url) => url.pathname === withBase('/roadmap/'), { timeout: 15_000 })
      const activeRoute = page.locator(
        'header.roadmap-header nav.site-header__nav > a[aria-current="page"]',
      )
      check(
        `${tag} 路线导航进入 Roadmap 且正确高亮`,
        (await activeRoute.textContent())?.trim().startsWith('路线') === true,
      )

      await page.click(
        `header.roadmap-header nav.site-header__nav > a[href="${withBase('/learn/')}"]`,
      )
      await page.waitForURL((url) => url.pathname === withBase('/learn/'), { timeout: 15_000 })
      check(`${tag} 学习导航进入学习空间`, page.url().includes(withBase('/learn/')))
      await page.goBack({ waitUntil: 'networkidle' })
      await page.waitForURL((url) => url.pathname === withBase('/roadmap/'), { timeout: 15_000 })
      await page.click(
        `header.roadmap-header nav.site-header__nav > a[href="${withBase('/learn/lifecycle-path-failure/')}"]`,
      )
      await page.waitForURL((url) => url.pathname === withBase('/learn/lifecycle-path-failure/'), {
        timeout: 15_000,
      })
      await page.locator('.lesson-header h1').waitFor({ state: 'visible', timeout: 15_000 })
      check(`${tag} 案例导航进入现有案例课程`, page.url().includes('lifecycle-path-failure'))
    }

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
    console.log(`[${SCRIPT_NAME}] checking the homepage against ${preview.baseUrl}`)

    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await runTheme(browser, viewport, theme, preview.baseUrl)
      }
      console.log(`[${SCRIPT_NAME}] ${viewport.name} done`)
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
