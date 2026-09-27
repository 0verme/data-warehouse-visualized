#!/usr/bin/env node
/**
 * Interaction Journey — Nested Scroll / Gesture Ownership (Issue #146).
 *
 * Checks real wheel/touch/keyboard interaction on the production build. The
 * lesson scroll owner must keep moving over the Scheduler event log; horizontal
 * rails and table regions must disclose overflow without causing page overflow.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '320x720', width: 320, height: 720 },
]
const DESKTOP = { name: '1280x800', width: 1280, height: 800 }
const { check, report } = createChecker()

function readFlag(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : (process.argv[index + 1] ?? null)
}

async function readOwnerState(page) {
  return page.evaluate(() => {
    const owner = document.querySelector('.learn-main__scroll')
    const log = document.querySelector('.scheduler-event-log > ol')
    return {
      ownerTop: Math.round(owner?.scrollTop ?? -1),
      ownerMax: Math.round((owner?.scrollHeight ?? 0) - (owner?.clientHeight ?? 0)),
      innerTop: Math.round(log?.scrollTop ?? -1),
      innerMax: Math.round((log?.scrollHeight ?? 0) - (log?.clientHeight ?? 0)),
    }
  })
}

async function placeLogInViewport(page, alignEnd = false) {
  await page.evaluate((alignToEnd) => {
    const owner = document.querySelector('.learn-main__scroll')
    const log = document.querySelector('.scheduler-event-log > ol')
    const ownerRect = owner.getBoundingClientRect()
    const logRect = log.getBoundingClientRect()
    const logTop = logRect.top + owner.scrollTop - ownerRect.top
    const logBottom = logRect.bottom + owner.scrollTop - ownerRect.top
    const maxOwnerTop = owner.scrollHeight - owner.clientHeight
    const target = alignToEnd
      ? Math.min(logBottom - owner.clientHeight + 180, maxOwnerTop - 160)
      : logTop - 180
    owner.scrollTop = Math.max(0, target)
  }, alignEnd)
  await page.waitForTimeout(70)

  return page.evaluate(() => {
    const owner = document.querySelector('.learn-main__scroll')
    const ownerRect = owner.getBoundingClientRect()
    const log = document.querySelector('.scheduler-event-log > ol')
    const logRect = log.getBoundingClientRect()
    const y = Math.min(Math.max(logRect.top + 70, ownerRect.top + 8), ownerRect.bottom - 8)
    return { x: Math.round(logRect.left + Math.min(80, logRect.width / 2)), y: Math.round(y) }
  })
}

async function runSchedulerJourney(browser, baseUrl, viewport, slug, scheme) {
  const label = `${slug} @${viewport.name} ${scheme}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: scheme,
    hasTouch: viewport.width < 700,
    isMobile: viewport.width < 700,
  })
  const page = await context.newPage()
  const pageErrors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}/learn/${slug}/`, { waitUntil: 'networkidle' })
    const actionName = slug === 'scheduling-failure' ? '跳到失败' : '单步推进'
    await page.getByRole('button', { name: actionName, exact: true }).first().click()
    await page.waitForFunction(() => {
      const log = document.querySelector('.scheduler-event-log > ol')
      return log && log.children.length > 9
    })

    const initial = await page.evaluate(() => {
      const log = document.querySelector('.scheduler-event-log > ol')
      const owner = document.querySelector('.learn-main__scroll')
      const section = document.querySelector('.visualization-section')
      const style = getComputedStyle(log)
      return {
        rows: log.children.length,
        scrollHeight: log.scrollHeight,
        clientHeight: log.clientHeight,
        maxHeight: style.maxHeight,
        overflowY: style.overflowY,
        ownerOverflow: owner.scrollWidth - owner.clientWidth,
        sectionOverflow: section.scrollWidth - section.clientWidth,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        lastEvent: log.lastElementChild?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      }
    })
    check(
      `${label} 事件全部自然展开`,
      initial.rows > 9 && initial.scrollHeight <= initial.clientHeight + 1,
      `rows=${initial.rows} content=${initial.scrollHeight}/${initial.clientHeight} max-height=${initial.maxHeight}`,
    )
    check(
      `${label} 不再有内部纵向滚动 owner`,
      initial.maxHeight === 'none' &&
        initial.overflowY !== 'auto' &&
        initial.overflowY !== 'scroll',
      `max-height=${initial.maxHeight} overflow-y=${initial.overflowY}`,
    )
    check(
      `${label} 不产生 page-level 横向溢出`,
      initial.documentOverflow <= 1,
      `document=${initial.documentOverflow} section=${initial.sectionOverflow} owner=${initial.ownerOverflow}`,
    )
    check(
      `${label} 最后一条事件仍在 DOM`,
      initial.lastEvent.length > 0,
      initial.lastEvent.slice(0, 80),
    )

    const point = await placeLogInViewport(page)
    const before = await readOwnerState(page)
    await page.mouse.move(point.x, point.y)
    await page.mouse.wheel(0, 140)
    await page.waitForTimeout(80)
    const afterWheel = await readOwnerState(page)
    check(
      `${label} 从事件日志区域滚轮时由页面继续滚动`,
      afterWheel.ownerTop > before.ownerTop && afterWheel.innerTop === 0,
      `page ${before.ownerTop}→${afterWheel.ownerTop}; inner=${afterWheel.innerTop}/${afterWheel.innerMax}`,
    )

    const endPoint = await placeLogInViewport(page, true)
    const beforeEnd = await readOwnerState(page)
    await page.mouse.move(endPoint.x, endPoint.y)
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(80)
    const afterEnd = await readOwnerState(page)
    check(
      `${label} 事件列表末端可自然继续页面滚动`,
      afterEnd.ownerTop > beforeEnd.ownerTop && afterEnd.innerMax === 0,
      `page ${beforeEnd.ownerTop}→${afterEnd.ownerTop}; inner max=${afterEnd.innerMax}`,
    )

    if (slug === 'scheduling-failure' && viewport.width === 390 && scheme === 'light') {
      const touchPoint = await placeLogInViewport(page)
      const client = await context.newCDPSession(page)
      const touch = (type, x, y) =>
        client.send('Input.dispatchTouchEvent', {
          type,
          touchPoints:
            type === 'touchEnd' ? [] : [{ id: 1, x, y, radiusX: 1, radiusY: 1, force: 1 }],
        })
      const touchBefore = await readOwnerState(page)
      await touch('touchStart', touchPoint.x, touchPoint.y)
      await touch('touchMove', touchPoint.x, touchPoint.y - 70)
      await touch('touchMove', touchPoint.x, touchPoint.y - 140)
      await touch('touchEnd', touchPoint.x, touchPoint.y - 140)
      await page.waitForTimeout(120)
      const touchAfter = await readOwnerState(page)
      check(
        `${label} 手指从事件日志上滑动仍滚动页面`,
        touchAfter.ownerTop > touchBefore.ownerTop && touchAfter.innerTop === 0,
        `page ${touchBefore.ownerTop}→${touchAfter.ownerTop}; inner=${touchAfter.innerTop}/${touchAfter.innerMax}`,
      )
      await client.detach()
    }

    check(`${label} 无浏览器脚本错误`, pageErrors.length === 0, pageErrors.join('; '))
  } finally {
    await page.close()
    await context.close()
  }
}

async function clickRaw(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('capstone action has no bounding box')
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(90)
}

async function completeCapstoneThroughIncident(page) {
  await clickRaw(page, page.getByRole('button', { name: '确认 Mission Brief', exact: true }))
  await clickRaw(page, page.locator('.capstone-choice').first())
  await clickRaw(page, page.locator('.capstone-choice').first())
  await clickRaw(page, page.getByRole('button', { name: '确认日批运行证据', exact: true }))
  await clickRaw(
    page,
    page.locator('.capstone-incident-card').nth(0).locator('.capstone-choice').first(),
  )
  await clickRaw(
    page,
    page.locator('.capstone-incident-card').nth(1).locator('.capstone-choice').first(),
  )
}

async function readActiveCheckpoint(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.capstone-checkpoint-nav')
    const item = nav.querySelector('.capstone-checkpoint.is-active')
    const navRect = nav.getBoundingClientRect()
    const itemRect = item?.getBoundingClientRect()
    return {
      text: item?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      index: Array.from(nav.querySelectorAll('.capstone-checkpoint')).indexOf(item) + 1,
      scrollLeft: nav.scrollLeft,
      maxScrollLeft: nav.scrollWidth - nav.clientWidth,
      visible: Boolean(
        itemRect && itemRect.left >= navRect.left - 1 && itemRect.right <= navRect.right + 1,
      ),
      navLabel: nav.getAttribute('aria-label') ?? '',
    }
  })
}

async function runCapstoneJourney(browser, baseUrl, viewport, scheme, reducedMotion = false) {
  const label = `Capstone rail @${viewport.name} ${scheme}${reducedMotion ? ' reduced-motion' : ''}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: scheme,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    hasTouch: viewport.width < 700,
    isMobile: viewport.width < 700,
  })
  const page = await context.newPage()
  const pageErrors = trackPageErrors(page)

  try {
    await page.goto(`${baseUrl}/learn/build-a-warehouse/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.capstone-checkpoint-nav .capstone-checkpoint')
    const initial = await page.evaluate(() => {
      const nav = document.querySelector('.capstone-checkpoint-nav')
      const rect = nav.getBoundingClientRect()
      const items = [...nav.querySelectorAll('.capstone-checkpoint')]
      const third = items[2].getBoundingClientRect()
      const hint = document.querySelector('.capstone-workbench .pattern3-scroll-hint')
      return {
        scrollWidth: nav.scrollWidth,
        clientWidth: nav.clientWidth,
        nextItemPartlyVisible: third.left < rect.right && third.right > rect.right,
        hintVisible: Boolean(
          hint &&
          getComputedStyle(hint).display !== 'none' &&
          hint.getBoundingClientRect().height > 0,
        ),
        label: nav.getAttribute('aria-label') ?? '',
      }
    })
    if (viewport.width < 700) {
      check(
        `${label} 初始布局露出下一 checkpoint 并显示滚动提示`,
        initial.nextItemPartlyVisible && initial.hintVisible,
        `partial=${initial.nextItemPartlyVisible} hint=${initial.hintVisible}`,
      )
      check(`${label} 导航名称说明可横向滚动`, /横向滚动/.test(initial.label), initial.label)
    }

    await page.addStyleTag({ content: '.learn-main__scroll { overflow-anchor: none; }' })
    await completeCapstoneThroughIncident(page)
    await page.waitForFunction(
      () => {
        const nav = document.querySelector('.capstone-checkpoint-nav')
        const item = nav?.querySelector('.capstone-checkpoint.is-active')
        if (!nav || !item) return false
        const navRect = nav.getBoundingClientRect()
        const itemRect = item.getBoundingClientRect()
        return itemRect.left >= navRect.left - 1 && itemRect.right <= navRect.right + 1
      },
      undefined,
      { timeout: 2500 },
    )

    const active = await readActiveCheckpoint(page)
    check(
      `${label} 实际完成到第 6 checkpoint 后 active item 可见`,
      active.index === 6 && active.visible,
      `index=${active.index} scrollLeft=${active.scrollLeft}/${active.maxScrollLeft} item=${active.text}`,
    )
    if (viewport.width < 700) {
      check(
        `${label} active item 变化只拥有 rail 的横向滚动`,
        active.scrollLeft > 0,
        `scrollLeft=${active.scrollLeft}`,
      )
    }

    const activeButton = page.locator('.capstone-checkpoint-nav button[aria-current="step"]')
    await page.locator('.capstone-checkpoint-nav button').first().focus()
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('Tab')
    const keyboardState = await page.evaluate(() => {
      const nav = document.querySelector('.capstone-checkpoint-nav')
      const focused = document.activeElement
      const item = focused?.closest('.capstone-checkpoint')
      const navRect = nav.getBoundingClientRect()
      const itemRect = item?.getBoundingClientRect()
      return {
        focusedText: item?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        current: focused?.getAttribute('aria-current'),
        visible: Boolean(
          itemRect && itemRect.left >= navRect.left - 1 && itemRect.right <= navRect.right + 1,
        ),
      }
    })
    check(
      `${label} 键盘 Tab 能到达并看见当前 checkpoint`,
      keyboardState.current === 'step' && keyboardState.visible,
      `current=${keyboardState.current} visible=${keyboardState.visible} item=${keyboardState.focusedText}`,
    )
    await page.keyboard.press('Enter')
    await page.waitForTimeout(80)
    check(
      `${label} checkpoint 按钮可用 Enter 激活`,
      (await activeButton.count()) === 1,
      'aria-current=step',
    )

    if (viewport.width < 700) {
      const rail = page.locator('.capstone-checkpoint-nav')
      await rail.scrollIntoViewIfNeeded()
      const box = await rail.boundingBox()
      const point = { x: Math.round(box.x + box.width - 24), y: Math.round(box.y + box.height / 2) }
      const before = await rail.evaluate((nav) => nav.scrollLeft)
      const client = await context.newCDPSession(page)
      const dispatch = (type, x) =>
        client.send('Input.dispatchTouchEvent', {
          type,
          touchPoints:
            type === 'touchEnd' ? [] : [{ id: 2, x, y: point.y, radiusX: 1, radiusY: 1, force: 1 }],
        })
      await dispatch('touchStart', point.x)
      await dispatch('touchMove', point.x - 65)
      await dispatch('touchMove', point.x - 130)
      await dispatch('touchEnd', point.x - 130)
      await page.waitForTimeout(100)
      const after = await rail.evaluate((nav) => nav.scrollLeft)
      check(
        `${label} 触摸横滑可浏览其余 checkpoint`,
        after > before,
        `scrollLeft=${before}→${after}`,
      )
      const stable = await rail.evaluate((nav) => nav.scrollLeft)
      await page.waitForTimeout(120)
      const afterIdle = await rail.evaluate((nav) => nav.scrollLeft)
      check(
        `${label} 用户手动滚 rail 后系统不抢回位置`,
        Math.abs(afterIdle - stable) < 1,
        `scrollLeft=${stable}→${afterIdle}`,
      )
      await client.detach()
    }

    const overflow = await page.evaluate(() => {
      const owner = document.querySelector('.learn-main__scroll')
      const section = document.querySelector('.visualization-section')
      return {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        section: section.scrollWidth - section.clientWidth,
        owner: owner.scrollWidth - owner.clientWidth,
      }
    })
    check(
      `${label} 不产生 page-level overflow`,
      overflow.document <= 1 && overflow.section <= 1 && overflow.owner <= 1,
      JSON.stringify(overflow),
    )
    check(`${label} 无浏览器脚本错误`, pageErrors.length === 0, pageErrors.join('; '))
  } finally {
    await page.close()
    await context.close()
  }
}

async function runHorizontalPathJourney(browser, baseUrl, viewport, scheme, slug, selector) {
  const label = `${slug} ${selector} @${viewport.name} ${scheme}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: scheme,
  })
  const page = await context.newPage()
  try {
    await page.goto(`${baseUrl}/learn/${slug}/`, { waitUntil: 'networkidle' })
    const path = page.locator(selector)
    await path.waitFor({ state: 'attached' })
    const initial = await path.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
      tabIndex: el.tabIndex,
      label: el.getAttribute('aria-label') ?? '',
      hintVisible: Boolean(
        el.parentElement?.querySelector('.pattern3-scroll-hint') &&
        getComputedStyle(el.parentElement.querySelector('.pattern3-scroll-hint')).display !==
          'none',
      ),
    }))
    check(
      `${label} 横向滚动及 affordance 可发现`,
      initial.scrollWidth > initial.clientWidth &&
        initial.overflowX === 'auto' &&
        initial.hintVisible,
      `width=${initial.clientWidth}/${initial.scrollWidth} overflow=${initial.overflowX} hint=${initial.hintVisible}`,
    )
    check(
      `${label} 有可键盘到达的语义标签`,
      initial.tabIndex === 0 && /横向滚动/.test(initial.label),
      `tabIndex=${initial.tabIndex} label=${initial.label}`,
    )

    await path.focus()
    const before = await path.evaluate((el) => el.scrollLeft)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(50)
    const after = await path.evaluate((el) => el.scrollLeft)
    check(`${label} 键盘方向键可滚动 rail`, after > before, `scrollLeft=${before}→${after}`)
    check(
      `${label} 键盘滚动不抢页面纵向位置`,
      await page.evaluate(() => window.scrollY === 0),
      'document scrollY must remain 0',
    )
  } finally {
    await page.close()
    await context.close()
  }
}

async function runTableJourney(browser, baseUrl, viewport, scheme, slug, selector) {
  const label = `${slug} ${selector} @${viewport.name} ${scheme}`
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: scheme,
  })
  const page = await context.newPage()
  try {
    await page.goto(`${baseUrl}/learn/${slug}/`, { waitUntil: 'networkidle' })
    const tableRegion = page.locator(selector).first()
    await tableRegion.waitFor({ state: 'attached' })
    await page.waitForFunction((query) => {
      const el = document.querySelector(query)
      return el && el.getAttribute('role') === 'region' && el.tabIndex === 0
    }, selector)
    const before = await tableRegion.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
      role: el.getAttribute('role'),
      tabIndex: el.tabIndex,
      label: el.getAttribute('aria-label') ?? '',
      hint:
        el.parentElement?.querySelector('.horizontal-scroll-region__hint')?.textContent?.trim() ??
        '',
    }))
    check(
      `${label} 保持表格语义并有可感知提示`,
      before.scrollWidth > before.clientWidth &&
        before.overflowX === 'auto' &&
        before.hint.length > 0,
      `width=${before.clientWidth}/${before.scrollWidth} overflow=${before.overflowX} hint=${before.hint}`,
    )
    check(
      `${label} 横向区域键盘可达`,
      before.role === 'region' && before.tabIndex === 0 && /横向滚动/.test(before.label),
      `role=${before.role} tabIndex=${before.tabIndex} label=${before.label}`,
    )

    await tableRegion.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await tableRegion.focus()
    const beforeKey = await tableRegion.evaluate((el) => el.scrollLeft)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(60)
    const afterKey = await tableRegion.evaluate((el) => el.scrollLeft)
    check(
      `${label} 方向键能滚动完整表格列`,
      afterKey > beforeKey,
      `scrollLeft=${beforeKey}→${afterKey}`,
    )

    const box = await tableRegion.boundingBox()
    const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
    const beforeWheel = await tableRegion.evaluate((el) => el.scrollLeft)
    await page.mouse.move(point.x, point.y)
    await page.mouse.wheel(140, 0)
    await page.waitForTimeout(60)
    const afterWheel = await tableRegion.evaluate((el) => el.scrollLeft)
    check(
      `${label} 鼠标/trackpad 横向手势可滚动`,
      afterWheel > beforeWheel,
      `scrollLeft=${beforeWheel}→${afterWheel}`,
    )

    const overflow = await page.evaluate(() => {
      const owner = document.querySelector('.learn-main__scroll')
      const section = document.querySelector('.visualization-section')
      return {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        owner: owner.scrollWidth - owner.clientWidth,
        section: section.scrollWidth - section.clientWidth,
      }
    })
    check(
      `${label} wrapper 内滚动不产生页面横向溢出`,
      overflow.document <= 1 && overflow.owner <= 1 && overflow.section <= 1,
      JSON.stringify(overflow),
    )
  } finally {
    await page.close()
    await context.close()
  }
}

async function runDesktopContrast(browser, baseUrl, scheme) {
  const label = `1280x800 desktop ${scheme}`
  const context = await browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    colorScheme: scheme,
  })
  const page = await context.newPage()
  try {
    for (const slug of [
      'scheduling-failure',
      'build-a-warehouse',
      'data-governance-change-responsibility',
      'data-lineage-fields',
      'sql-and-transformation',
      'lakehouse-unity',
      'metric-system',
    ]) {
      await page.goto(`${baseUrl}/learn/${slug}/`, { waitUntil: 'networkidle' })
      const layout = await page.evaluate(() => {
        const owner = document.querySelector('.learn-main__scroll')
        const section = document.querySelector('.visualization-section')
        return {
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          owner: owner.scrollWidth - owner.clientWidth,
          section: section.scrollWidth - section.clientWidth,
          hintVisible: [
            ...document.querySelectorAll('.pattern3-scroll-hint, .horizontal-scroll-region__hint'),
          ].some(
            (hint) =>
              getComputedStyle(hint).display !== 'none' && hint.getBoundingClientRect().height > 0,
          ),
        }
      })
      check(
        `${label} ${slug} 无水平布局回归`,
        layout.document <= 1 && layout.owner <= 1 && layout.section <= 1,
        JSON.stringify(layout),
      )
      check(
        `${label} ${slug} 不出现窄屏滚动提示`,
        !layout.hintVisible,
        `hintVisible=${layout.hintVisible}`,
      )
    }
  } finally {
    await page.close()
    await context.close()
  }
}

async function main() {
  const browser = await launchChromium()
  const preview = await startPreview({
    root: ROOT,
    base: readFlag('--base'),
    skipBuild: process.argv.includes('--skip-build'),
    scriptName: 'scroll-ownership',
  })

  try {
    for (const viewport of VIEWPORTS) {
      const scheme = viewport.width === 390 ? 'light' : 'dark'
      for (const slug of ['scheduling-failure', 'scheduling-readiness']) {
        await runSchedulerJourney(browser, preview.baseUrl, viewport, slug, scheme)
      }
      await runCapstoneJourney(browser, preview.baseUrl, viewport, scheme)
      await runHorizontalPathJourney(
        browser,
        preview.baseUrl,
        viewport,
        scheme,
        'data-governance-change-responsibility',
        '.governance-impact-path',
      )
      await runHorizontalPathJourney(
        browser,
        preview.baseUrl,
        viewport,
        scheme,
        'data-lineage-fields',
        '.lineage-teaching-field-path',
      )
      await runTableJourney(
        browser,
        preview.baseUrl,
        viewport,
        scheme,
        'sql-and-transformation',
        '.sql-workbench__table-wrap',
      )
      await runTableJourney(
        browser,
        preview.baseUrl,
        viewport,
        scheme,
        'lakehouse-unity',
        '.lakehouse-unity-table-wrap',
      )
      await runTableJourney(
        browser,
        preview.baseUrl,
        viewport,
        scheme,
        'metric-system',
        '.banking-lab__table-wrap',
      )
      console.log(`[scroll-ownership] ${viewport.name} ${scheme} journeys done`)
    }

    await runCapstoneJourney(browser, preview.baseUrl, VIEWPORTS[0], 'dark', true)
    await runDesktopContrast(browser, preview.baseUrl, 'light')
    await runDesktopContrast(browser, preview.baseUrl, 'dark')
  } finally {
    await browser.close()
    preview.stop()
  }

  process.exitCode = report('scroll-ownership') > 0 ? 1 : 0
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
