#!/usr/bin/env node
/** Focused browser contract for the static Learning Roadmap route. */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'roadmap'
const PROGRESS_STORAGE_KEY = 'data-warehouse-visualized:progress'
/** Sum of `Lesson.estimatedMinutes` over all 55 available lessons; locks derived Topic time. */
const TOTAL_ESTIMATED_MINUTES = 683
/** Frozen Phase 4 Path fixtures; mirrors `src/features/learning-roadmap/paths.ts`. */
const PATH_FIXTURES = {
  systematic: {
    highlighted: 30,
    dimmed: 2,
    entries: ['warehouse-mental-model'],
    audienceKeyword: '第一次系统学习数据仓库',
  },
  'sql-etl': {
    highlighted: 23,
    dimmed: 9,
    entries: ['business-process-and-grain', 'metric-definition-and-scope'],
    audienceKeyword: 'SQL / ETL 基础',
  },
  production: {
    highlighted: 22,
    dimmed: 10,
    entries: [
      'quality-batch-and-evidence',
      'failure-and-recovery',
      'performance-diagnosis-and-scan',
    ],
    audienceKeyword: '数据仓库生产经验',
  },
}
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '320x720', width: 320, height: 720 },
]
/** Mobile-first progress scenarios: desktop + the two contracted phone widths. */
const PROGRESS_VIEWPORTS = VIEWPORTS.slice(1)
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const rawBasePath = process.env.BASE_PATH || '/'
const basePath = `/${rawBasePath.split('/').filter(Boolean).join('/')}`.replace(/^\/$/, '')
const route = (path) => `${basePath}${path}`
const { check, report } = createChecker()

async function waitForProgressReady(page, timeout = 10_000) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('.roadmap-main[data-roadmap-progress]')
        ?.getAttribute('data-roadmap-progress') === 'ready',
    undefined,
    { timeout },
  )
}

async function waitForPathsReady(page, timeout = 10_000) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('.roadmap-main[data-roadmap-paths]')
        ?.getAttribute('data-roadmap-paths') === 'ready',
    undefined,
    { timeout },
  )
}

async function selectPath(page, pathId) {
  await page.locator(`label[data-roadmap-path-label="${pathId}"]`).click()
  await page.waitForFunction(
    (id) =>
      document
        .querySelector('.roadmap-main[data-roadmap-paths]')
        ?.getAttribute('data-active-path') === id,
    pathId,
  )
}

async function seedProgress(context, raw) {
  await context.addInitScript(
    ([key, value]) => {
      // Seed once per context; later scenario updates must survive reloads.
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
    },
    [PROGRESS_STORAGE_KEY, raw],
  )
}

async function readProgressDom(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.roadmap-main')
    const topics = Array.from(document.querySelectorAll('.roadmap-topic[data-topic-id]'))
    return {
      state: root?.getAttribute('data-roadmap-progress') ?? null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      topics: topics.map((card) => ({
        id: card.getAttribute('data-topic-id'),
        state:
          card.querySelector('[data-topic-progress]')?.getAttribute('data-progress-state') ?? null,
        label: card.querySelector('.roadmap-topic__progress-text')?.textContent?.trim() ?? null,
        current: card.querySelector('[data-current-topic]')?.hidden === false,
      })),
      stages: Array.from(document.querySelectorAll('.roadmap-stage[data-stage-id]')).map(
        (section) => ({
          id: section.getAttribute('data-stage-id'),
          label: section.querySelector('[data-stage-progress-text]')?.textContent?.trim() ?? null,
          value: section.querySelector('progress')?.value ?? null,
          max: section.querySelector('progress')?.max ?? null,
          current: section.querySelector('[data-current-stage]')?.hidden === false,
        }),
      ),
      continueHref:
        document.querySelector('[data-roadmap-continue-link]')?.getAttribute('href') ?? null,
      continueText:
        document.querySelector('[data-roadmap-continue-link]')?.textContent?.trim() ?? null,
      continueHidden: document.querySelector('[data-roadmap-continue]')?.hidden ?? null,
      noteVisible: document.querySelector('[data-roadmap-progress-note]')?.hidden === false,
      lessonLinks: Array.from(document.querySelectorAll('[data-lesson-id]')).map((link) => ({
        id: link.getAttribute('data-lesson-id'),
        href: link.getAttribute('href'),
        pointerEvents: getComputedStyle(link).pointerEvents,
        ariaDisabled: link.getAttribute('aria-disabled'),
      })),
    }
  })
}

