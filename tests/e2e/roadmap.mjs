#!/usr/bin/env node
/** Focused browser contract for the static Learning Roadmap route. */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'roadmap'
const PROGRESS_STORAGE_KEY = 'data-warehouse-visualized:progress'
/** Sum of `Lesson.estimatedMinutes` over all 54 available lessons; locks derived Topic time. */
const TOTAL_ESTIMATED_MINUTES = 665
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
    `${tag} 预计时间由 54 节 Lesson metadata 派生（合计 ${TOTAL_ESTIMATED_MINUTES} 分钟）`,
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

  // All 54 available Lessons completed.
  {
    const { context, page, errors } = await openRoadmapContext(browser, baseUrl, viewport)
    const allLessonIds = await page.evaluate(() => [
      ...new Set(
        Array.from(document.querySelectorAll('[data-lesson-id]')).map(
          (link) => link.getAttribute('data-lesson-id') ?? '',
        ),
      ),
    ])
    check(`${tag} all: 收集到 54 个唯一 Lesson identity`, allLessonIds.length === 54)
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
      `${tag} all: Stage 分母无重复且合计 54`,
      stageTotalSum === 54 && stageCompletedSum === 54,
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
  check('no-js: 54 Lesson link 静态可读', (await page.locator('[data-lesson-id]').count()) === 54)
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
    }

    await runNoJsCheck(browser, preview.baseUrl)
    await runBackJourney(browser, preview.baseUrl)

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
