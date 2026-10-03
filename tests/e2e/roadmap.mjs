#!/usr/bin/env node
/** Focused browser contract for the static Learning Roadmap route. */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'roadmap'
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '320x720', width: 320, height: 720 },
]
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const rawBasePath = process.env.BASE_PATH || '/'
const basePath = `/${rawBasePath.split('/').filter(Boolean).join('/')}`.replace(/^\/$/, '')
const route = (path) => `${basePath}${path}`
const { check, report } = createChecker()

async function inspectPage(page, baseUrl, tag, errors) {
  const response = await page.goto(`${baseUrl}${route('/roadmap/')}`, {
    waitUntil: 'networkidle',
  })
  // `goto` resolves to null only for non-navigation paths; a fresh static route must return 200.
  check(
    `${tag} /roadmap/ 返回 HTTP 200`,
    response?.status() === 200,
    `status=${response?.status()}`,
  )
  await page.locator('.roadmap-topic[data-topic-id]').first().waitFor({ state: 'visible' })

  const documentContract = await page.evaluate(() => {
    const doc = document.documentElement
    const topicCards = Array.from(document.querySelectorAll('.roadmap-topic[data-topic-id]'))
    const stages = Array.from(document.querySelectorAll('.roadmap-stage[data-stage-id]'))
    const lessonLinks = Array.from(document.querySelectorAll('.roadmap-topic__lessons a'))
    const relationLinks = Array.from(
      document.querySelectorAll('.roadmap-topic__relations a[href^="#roadmap-topic-"]'),
    )
    const topicIds = topicCards.map((card) => card.getAttribute('data-topic-id'))
    const linkedTopicIds = relationLinks
      .map((link) => link.getAttribute('href')?.slice(1))
      .filter(Boolean)
    const missingTopicTargets = linkedTopicIds.filter((id) => !document.getElementById(id))
    const lessonHrefs = lessonLinks.map((link) => link.getAttribute('href'))
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((node) => node.tagName)

    return {
      lang: doc.lang,
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
      stageCount: stages.length,
      topicCount: topicCards.length,
      lessonCount: lessonLinks.length,
      uniqueLessonCount: new Set(lessonHrefs).size,
      lessonHrefs,
      stageIds: stages.map((stage) => stage.getAttribute('data-stage-id')),
      topicIds,
      missingTopicTargets,
      relationLinks: relationLinks.length,
      requiredText: document.body.innerText.includes('知识前置'),
      recommendedText: document.body.innerText.includes('推荐先看'),
      relatedText: document.body.innerText.includes('相关主题'),
      requiredReasonCount: document.querySelectorAll('.roadmap-relation-group--required li > p')
        .length,
      h1Count: headings.filter((tagName) => tagName === 'H1').length,
      documentWidth: doc.scrollWidth,
      viewportWidth: window.innerWidth,
      disabledLessonLinks: lessonLinks.filter((link) => link.matches(':disabled')).length,
      progressUi: Boolean(
        document.querySelector(
          '[data-progress-lesson-id], [data-progress-topic], [data-stage-progress]',
        ),
      ),
      roadmapStorageKeys: Object.keys(localStorage).filter((key) =>
        key.toLowerCase().includes('roadmap'),
      ),
    }
  })

  check(`${tag} lang=zh-CN`, documentContract.lang === 'zh-CN', documentContract.lang)
  check(
    `${tag} title / description`,
    documentContract.title.includes('路线图') && Boolean(documentContract.description),
  )
  check(
    `${tag} canonical 使用公开 /roadmap/ URL`,
    documentContract.canonical === 'https://sql.sb/roadmap/',
  )
  check(
    `${tag} 静态 SSR 输出 8 Stage`,
    documentContract.stageCount === 8,
    `stages=${documentContract.stageCount}`,
  )
  check(
    `${tag} 静态 SSR 输出 32 Topic`,
    documentContract.topicCount === 32,
    `topics=${documentContract.topicCount}`,
  )
  check(
    `${tag} Topic 映射 54 个不重复的真实 Lesson link`,
    documentContract.lessonCount === 54 && documentContract.uniqueLessonCount === 54,
    `links=${documentContract.lessonCount} unique=${documentContract.uniqueLessonCount}`,
  )
  check(
    `${tag} 所有 Lesson link 遵循 BASE_PATH + /learn/`,
    documentContract.lessonHrefs.every((href) => href?.startsWith(route('/learn/'))),
    documentContract.lessonHrefs.find((href) => !href?.startsWith(route('/learn/'))) ?? '',
  )
  check(
    `${tag} 三类关系均有独立文本`,
    documentContract.requiredText &&
      documentContract.recommendedText &&
      documentContract.relatedText,
  )
  check(`${tag} required rationale 来自 projection`, documentContract.requiredReasonCount > 0)
  check(
    `${tag} Topic relation anchor 均有目标`,
    documentContract.relationLinks > 0 && documentContract.missingTopicTargets.length === 0,
  )
  check(`${tag} 单一 H1`, documentContract.h1Count === 1, `h1=${documentContract.h1Count}`)
  check(
    `${tag} 无 document 横向溢出`,
    documentContract.documentWidth <= documentContract.viewportWidth + 1,
    `scrollWidth=${documentContract.documentWidth} viewport=${documentContract.viewportWidth}`,
  )
  check(`${tag} 没有禁用的 Lesson link`, documentContract.disabledLessonLinks === 0)
  check(`${tag} 没有接入 Roadmap progress UI`, !documentContract.progressUi)
  check(
    `${tag} 没有新增 Roadmap localStorage state`,
    documentContract.roadmapStorageKeys.length === 0,
  )

  const themeToggle = page.locator('button.theme-toggle')
  await themeToggle.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await themeToggle.click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.waitForTimeout(300)
  const darkColors = await page.evaluate(() => {
    const title = document.querySelector('.roadmap-topic h3')
    const card = document.querySelector('.roadmap-topic')
    return {
      text: title ? getComputedStyle(title).color : '',
      surface: card ? getComputedStyle(card).backgroundColor : '',
      background: getComputedStyle(document.body).backgroundColor,
    }
  })
  check(
    `${tag} dark theme text remains distinct from page/card surfaces`,
    darkColors.text !== darkColors.surface && darkColors.text !== darkColors.background,
    JSON.stringify(darkColors),
  )
  await themeToggle.click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  check(
    `${tag} light theme restores`,
    (await page.locator('html').getAttribute('data-theme')) === 'light',
  )
  check(`${tag} no uncaught browser errors`, errors.length === 0, errors.join(' | '))

  return documentContract
}