async function readPathDom(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.roadmap-main[data-roadmap-paths]')
    const cards = Array.from(document.querySelectorAll('.roadmap-topic[data-topic-id]'))
    const parseColor = (value) => {
      const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value)
      return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
    }
    const luminance = (rgb) => {
      const [r, g, b] = rgb.map((channel) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (foreground, background) => {
      const [high, low] = [foreground, background].map(luminance).sort((a, b) => b - a)
      return (high + 0.05) / (low + 0.05)
    }

    return {
      state: root?.getAttribute('data-roadmap-paths') ?? null,
      activePath: root?.getAttribute('data-active-path') ?? null,
      checked: Array.from(document.querySelectorAll('input[data-roadmap-path-option]'))
        .filter((input) => input.checked)
        .map((input) => input.value),
      status: document.querySelector('[data-roadmap-path-status]')?.textContent?.trim() ?? '',
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      topics: cards.map((card) => {
        const title = card.querySelector('h3')
        const cardStyle = getComputedStyle(card)
        const titleStyle = title ? getComputedStyle(title) : null
        const background = parseColor(cardStyle.backgroundColor)
        const foreground = titleStyle ? parseColor(titleStyle.color) : null
        return {
          id: card.getAttribute('data-topic-id'),
          pathState: card.getAttribute('data-path-state'),
          pathEntry: card.getAttribute('data-path-entry') === 'true',
          entryText: card.querySelector('[data-topic-entry]')?.textContent?.trim() ?? null,
          progressState:
            card.querySelector('[data-topic-progress]')?.getAttribute('data-progress-state') ??
            null,
          progressLabel:
            card.querySelector('.roadmap-topic__progress-text')?.textContent?.trim() ?? null,
          current: card.querySelector('[data-current-topic]')?.hidden === false,
          display: cardStyle.display,
          visibility: cardStyle.visibility,
          opacity: Number(cardStyle.opacity),
          contrast: background && foreground ? contrast(foreground, background) : null,
          lessonPointerEvents: Array.from(card.querySelectorAll('[data-lesson-id]')).map(
            (link) => getComputedStyle(link).pointerEvents,
          ),
          lessonHrefs: Array.from(card.querySelectorAll('[data-lesson-id]')).map((link) =>
            link.getAttribute('href'),
          ),
          relationTargets: Array.from(
            card.querySelectorAll('.roadmap-topic__relations a[href^="#roadmap-topic-"]'),
          ).map((link) => link.getAttribute('href')),
        }
      }),
      stageLabels: Array.from(document.querySelectorAll('[data-stage-progress-text]')).map(
        (node) => node.textContent?.trim() ?? '',
      ),
      continueHref:
        document.querySelector('[data-roadmap-continue-link]')?.getAttribute('href') ?? null,
      continueHidden: document.querySelector('[data-roadmap-continue]')?.hidden ?? null,
      roadmapStorageKeys: Object.keys(localStorage).filter((key) =>
        key.toLowerCase().includes('roadmap'),
      ),
    }
  })
}

function topicOf(dom, topicId) {
  const topic = dom.topics.find((candidate) => candidate.id === topicId)
  if (!topic) throw new Error(`Missing Topic in DOM summary: ${topicId}`)
  return topic
}

function stageOf(dom, stageId) {
  const stage = dom.stages.find((candidate) => candidate.id === stageId)
  if (!stage) throw new Error(`Missing Stage in DOM summary: ${stageId}`)
  return stage
}

function parseStageLabel(label) {
  const match = /^(\d+) \/ (\d+) 节 · (\d+)%$/.exec(label ?? '')
  if (!match) return null
  return { completed: Number(match[1]), total: Number(match[2]), percent: Number(match[3]) }
}

function allLessonLinksActive(dom) {
  return dom.lessonLinks.every(
    (link) => link.pointerEvents !== 'none' && link.ariaDisabled === null,
  )
}

async function openRoadmapContext(browser, baseUrl, viewport, rawProgress) {
  const context = await browser.newContext({ viewport })
  if (rawProgress !== undefined) await seedProgress(context, rawProgress)
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  await page.goto(`${baseUrl}${route('/roadmap/')}`, { waitUntil: 'networkidle' })
  await waitForProgressReady(page)
  await waitForPathsReady(page)
  return { context, page, errors }
}

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
  await waitForProgressReady(page)
  await waitForPathsReady(page)

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
      progressState: document
        .querySelector('.roadmap-main[data-roadmap-progress]')
        ?.getAttribute('data-roadmap-progress'),
      topicProgressCount: document.querySelectorAll('[data-topic-progress]').length,
      stageProgressCount: document.querySelectorAll('[data-stage-progress]').length,
      notStartedCount: document.querySelectorAll(
        '[data-topic-progress][data-progress-state="not_started"]',
      ).length,
      stageLabels: Array.from(document.querySelectorAll('[data-stage-progress-text]')).map((node) =>
        node.textContent?.trim(),
      ),
      currentMarkerCount: document.querySelectorAll(
        '[data-current-topic]:not([hidden]), [data-current-stage]:not([hidden])',
      ).length,
      continueHidden: document.querySelector('[data-roadmap-continue]')?.hidden ?? true,
      topicDetailCount: document.querySelectorAll('.roadmap-topic__detail').length,
      whyLearnTexts: Array.from(document.querySelectorAll('.roadmap-topic__why')).map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim(),
      ),
      outcomeTexts: Array.from(document.querySelectorAll('.roadmap-topic__outcome')).map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim(),
      ),
      timeTexts: Array.from(document.querySelectorAll('.roadmap-topic__time')).map((node) =>
        node.textContent?.trim(),
      ),
      estimatedMinutes: Array.from(document.querySelectorAll('.roadmap-topic__time')).map((node) =>
        Number(node.getAttribute('data-topic-estimated-minutes')),
      ),
      pathState:
        document
          .querySelector('.roadmap-main[data-roadmap-paths]')
          ?.getAttribute('data-roadmap-paths') ?? null,
      pathActive:
        document
          .querySelector('.roadmap-main[data-roadmap-paths]')
          ?.getAttribute('data-active-path') ?? null,
      pathOptions: Array.from(document.querySelectorAll('input[data-roadmap-path-option]')).map(
        (input) => ({
          value: input.value,
          checked: input.checked,
          label:
            input
              .closest('label')
              ?.querySelector('.roadmap-path-option__label')
              ?.textContent?.trim() ?? '',
        }),
      ),
      pathStatus: document.querySelector('[data-roadmap-path-status]')?.textContent?.trim() ?? '',
      pathStateCount: document.querySelectorAll('.roadmap-topic[data-path-state]').length,
      pathEntryCount: document.querySelectorAll('.roadmap-topic[data-path-entry]').length,
      entryBadgeCount: document.querySelectorAll('[data-topic-entry]').length,
      lessonPointerEvents: Array.from(document.querySelectorAll('[data-lesson-id]')).map(
        (link) => getComputedStyle(link).pointerEvents,
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
    `${tag} Topic 映射 55 个不重复的真实 Lesson link`,
    documentContract.lessonCount === 55 && documentContract.uniqueLessonCount === 55,
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
  check(
    `${tag} Lesson link 保持可点击`,
    documentContract.lessonPointerEvents.every((pointerEvents) => pointerEvents !== 'none'),
  )
  check(
    `${tag} Progress 增强读取完成`,
    documentContract.progressState === 'ready',
    `state=${documentContract.progressState}`,
  )
  check(
    `${tag} 32 Topic 与 8 Stage 均有 Progress 层`,
    documentContract.topicProgressCount === 32 && documentContract.stageProgressCount === 8,
    `topics=${documentContract.topicProgressCount} stages=${documentContract.stageProgressCount}`,
  )
  check(
    `${tag} 无进度时 32 Topic = 未开始`,
    documentContract.notStartedCount === 32,
    `notStarted=${documentContract.notStartedCount}`,
  )
  check(
    `${tag} 无进度时 8 Stage = 0%`,
    documentContract.stageLabels.length === 8 &&
      documentContract.stageLabels.every((label) => /^\d+ \/ \d+ 节 · 0%$/.test(label ?? '')),
    documentContract.stageLabels.join(' | '),
  )
  check(
    `${tag} 无进度时不显示当前学习与 Continue`,
    documentContract.currentMarkerCount === 0 && documentContract.continueHidden === true,
  )
  check(
    `${tag} 没有新增 Roadmap localStorage state`,
    documentContract.roadmapStorageKeys.length === 0,
  )
  check(
    `${tag} Path enhancer 就绪且默认全部`,
    documentContract.pathState === 'ready' &&
      documentContract.pathActive === 'all' &&
      documentContract.pathStateCount === 0 &&
      documentContract.pathEntryCount === 0 &&
      documentContract.entryBadgeCount === 0,
    `state=${documentContract.pathState} active=${documentContract.pathActive} states=${documentContract.pathStateCount}`,
  )
  check(
    `${tag} Path selector 4 个选项与默认选中`,
    documentContract.pathOptions.length === 4 &&
      documentContract.pathOptions.filter((option) => option.checked).length === 1 &&
      documentContract.pathOptions.find((option) => option.checked)?.value === 'all' &&
      documentContract.pathOptions.map((option) => option.label).join('|') ===
        '全部|系统入门|已有 SQL / ETL|生产经验',
    documentContract.pathOptions.map((option) => `${option.value}:${option.checked}`).join(' '),
  )
  check(
    `${tag} 默认状态文本说明全部知识`,
    documentContract.pathStatus.includes('当前显示全部知识') &&
      documentContract.pathStatus.includes('32 个主题') &&
      documentContract.pathStatus.includes('8 个 Stage'),
    documentContract.pathStatus,
  )
  check(
    `${tag} 32 Topic 均含 why learn / outcome / 时间`,
    documentContract.topicDetailCount === 32 &&
      documentContract.whyLearnTexts.length === 32 &&
      documentContract.outcomeTexts.length === 32 &&
      documentContract.timeTexts.length === 32,
    `detail=${documentContract.topicDetailCount} why=${documentContract.whyLearnTexts.length} outcome=${documentContract.outcomeTexts.length} time=${documentContract.timeTexts.length}`,
  )
  check(
    `${tag} why learn / outcome 文案非空且跨 Topic 唯一`,
    documentContract.whyLearnTexts.every((text) => (text?.length ?? 0) > 8) &&
      new Set(documentContract.whyLearnTexts).size === 32 &&
      documentContract.outcomeTexts.every((text) => (text?.length ?? 0) > 8) &&
      new Set(documentContract.outcomeTexts).size === 32,
  )
  check(
    `${tag} 预计时间格式可读`,
    documentContract.timeTexts.every((text) => /^预计 \d+ 分钟 · \d+ 节$/.test(text ?? '')),
    documentContract.timeTexts.find((text) => !/^预计 \d+ 分钟 · \d+ 节$/.test(text ?? '')) ?? '',
  )
  check(
    `${tag} 预计时间由 55 节 Lesson metadata 派生（合计 ${TOTAL_ESTIMATED_MINUTES} 分钟）`,
    documentContract.estimatedMinutes.every(Number.isFinite) &&
      documentContract.estimatedMinutes.reduce((sum, minutes) => sum + minutes, 0) ===
        TOTAL_ESTIMATED_MINUTES,
    `minutes=${documentContract.estimatedMinutes.reduce((sum, minutes) => sum + minutes, 0)}`,
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

async function runProgressScenarios(browser, baseUrl, viewport) {
  const tag = `progress ${viewport.name}`

  // Partial Topic + current location + completed Topic, all read from the same context.
  {
    const { context, page, errors } = await openRoadmapContext(
      browser,
      baseUrl,
      viewport,
      JSON.stringify({ completedLessonIds: ['lesson-01'], currentLessonId: 'lesson-03' }),
    )
    const partial = await readProgressDom(page)
    const mental = topicOf(partial, 'warehouse-mental-model')
    const grain = topicOf(partial, 'business-process-and-grain')
    const foundation = stageOf(partial, 'foundation')
    const modeling = stageOf(partial, 'modeling')
    const lessonHref = partial.lessonLinks.find((link) => link.id === 'lesson-03')?.href ?? null

    check(
      `${tag} partial Topic 学习中 · 1 / 2`,
      mental.state === 'in_progress' && mental.label === '学习中 · 1 / 2',
      JSON.stringify(mental),
    )
    check(
      `${tag} Stage 使用 available Lesson 分母`,
      foundation.label === '1 / 4 节 · 25%' && foundation.value === 25,
      JSON.stringify(foundation),
    )
    check(
      `${tag} 当前 Topic 与完成状态相互独立`,
      grain.state === 'not_started' && grain.current === true,
      JSON.stringify(grain),
    )
    check(`${tag} 当前 Stage 标记`, modeling.current === true, JSON.stringify(modeling))
    check(
      `${tag} Continue Learning 指向现有 Lesson`,
      partial.continueHidden === false &&
        lessonHref !== null &&
        partial.continueHref === lessonHref &&
        (partial.continueText ?? '').startsWith('继续学习'),
      `href=${partial.continueHref} text=${partial.continueText}`,
    )
    check(`${tag} 进度说明可见`, partial.noteVisible === true)
    check(
      `${tag} partial 无横向溢出`,
      partial.documentWidth <= partial.viewportWidth + 1,
      `scrollWidth=${partial.documentWidth} viewport=${partial.viewportWidth}`,
    )
    check(`${tag} partial Lesson link 保持可点击`, allLessonLinksActive(partial))
    check(`${tag} partial 无 browser error`, errors.length === 0, errors.join(' | '))

    await page.evaluate(
      ([key]) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            completedLessonIds: ['lesson-01', 'lesson-01-terms'],
            currentLessonId: 'lesson-03',
          }),
        ),
      [PROGRESS_STORAGE_KEY],
    )
    await page.reload({ waitUntil: 'networkidle' })
    await waitForProgressReady(page)
    const completed = await readProgressDom(page)
    const completedTopic = topicOf(completed, 'warehouse-mental-model')
    const completedStage = stageOf(completed, 'foundation')

    check(
      `${tag} completed Topic 已完成 · 2 / 2`,
      completedTopic.state === 'completed' && completedTopic.label === '已完成 · 2 / 2',
      JSON.stringify(completedTopic),
    )
    check(
      `${tag} completed Topic 更新 Stage 为 2 / 4 · 50%`,
      completedStage.label === '2 / 4 节 · 50%' && completedStage.value === 50,
      JSON.stringify(completedStage),
    )
    check(`${tag} completed 无 browser error`, errors.length === 0, errors.join(' | '))
    await context.close()
  }

  // All 55 available Lessons completed.
  {
    const { context, page, errors } = await openRoadmapContext(browser, baseUrl, viewport)
    const allLessonIds = await page.evaluate(() => [
      ...new Set(
        Array.from(document.querySelectorAll('[data-lesson-id]')).map(
          (link) => link.getAttribute('data-lesson-id') ?? '',
        ),
      ),
    ])
    check(`${tag} all: 收集到 55 个唯一 Lesson identity`, allLessonIds.length === 55)
    await page.evaluate(
      ([key, ids]) =>
        localStorage.setItem(
          key,
          JSON.stringify({ completedLessonIds: ids, currentLessonId: ids[0] }),
        ),
      [PROGRESS_STORAGE_KEY, allLessonIds],
    )
    await page.reload({ waitUntil: 'networkidle' })
    await waitForProgressReady(page)
    const all = await readProgressDom(page)
    const completedTopics = all.topics.filter((topic) => topic.state === 'completed')
    const parsedStages = all.stages.map((stage) => parseStageLabel(stage.label))
    const stageCompletedSum = parsedStages.reduce((sum, stage) => sum + (stage?.completed ?? 0), 0)
    const stageTotalSum = parsedStages.reduce((sum, stage) => sum + (stage?.total ?? 0), 0)

    check(
      `${tag} all: 32 Topic 全部完成`,
      completedTopics.length === 32,
      `completed=${completedTopics.length}`,
    )
    check(
      `${tag} all: 8 Stage 全部 100%`,
      all.stages.length === 8 &&
        all.stages.every((stage) => stage.value === 100 && (stage.label ?? '').endsWith('100%')),
      all.stages.map((stage) => `${stage.id}:${stage.label}`).join(' | '),
    )
    check(
      `${tag} all: Stage 分母无重复且合计 55`,
      stageTotalSum === 55 && stageCompletedSum === 55,
      `completed=${stageCompletedSum} total=${stageTotalSum}`,
    )
    check(
      `${tag} all: 没有 >100%`,
      parsedStages.every((stage) => stage !== null && stage.percent <= 100),
    )
    check(
      `${tag} all: 当前学习仍独立存在`,
      all.topics.some((topic) => topic.current) && all.continueHidden === false,
    )
    check(
      `${tag} all: 无横向溢出`,
      all.documentWidth <= all.viewportWidth + 1,
      `scrollWidth=${all.documentWidth} viewport=${all.viewportWidth}`,
    )
    check(`${tag} all: 无 browser error`, errors.length === 0, errors.join(' | '))
    await context.close()
  }

  // Malformed storage + stale Lesson IDs degrade to the neutral empty state.
  {
    const { context, page, errors } = await openRoadmapContext(
      browser,
      baseUrl,
      viewport,
      '{not-json',
    )
    const malformed = await readProgressDom(page)
    check(
      `${tag} malformed storage 回退到未开始`,
      malformed.state === 'ready' &&
        malformed.topics.every((topic) => topic.state === 'not_started') &&
        malformed.continueHidden === true,
    )
    check(
      `${tag} malformed 不产生当前学习标记`,
      malformed.topics.every((topic) => !topic.current) &&
        malformed.stages.every((stage) => !stage.current),
    )

    await page.evaluate(
      ([key]) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            completedLessonIds: ['lesson-01', 'removed-lesson', 'lesson-01'],
            currentLessonId: 'removed-lesson',
          }),
        ),
      [PROGRESS_STORAGE_KEY],
    )
    await page.reload({ waitUntil: 'networkidle' })
    await waitForProgressReady(page)
    const stale = await readProgressDom(page)
    const staleMental = topicOf(stale, 'warehouse-mental-model')
    check(
      `${tag} stale Lesson ID 被现有 normalization 清理`,
      staleMental.state === 'in_progress' && staleMental.label === '学习中 · 1 / 2',
      JSON.stringify(staleMental),
    )
    check(`${tag} stale current Lesson 安全降级`, stale.continueHidden === true)
    check(`${tag} malformed / stale 无 browser error`, errors.length === 0, errors.join(' | '))
    await context.close()
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function runPathScenarios(browser, baseUrl, viewport) {
  const tag = `path ${viewport.name}`
  const { context, page, errors } = await openRoadmapContext(
    browser,
    baseUrl,
    viewport,
    JSON.stringify({ completedLessonIds: ['lesson-01'], currentLessonId: 'lesson-03' }),
  )

  const baseline = await readPathDom(page)
  check(
    `${tag} 默认全部：无 Path 覆盖状态`,
    baseline.activePath === 'all' &&
      baseline.topics.length === 32 &&
      baseline.topics.every((topic) => topic.pathState === null && !topic.pathEntry),
    `active=${baseline.activePath}`,
  )

  const selectedPaths =
    viewport.width === 1280 ? ['systematic', 'sql-etl', 'production'] : ['systematic', 'production']
  for (const pathId of selectedPaths) {
    await selectPath(page, pathId)
    const dom = await readPathDom(page)
    const fixture = PATH_FIXTURES[pathId]
    const highlighted = dom.topics.filter((topic) => topic.pathState === 'highlighted')
    const dimmed = dom.topics.filter((topic) => topic.pathState === 'dimmed')
    const entries = dom.topics.filter((topic) => topic.pathEntry)

    check(
      `${tag} ${pathId}: 重点 ${fixture.highlighted} / 弱化 ${fixture.dimmed}`,
      dom.activePath === pathId &&
        highlighted.length === fixture.highlighted &&
        dimmed.length === fixture.dimmed &&
        highlighted.length + dimmed.length === 32,
      `active=${dom.activePath} highlighted=${highlighted.length} dimmed=${dimmed.length}`,
    )
    check(
      `${tag} ${pathId}: 建议入口与文本标记`,
      entries
        .map((topic) => topic.id)
        .sort()
        .join('|') === [...fixture.entries].sort().join('|') &&
        entries.every((topic) => topic.entryText === '建议入口'),
      entries.map((topic) => `${topic.id}:${topic.entryText}`).join(' '),
    )
    check(
      `${tag} ${pathId}: 状态文本包含适合人群与重点数量`,
      dom.status.includes(fixture.audienceKeyword) &&
        dom.status.includes(`重点 ${fixture.highlighted} 个主题`) &&
        dom.status.includes('仍然保留'),
      dom.status,
    )
    check(
      `${tag} ${pathId}: 非路线 Topic 未被隐藏且保持可读`,
      dimmed.every(
        (topic) =>
          topic.display !== 'none' &&
          topic.visibility !== 'hidden' &&
          topic.opacity >= 0.6 &&
          (topic.contrast ?? 0) >= 4.5,
      ),
      dimmed
        .filter(
          (topic) =>
            topic.display === 'none' ||
            topic.visibility === 'hidden' ||
            topic.opacity < 0.6 ||
            (topic.contrast ?? 0) < 4.5,
        )
        .map(
          (topic) =>
            `${topic.id}:${topic.display}/${topic.visibility}/${topic.opacity}/${topic.contrast}`,
        )
        .join(' '),
    )
    check(
      `${tag} ${pathId}: 所有 Lesson link 仍然可点击`,
      dom.topics.every((topic) => topic.lessonPointerEvents.every((value) => value !== 'none')),
    )
    check(
      `${tag} ${pathId}: Graph relation 保持完整`,
      sameJson(
        dom.topics.map((topic) => topic.relationTargets),
        baseline.topics.map((topic) => topic.relationTargets),
      ),
    )
    check(
      `${tag} ${pathId}: Progress 与 Current 正交`,
      sameJson(
        dom.topics.map((topic) => [topic.progressState, topic.progressLabel, topic.current]),
        baseline.topics.map((topic) => [topic.progressState, topic.progressLabel, topic.current]),
      ),
    )
    check(
      `${tag} ${pathId}: Stage Progress 与 Continue Learning 不变`,
      sameJson(dom.stageLabels, baseline.stageLabels) &&
        dom.continueHref === baseline.continueHref &&
        dom.continueHidden === baseline.continueHidden,
    )
    check(
      `${tag} ${pathId}: 无横向溢出且未写 Roadmap storage`,
      dom.documentWidth <= dom.viewportWidth + 1 && dom.roadmapStorageKeys.length === 0,
      `scrollWidth=${dom.documentWidth} viewport=${dom.viewportWidth}`,
    )
  }

  await selectPath(page, 'all')
  const restored = await readPathDom(page)
  check(
    `${tag} 切回全部：覆盖状态完全清除`,
    restored.activePath === 'all' &&
      restored.topics.every((topic) => topic.pathState === null && !topic.pathEntry) &&
      restored.status.includes('当前显示全部知识'),
  )

  await page.reload({ waitUntil: 'networkidle' })
  await waitForProgressReady(page)
  await waitForPathsReady(page)
  const reloaded = await readPathDom(page)
  check(
    `${tag} 刷新不持久化 selectedPath`,
    reloaded.activePath === 'all' &&
      reloaded.checked.join('|') === 'all' &&
      reloaded.topics.every((topic) => topic.pathState === null),
  )
  check(`${tag} 无 browser error`, errors.length === 0, errors.join(' | '))
  await context.close()
}