async function main() {
  const preview = await startPreview({
    root: ROOT,
    base: externalBase,
    skipBuild,
    scriptName: SCRIPT_NAME,
  })
  const sitemap = await readFile(join(ROOT, 'dist', 'sitemap-0.xml'), 'utf8')
  check(
    'sitemap 包含 BASE_PATH 下的 Roadmap route',
    sitemap.includes(`https://sql.sb${route('/roadmap/')}`),
  )
  check('没有生成 English Roadmap sitemap route', !sitemap.includes('/en/roadmap/'))
  let browser

  try {
    browser = await launchChromium()

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      const errors = trackPageErrors(page)
      await inspectPage(page, preview.baseUrl, viewport.name, errors)

      if (viewport.width === 1280) {
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        })
        let keyboardFocus = { reached: false, outlineStyle: 'none', outlineWidth: '0px' }
        for (let tab = 0; tab < 16 && !keyboardFocus.reached; tab += 1) {
          await page.keyboard.press('Tab')
          keyboardFocus = await page.evaluate(() => ({
            reached: Boolean(document.activeElement?.matches('.roadmap-topic__lessons a')),
            outlineStyle: document.activeElement
              ? getComputedStyle(document.activeElement).outlineStyle
              : 'none',
            outlineWidth: document.activeElement
              ? getComputedStyle(document.activeElement).outlineWidth
              : '0px',
          }))
        }
        check('1280x800 键盘可到达 Topic → Lesson link', keyboardFocus.reached)
        check(
          '1280x800 键盘焦点有可见样式',
          keyboardFocus.outlineStyle !== 'none' &&
            Number.parseFloat(keyboardFocus.outlineWidth) >= 2,
          `${keyboardFocus.outlineStyle} ${keyboardFocus.outlineWidth}`,
        )

        const lessonLink = page.locator('.roadmap-topic__lessons a').first()
        const lessonHref = await lessonLink.getAttribute('href')
        const lessonResponse = await lessonLink
          .click()
          .then(() => null)
          .catch((error) => error)
        if (lessonResponse) {
          check('Topic → Lesson navigation does not throw', false, String(lessonResponse))
        } else {
          await page.waitForURL((url) => url.pathname.includes('/learn/'), { timeout: 15_000 })
          await page.locator('.lesson-header h1').waitFor({ state: 'visible', timeout: 15_000 })
          check(
            'Topic → Lesson opens the real Learn route',
            page.url().includes(lessonHref ?? '/learn/'),
            page.url(),
          )
        }
      }

      await context.close()
    }

    const homeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const homePage = await homeContext.newPage()
    const homeErrors = trackPageErrors(homePage)
    await homePage.goto(`${preview.baseUrl}${route('/')}`, { waitUntil: 'networkidle' })
    const entry = homePage.locator(`a[href="${route('/roadmap/')}"]`).first()
    await entry.waitFor({ state: 'visible' })
    await entry.click()
    await homePage.waitForURL((url) => url.pathname.endsWith('/roadmap/'), { timeout: 15_000 })
    check('首页学习区域可以发现 Roadmap', homePage.url().includes(route('/roadmap/')))
    check(
      '首页到 Roadmap 无 uncaught browser error',
      homeErrors.length === 0,
      homeErrors.join(' | '),
    )
    await homeContext.close()
  } finally {
    await browser?.close()
    preview.stop()
  }

  process.exitCode = report(SCRIPT_NAME) > 0 ? 1 : 0
}

main().catch((error) => {
  console.error(`[${SCRIPT_NAME}] fatal:`, error)
  process.exitCode = 1
})