async function runPathKeyboardAndTheme(browser, baseUrl) {
  const tag = 'path keyboard/dark 1280x800'
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  await page.goto(`${baseUrl}${route('/roadmap/')}`, { waitUntil: 'networkidle' })
  await waitForProgressReady(page)
  await waitForPathsReady(page)

  let focus = { reached: false, outlineStyle: 'none', outlineWidth: '0px' }
  for (let tab = 0; tab < 40 && !focus.reached; tab += 1) {
    await page.keyboard.press('Tab')
    focus = await page.evaluate(() => {
      const input = document.activeElement
      const label = input?.closest?.('label')
      const style = label ? getComputedStyle(label) : null
      return {
        reached: Boolean(input?.matches?.('input[data-roadmap-path-option]')),
        outlineStyle: style?.outlineStyle ?? 'none',
        outlineWidth: style?.outlineWidth ?? '0px',
      }
    })
  }
  check(`${tag} 键盘可到达 Path radio`, focus.reached)
  check(
    `${tag} 焦点在 Path option 上可见`,
    focus.outlineStyle !== 'none' && Number.parseFloat(focus.outlineWidth) >= 2,
    `${focus.outlineStyle} ${focus.outlineWidth}`,
  )

  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.roadmap-main[data-roadmap-paths]')
        ?.getAttribute('data-active-path') === 'systematic',
  )
  const arrowOne = await readPathDom(page)
  check(
    `${tag} ArrowRight 选中系统入门`,
    arrowOne.activePath === 'systematic' && arrowOne.checked.join('|') === 'systematic',
  )

  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.roadmap-main[data-roadmap-paths]')
        ?.getAttribute('data-active-path') === 'sql-etl',
  )
  const arrowTwo = await readPathDom(page)
  check(
    `${tag} ArrowRight 选中 SQL / ETL`,
    arrowTwo.activePath === 'sql-etl' && arrowTwo.checked.join('|') === 'sql-etl',
  )

  await page.keyboard.press('ArrowLeft')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.roadmap-main[data-roadmap-paths]')
        ?.getAttribute('data-active-path') === 'systematic',
  )
  check(`${tag} ArrowLeft 回到系统入门`, (await readPathDom(page)).activePath === 'systematic')

  await selectPath(page, 'sql-etl')
  const themeToggle = page.locator('button.theme-toggle')
  await themeToggle.waitFor({ state: 'visible', timeout: 10_000 })
  await themeToggle.click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.waitForTimeout(200)
  const dark = await readPathDom(page)
  const darkDimmed = dark.topics.filter((topic) => topic.pathState === 'dimmed')
  check(
    `${tag} dark：非路线 Topic 保持可读`,
    darkDimmed.length === PATH_FIXTURES['sql-etl'].dimmed &&
      darkDimmed.every((topic) => topic.display !== 'none' && (topic.contrast ?? 0) >= 4.5),
    darkDimmed.map((topic) => `${topic.id}:${topic.contrast?.toFixed(2)}`).join(' '),
  )
  check(
    `${tag} dark：Path 状态完整应用`,
    dark.topics.filter((topic) => topic.pathState === 'highlighted').length ===
      PATH_FIXTURES['sql-etl'].highlighted,
  )

  // Dark-mode representative checks at both contracted phone widths (no full matrix).
  for (const viewport of [
    { name: '390x844', width: 390, height: 844 },
    { name: '320x720', width: 320, height: 720 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await selectPath(page, 'production')
    const mobileDark = await readPathDom(page)
    const mobileDimmed = mobileDark.topics.filter((topic) => topic.pathState === 'dimmed')
    check(
      `path dark ${viewport.name}: 无横向溢出`,
      mobileDark.documentWidth <= mobileDark.viewportWidth + 1,
      `scrollWidth=${mobileDark.documentWidth} viewport=${mobileDark.viewportWidth}`,
    )
    check(
      `path dark ${viewport.name}: 非路线 Topic 保持可读`,
      mobileDimmed.length === PATH_FIXTURES.production.dimmed &&
        mobileDimmed.every((topic) => topic.display !== 'none' && (topic.contrast ?? 0) >= 4.5),
      mobileDimmed.map((topic) => `${topic.id}:${topic.contrast?.toFixed(2)}`).join(' '),
    )
  }

  check(`${tag} 无 browser error`, errors.length === 0, errors.join(' | '))
  await context.close()
}

async function runNoJsCheck(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  })
  const page = await context.newPage()
  await page.goto(`${baseUrl}${route('/roadmap/')}`, { waitUntil: 'networkidle' })

  check(
    'no-js: 8 Stage 静态可读',
    (await page.locator('.roadmap-stage[data-stage-id]').count()) === 8,
  )
  check(
    'no-js: 32 Topic 静态可读',
    (await page.locator('.roadmap-topic[data-topic-id]').count()) === 32,
  )
  check('no-js: 55 Lesson link 静态可读', (await page.locator('[data-lesson-id]').count()) === 55)
  check(
    'no-js: 没有 Progress 增强节点',
    (await page
      .locator('[data-topic-progress], [data-stage-progress], [data-roadmap-continue]')
      .count()) === 0,
  )
  check(
    'no-js: Topic 为什么学 / 学完应能 / 预计时间静态可读',
    (await page.locator('.roadmap-topic__why').count()) === 32 &&
      (await page.locator('.roadmap-topic__outcome').count()) === 32 &&
      (await page.locator('.roadmap-topic__time').count()) === 32 &&
      (await page.getByText('为什么学').first().isVisible()) &&
      (await page.getByText('学完应能').first().isVisible()) &&
      (await page
        .getByText(/^预计 \d+ 分钟/)
        .first()
        .isVisible()),
  )
  check(
    'no-js: progress 状态保持 pending',
    (await page.locator('.roadmap-main').getAttribute('data-roadmap-progress')) === 'pending',
  )
  check(
    'no-js: Path selector 4 个选项静态可读',
    (await page.locator('input[data-roadmap-path-option]').count()) === 4 &&
      (await page.locator('input[data-roadmap-path-option][value="all"]').isChecked()) &&
      (await page.getByText('学习路线').first().isVisible()),
  )
  check(
    'no-js: 没有 Path 覆盖状态与建议入口 badge',
    (await page.locator('.roadmap-topic[data-path-state]').count()) === 0 &&
      (await page.locator('[data-topic-entry]').count()) === 0 &&
      (await page.locator('.roadmap-main').getAttribute('data-roadmap-paths')) === 'pending',
  )
  check('no-js: 关系文本可见', await page.getByText('知识前置').first().isVisible())
  await context.close()
}

async function runBackJourney(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await seedProgress(
    context,
    JSON.stringify({ completedLessonIds: [], currentLessonId: 'lesson-03' }),
  )
  const page = await context.newPage()
  const errors = trackPageErrors(page)
  await page.goto(`${baseUrl}${route('/roadmap/')}`, { waitUntil: 'networkidle' })
  await waitForProgressReady(page)

  const lessonHref = await page.locator('[data-lesson-id="lesson-03"]').getAttribute('href')
  await page.locator('[data-lesson-id="lesson-03"]').click()
  await page.waitForURL((url) => url.pathname.includes('/learn/'), { timeout: 15_000 })
  await page.locator('.lesson-header h1').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('[data-progress-complete-lesson="lesson-03"]').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-progress-complete-lesson="lesson-03"]')
        ?.getAttribute('aria-pressed') === 'true',
  )

  await page.goBack()
  await waitForProgressReady(page)
  const dom = await readProgressDom(page)
  const grain = topicOf(dom, 'business-process-and-grain')
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    PROGRESS_STORAGE_KEY,
  )

  check(
    'back: 返回 Roadmap 后 Topic 更新为 学习中 · 1 / 2',
    grain.state === 'in_progress' && grain.label === '学习中 · 1 / 2',
    JSON.stringify(grain),
  )
  check('back: 当前学习位置保留', grain.current === true)
  check(
    'back: Continue Learning 仍指向 lesson-03',
    dom.continueHref === lessonHref && dom.continueHidden === false,
    `href=${dom.continueHref}`,
  )
  check(
    'back: localStorage 已写入完成状态',
    Array.isArray(stored?.completedLessonIds) && stored.completedLessonIds.includes('lesson-03'),
  )
  check('back: 无 browser error', errors.length === 0, errors.join(' | '))
  await context.close()
}

function contrastRatio(foreground, background) {
  const parse = (value) => {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value ?? '')
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
  }
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const fg = parse(foreground)
  const bg = parse(background)
  if (!fg || !bg) return null
  const [high, low] = [fg, bg].map(luminance).sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

async function readDeepLinkDom(page, topicId, otherTopicId) {
  return page.evaluate(
    ({ targetId, otherId }) => {
      const target = document.getElementById(targetId)
      const other = document.getElementById(otherId)
      if (!target || !other) return { missing: true }
      const targetStyle = getComputedStyle(target)
      const otherStyle = getComputedStyle(other)
      const rect = target.getBoundingClientRect()
      return {
        hash: window.location.hash,
        targetTop: rect.top,
        targetVisible: rect.top >= 0 && rect.top < window.innerHeight && rect.bottom > 0,
        outlineStyle: targetStyle.outlineStyle,
        outlineWidth: Number.parseFloat(targetStyle.outlineWidth),
        outlineColor: targetStyle.outlineColor,
        background: targetStyle.backgroundColor,
        otherOutlineStyle: otherStyle.outlineStyle,
        scrollTop: document.scrollingElement.scrollTop,
        targetCount: document.querySelectorAll('.roadmap-topic:target').length,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    },
    { targetId: `roadmap-topic-${topicId}`, otherId: `roadmap-topic-${otherTopicId}` },
  )
}

/** Phase 5 (#189): shared Topic URLs must land with a visible, contract-safe target state. */
async function runDeepLinkScenarios(browser, baseUrl) {
  const TOPIC_ID = 'business-process-and-grain'
  const OTHER_ID = 'warehouse-mental-model'
  const HASH = `#roadmap-topic-${TOPIC_ID}`
  const url = `${baseUrl}${route('/roadmap/')}`

  const assertTargetState = (tag, dom, errors) => {
    check(`${tag}: hash 保留`, dom.hash === HASH, String(dom.hash))
    check(
      `${tag}: 目标 Topic 在视口内`,
      dom.targetVisible === true,
      JSON.stringify({ top: dom.targetTop, scrollTop: dom.scrollTop }),
    )
    check(
      `${tag}: :target outline 唯一且可见`,
      dom.outlineStyle === 'solid' && dom.outlineWidth >= 3 && dom.targetCount === 1,
      `${dom.outlineStyle} ${dom.outlineWidth}px / count=${dom.targetCount}`,
    )
    check(
      `${tag}: 非目标 Topic 无 outline`,
      dom.otherOutlineStyle === 'none',
      String(dom.otherOutlineStyle),
    )
    const contrast = contrastRatio(dom.outlineColor, dom.background)
    check(
      `${tag}: outline 非文本对比度 ≥ 3:1`,
      (contrast ?? 0) >= 3,
      `contrast=${contrast?.toFixed(2)} outline=${dom.outlineColor} background=${dom.background}`,
    )
    check(`${tag}: 无横向溢出`, dom.overflowX <= 0, `overflowX=${dom.overflowX}`)
    check(`${tag}: 无 browser error`, errors.length === 0, errors.join(' | '))
  }

  // 1) Desktop hard load of the exact shared URL.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    const errors = trackPageErrors(page)
    await page.goto(`${url}${HASH}`, { waitUntil: 'networkidle' })
    await waitForPathsReady(page)
    assertTargetState('深链 1280', await readDeepLinkDom(page, TOPIC_ID, OTHER_ID), errors)
    await context.close()
  }

  // 2) Same-page relation link + Back / Forward clear and restore :target.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    const errors = trackPageErrors(page)
    await page.goto(url, { waitUntil: 'networkidle' })
    await waitForPathsReady(page)
    const link = page.locator('.roadmap-topic__relations a[href^="#roadmap-topic-"]').first()
    const relationHash = await link.getAttribute('href')
    await link.click()
    // base.css uses `html { scroll-behavior: smooth }`, so the fragment scroll is animated.
    await page.waitForFunction(
      (expected) => {
        if (window.location.hash !== expected) return false
        const target = document.querySelector('.roadmap-topic:target')
        if (!target) return false
        const rect = target.getBoundingClientRect()
        return rect.top >= 0 && rect.top < window.innerHeight && rect.bottom > 0
      },
      relationHash,
      { timeout: 10_000 },
    )
    const clicked = await page.evaluate(() => {
      const target = document.querySelector('.roadmap-topic:target')
      const rect = target?.getBoundingClientRect()
      return {
        count: document.querySelectorAll('.roadmap-topic:target').length,
        visible: rect ? rect.top >= 0 && rect.top < window.innerHeight : false,
        outlineStyle: target ? getComputedStyle(target).outlineStyle : 'none',
      }
    })
    check(
      '深链 同页: relation 点击后 :target 唯一且可见',
      clicked.count === 1 && clicked.visible && clicked.outlineStyle === 'solid',
      JSON.stringify(clicked),
    )
    await page.goBack()
    await page.waitForFunction(() => window.location.hash === '')
    check(
      '深链 同页: Back 后 :target 清除',
      (await page.evaluate(() => document.querySelectorAll('.roadmap-topic:target').length)) === 0,
    )
    await page.goForward()
    await page.waitForFunction((expected) => window.location.hash === expected, relationHash)
    check(
      '深链 同页: Forward 后 :target 恢复',
      (await page.evaluate(() => document.querySelectorAll('.roadmap-topic:target').length)) === 1,
    )
    check('深链 同页: 无 browser error', errors.length === 0, errors.join(' | '))
    await context.close()
  }

  // 3) Dark theme contrast for the same target state.
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: 'dark',
    })
    const page = await context.newPage()
    const errors = trackPageErrors(page)
    await page.goto(`${url}${HASH}`, { waitUntil: 'networkidle' })
    await waitForPathsReady(page)
    assertTargetState('深链 dark', await readDeepLinkDom(page, TOPIC_ID, OTHER_ID), errors)
    await context.close()
  }

  // 4) Reduced motion keeps the target state visible without adding animation.
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await page.goto(`${url}${HASH}`, { waitUntil: 'networkidle' })
    await waitForPathsReady(page)
    const dom = await readDeepLinkDom(page, TOPIC_ID, OTHER_ID)
    check(
      '深链 reduced-motion: :target outline 可见',
      dom.outlineStyle === 'solid' && dom.outlineWidth >= 3,
      `${dom.outlineStyle} ${dom.outlineWidth}px`,
    )
    await context.close()
  }

  // 5) Representative phone widths.
  for (const width of [390, 320]) {
    const height = width === 390 ? 844 : 720
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    const errors = trackPageErrors(page)
    await page.goto(`${url}${HASH}`, { waitUntil: 'networkidle' })
    await waitForPathsReady(page)
    const dom = await readDeepLinkDom(page, TOPIC_ID, OTHER_ID)
    check(
      `深链 ${width}: 目标 Topic 有 :target outline 且在视口内`,
      dom.outlineStyle === 'solid' && dom.outlineWidth >= 3 && dom.targetVisible === true,
      JSON.stringify({ top: dom.targetTop, outline: dom.outlineStyle }),
    )
    check(`深链 ${width}: 无横向溢出`, dom.overflowX <= 0, `overflowX=${dom.overflowX}`)
    check(`深链 ${width}: 无 browser error`, errors.length === 0, errors.join(' | '))
    await context.close()
  }
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

    for (const viewport of PROGRESS_VIEWPORTS) {
      await runProgressScenarios(browser, preview.baseUrl, viewport)
      await runPathScenarios(browser, preview.baseUrl, viewport)
    }

    await runPathKeyboardAndTheme(browser, preview.baseUrl)
    await runNoJsCheck(browser, preview.baseUrl)
    await runBackJourney(browser, preview.baseUrl)
    await runDeepLinkScenarios(browser, preview.baseUrl)

    const homeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const homePage = await homeContext.newPage()
    const homeErrors = trackPageErrors(homePage)
    await homePage.goto(`${preview.baseUrl}${route('/')}`, { waitUntil: 'networkidle' })
    const entry = homePage.locator(`a[href="${route('/roadmap/')}"]`).first()
    await entry.waitFor({ state: 'visible' })
    await entry.click()
    await homePage.waitForURL((url) => url.pathname.endsWith('/roadmap/'), { timeout: 15_000 })
    check('首页学习区域可以发现 Roadmap', homePage.url().includes(route('/roadmap/')))
    await waitForProgressReady(homePage)
    check(
      '首页软跳转后 Progress 增强就绪',
      (await homePage.evaluate(
        () =>
          document.querySelectorAll('[data-topic-progress]').length === 32 &&
          document.querySelector('.roadmap-main')?.getAttribute('data-roadmap-progress') ===
            'ready',
      )) === true,
    )
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
