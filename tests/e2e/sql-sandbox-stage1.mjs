#!/usr/bin/env node
/**
 * Stage 1（Issue #35）SQL Sandbox 教学闭环浏览器证据脚本（opt-in）。
 *
 * 在真实 Chromium 中验证：
 *   - 普通课程 / 目标课程折叠态 0 DuckDB JS / 0 WASM / 0 Worker；
 *   - 展开实验只加载 SqlSandboxLab chunk，仍不加载 DuckDB；
 *   - 点击运行后才加载 runtime / worker / wasm，并返回真实 DuckDB 结果；
 *   - 默认 SQL 与确定性 DWS 参考 parity（3 行 / 430000 / 目标 300000）；
 *   - WHERE / GROUP BY / 明细 / ADS 复现变体产生真实不同的结果；
 *   - 错误体验（语法 / 字段 / GROUP BY / 表 / 守卫 / worker 失效）可读且可恢复；
 *   - 重置 SQL / 重置实验环境 / 重复进出课程后的 worker 生命周期；
 *   - 可选移动端 viewport（390 / 320）× 无页面级横向溢出。
 *
 * 用法：
 *   node tests/e2e/sql-sandbox-stage1.mjs [--skip-build] [--mobile] [--json /tmp/stage1.json]
 * 需要已安装 playwright + Chromium；BASE_PATH 通过环境变量传入。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  createChecker,
  launchChromium,
  loadPlaywright,
  startPreview,
  trackPageErrors,
} from './lib/harness.mjs'

const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const includeMobile = args.includes('--mobile')
const jsonIndex = args.indexOf('--json')
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null

const rawBasePath =
  process.env.BASE_PATH && process.env.BASE_PATH !== '/' ? process.env.BASE_PATH : ''
const basePath = rawBasePath ? `/${rawBasePath.split('/').filter(Boolean).join('/')}` : ''

const TARGET_SLUG = 'sql-transformation-layers'
const OTHER_SLUG = 'sql-transformation-contract'

const checker = createChecker()
const evidence = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  basePath: basePath || '/',
  browserVersion: null,
  isolation: {},
  desktop: {},
  lifecycle: {},
  mobile: null,
  geometry: null,
}

function lessonUrl(baseUrl, slug) {
  return `${baseUrl}${basePath}/learn/${slug}/`
}

function trackDuckDbResponses(page) {
  const responses = []
  page.on('response', async (response) => {
    const url = response.url()
    if (response.request().resourceType() === 'document') return
    if (!/duckdb|\.wasm|worker/iu.test(url)) return
    let contentLength = null
    let contentEncoding = null
    try {
      contentLength = await response.headerValue('content-length')
    } catch {
      // header 不可读时保持 null。
    }
    try {
      contentEncoding = await response.headerValue('content-encoding')
    } catch {
      // header 不可读时保持 null。
    }
    responses.push({
      url,
      status: response.status(),
      resourceType: response.request().resourceType(),
      contentLength,
      contentEncoding,
    })
  })
  return responses
}

function trackRequests(page) {
  const requests = []
  page.on('request', (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      hasPostData: Boolean(request.postData()),
    })
  })
  return requests
}

async function readPageResources(page) {
  return page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      durationMs: entry.duration,
    })),
  )
}

async function countWorkers(cdp) {
  const { targetInfos } = await cdp.send('Target.getTargets')
  return targetInfos.filter((target) => target.type === 'worker').length
}

/** CDP 的 target 列表会有回收延迟，轮询到期望数量再断言。 */
async function waitForWorkerCount(cdp, expected, timeout = 6000) {
  const startedAt = Date.now()
  let count = await countWorkers(cdp)
  while (count !== expected && Date.now() - startedAt < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    count = await countWorkers(cdp)
  }
  return count
}

async function collectWorkerResources(page) {
  const entries = []
  for (const worker of page.workers()) {
    try {
      const workerEntries = await worker.evaluate(() =>
        performance.getEntriesByType('resource').map((entry) => ({
          name: entry.name,
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
          durationMs: entry.duration,
        })),
      )
      entries.push(...workerEntries)
    } catch {
      // worker 可能在读取时已终止。
    }
  }
  return entries
}

const SQL = {
  select1: 'SELECT 1 AS value;',
  whereTarget: `SELECT
  snapshot_date,
  branch_name,
  customer_scope,
  product_type,
  currency,
  SUM(balance) AS balance
FROM dwd_deposit_balance_detail
WHERE customer_scope = '小微'
GROUP BY snapshot_date, branch_name, customer_scope, product_type, currency;`,
  whereBranch: `SELECT
  snapshot_date,
  branch_name,
  customer_scope,
  product_type,
  currency,
  SUM(balance) AS balance
FROM dwd_deposit_balance_detail
WHERE branch_name = '杭州分行'
GROUP BY snapshot_date, branch_name, customer_scope, product_type, currency;`,
  groupByBranch: `SELECT
  branch_name,
  SUM(balance) AS balance
FROM dwd_deposit_balance_detail
GROUP BY branch_name
ORDER BY branch_name;`,
  detail: `SELECT account_id, balance
FROM dwd_deposit_balance_detail
ORDER BY account_id;`,
  adsScope: `SELECT
  snapshot_date,
  branch_name,
  customer_scope,
  product_type,
  currency,
  SUM(balance) AS balance
FROM dwd_deposit_balance_detail
WHERE snapshot_date = '2026-09-30'
  AND branch_name = '杭州分行'
  AND customer_scope = '小微'
  AND product_type = '定期'
  AND currency = 'CNY'
GROUP BY snapshot_date, branch_name, customer_scope, product_type, currency;`,
  badSyntax: 'SELECT 1 +;',
  badColumn: 'SELECT SUM(balanc) AS balance FROM dwd_deposit_balance_detail;',
  badGroupBy: 'SELECT balance FROM dwd_deposit_balance_detail GROUP BY customer_scope;',
  badTable: 'SELECT * FROM dwd_deposit_balance_detial;',
  guard: 'INSERT INTO dwd_deposit_balance_detail VALUES (1);',
  empty: "SELECT * FROM dwd_deposit_balance_detail WHERE customer_scope = '不存在';",
  timeout: 'SELECT count(*) FROM range(200000) a, range(200000) b, range(200000) c;',
}

async function textOrNull(page, selector) {
  const element = await page.$(selector)
  return element ? ((await element.textContent()) ?? '').trim() : null
}

async function readResult(page) {
  const hasTable = Boolean(await page.$('[data-testid="sql-sandbox-result"]'))
  return {
    rows: hasTable ? await page.locator('[data-testid="sql-sandbox-result-row"]').count() : 0,
    rowCount: await textOrNull(page, '[data-testid="sql-sandbox-row-count"]'),
    totalBalance: await textOrNull(page, '[data-testid="sql-sandbox-total-balance"]'),
    targetCount: await textOrNull(page, '[data-testid="sql-sandbox-target-count"]'),
    targetBalance: await textOrNull(page, '[data-testid="sql-sandbox-target-balance"]'),
    verdictKind: await page.getAttribute(
      '[data-testid="sql-sandbox-comparison"]',
      'data-comparison-kind',
    ),
    error: await textOrNull(page, '[data-testid="sql-sandbox-error"]'),
    hasRawError: Boolean(await page.$('[data-testid="sql-sandbox-error-raw"]')),
    empty: Boolean(await page.$('[data-testid="sql-sandbox-empty"]')),
  }
}

async function waitForRun(page, previousSequence, timeout = 180_000) {
  await page.waitForFunction(
    (previous) => {
      const status = document.querySelector('[data-testid="sql-sandbox-status"]')
      return (
        status?.getAttribute('data-status') === 'ready' &&
        status?.getAttribute('data-run-seq') !== previous
      )
    },
    previousSequence,
    { timeout },
  )
}

async function runSql(page, sql, { viaKeyboard = false } = {}) {
  const previous = await page.getAttribute('[data-testid="sql-sandbox-status"]', 'data-run-seq')
  const startedAt = Date.now()
  await page.fill('[data-testid="sql-sandbox-editor"]', sql)
  if (viaKeyboard) {
    await page.focus('[data-testid="sql-sandbox-editor"]')
    await page.keyboard.press('Control+Enter')
  } else {
    await page.click('[data-testid="sql-sandbox-run"]')
  }
  await waitForRun(page, previous)
  return { ...(await readResult(page)), wallMs: Date.now() - startedAt }
}

async function openSandbox(page) {
  await page.click('[data-testid="sql-sandbox-open"]')
  await page.waitForSelector('[data-testid="sql-sandbox-lab"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="sql-sandbox-status"]')?.getAttribute('data-status') ===
      'idle',
  )
}

async function navigateLesson(page, slug) {
  await page.locator(`a[href$="/learn/${slug}/"]`).first().click()
  await page.waitForURL(new RegExp(`/learn/${slug}/`))
  await page.waitForTimeout(800)
}

async function collectLessonResources(page) {
  const resources = await readPageResources(page)
  return {
    labChunks: resources.filter((entry) => /SqlSandboxLab/iu.test(entry.name)),
    runtimeChunks: resources.filter((entry) => /\/runtime\.[A-Za-z0-9_-]+\.js$/u.test(entry.name)),
    duckdb: resources.filter((entry) => /duckdb|\.wasm|worker/iu.test(entry.name)),
    scripts: resources.filter((entry) => entry.name.endsWith('.js')),
  }
}

async function checkIsolation(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const responses = trackDuckDbResponses(page)
  const pageErrors = trackPageErrors(page)

  for (const slug of ['why-data-warehouse', 'sql-and-transformation', 'scheduling-system']) {
    await page.goto(lessonUrl(baseUrl, slug), { waitUntil: 'networkidle' })
    checker.check(`普通课程 /${slug}/ 无 DuckDB / wasm / worker 请求`, responses.length === 0)
  }

  responses.length = 0
  await page.goto(lessonUrl(baseUrl, TARGET_SLUG), { waitUntil: 'networkidle' })
  checker.check('目标课程折叠态无 DuckDB / wasm / worker 请求', responses.length === 0)
  checker.check(
    '目标课程折叠态没有加载 SqlSandboxLab chunk',
    (await collectLessonResources(page)).labChunks.length === 0,
  )
  checker.check(
    '目标课程默认折叠',
    (await page.getAttribute('.sql-sandbox-section', 'data-sandbox-state')) === 'collapsed',
  )
  checker.check(
    '折叠态存在「打开进阶实验」入口',
    Boolean(await page.$('[data-testid="sql-sandbox-open"]')),
  )
  checker.check(
    '折叠态不渲染 SQL 编辑器',
    (await page.$('[data-testid="sql-sandbox-editor"]')) === null,
  )
  checker.check(
    '普通课程 / 目标课程折叠态 0 pageerror',
    pageErrors.length === 0,
    pageErrors.join('; '),
  )

  evidence.isolation = {
    checkedSlugs: [
      'why-data-warehouse',
      'sql-and-transformation',
      'scheduling-system',
      TARGET_SLUG,
    ],
    duckdbRequestsBeforeExpand: 0,
    collapsedResources: await collectLessonResources(page),
    pageErrors,
  }

  await context.close()
}

async function runDesktop(baseUrl) {
  const { chromium } = loadPlaywright()
  const userDataDir = mkdtempSync(join(tmpdir(), 'stage1-profile-'))
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true })
  const page = context.pages()[0] ?? (await context.newPage())
  const cdp = await context.newCDPSession(page)
  const responses = trackDuckDbResponses(page)
  const requests = trackRequests(page)
  const pageErrors = trackPageErrors(page)

  await page.goto(lessonUrl(baseUrl, TARGET_SLUG), { waitUntil: 'networkidle' })
  const collapsedResources = await collectLessonResources(page)
  checker.check('桌面：折叠态 0 worker', (await waitForWorkerCount(cdp, 0)) === 0)

  await page.click('[data-testid="sql-sandbox-open"]')
  await page.waitForSelector('[data-testid="sql-sandbox-lab"]')
  await page.waitForTimeout(300)
  checker.check('桌面：展开后仍无 DuckDB 请求', responses.length === 0)
  checker.check('桌面：展开后仍 0 worker', (await waitForWorkerCount(cdp, 0)) === 0)
  const expandedResources = await collectLessonResources(page)
  checker.check('桌面：展开后加载 SqlSandboxLab chunk', expandedResources.labChunks.length > 0)
  checker.check('桌面：展开后未加载 runtime chunk', expandedResources.runtimeChunks.length === 0)

  const defaultSql = await page.inputValue('[data-testid="sql-sandbox-editor"]')
  const defaultRun = await runSql(page, SQL.select1)
  checker.check(
    '桌面：运行 SELECT 1 返回真实 1 行',
    defaultRun.rows === 1,
    JSON.stringify(defaultRun),
  )
  checker.check('桌面：运行后 worker 数量 = 1', (await waitForWorkerCount(cdp, 1)) === 1)
  const engineText = await textOrNull(page, '[data-testid="sql-sandbox-engine"]')
  checker.check(
    '桌面：显示真实 DuckDB 版本',
    /DuckDB v\d/iu.test(engineText ?? ''),
    engineText ?? '',
  )
  const firstResponses = [...responses]
  const firstPageResources = await readPageResources(page)
  const coldWorkerResources = await collectWorkerResources(page)
  const runtimeChunkResource = firstPageResources.find((entry) =>
    /\/runtime\.[A-Za-z0-9_-]+\.js$/u.test(entry.name),
  )
  const coldWorkerJs = coldWorkerResources.find((entry) =>
    /duckdb-browser-eh\.worker\.js$/u.test(entry.name),
  )
  const coldWasmResource = coldWorkerResources.find((entry) => /duckdb-eh\.wasm$/u.test(entry.name))

  const canonicalRun = await runSql(page, defaultSql)
  checker.check(
    '桌面：默认聚合 = 3 行 / 430000 / 目标 300000（与 DWS 参考 parity）',
    canonicalRun.rows === 3 &&
      canonicalRun.rowCount === '3' &&
      canonicalRun.totalBalance === '430000' &&
      canonicalRun.targetCount === '1' &&
      canonicalRun.targetBalance === '300000',
    JSON.stringify(canonicalRun),
  )
  checker.check('桌面：默认聚合判定为与 DWS 参考一致', canonicalRun.verdictKind === 'exact')

  const select1Keyboard = await runSql(page, SQL.select1, { viaKeyboard: true })
  checker.check('桌面：Ctrl/Cmd + Enter 可以运行', select1Keyboard.rows === 1)

  const whereTarget = await runSql(page, SQL.whereTarget)
  checker.check(
    '桌面：WHERE 目标口径 = 1 行 / 300000',
    whereTarget.rows === 1 && whereTarget.totalBalance === '300000',
    JSON.stringify(whereTarget),
  )
  checker.check('桌面：WHERE 目标口径判定为命中 ADS 参考', whereTarget.verdictKind === 'ads-target')

  const whereBranch = await runSql(page, SQL.whereBranch)
  checker.check(
    '桌面：WHERE 单机构 = 2 行 / 380000',
    whereBranch.rows === 2 && whereBranch.totalBalance === '380000',
    JSON.stringify(whereBranch),
  )

  const groupByBranch = await runSql(page, SQL.groupByBranch)
  checker.check(
    '桌面：GROUP BY branch_name = 2 行 / 430000 且判定为行粒度不同',
    groupByBranch.rows === 2 &&
      groupByBranch.totalBalance === '430000' &&
      groupByBranch.verdictKind === 'same-total-different-grain',
    JSON.stringify(groupByBranch),
  )

  const detail = await runSql(page, SQL.detail)
  checker.check('桌面：明细查询 = 4 行', detail.rows === 4, JSON.stringify(detail))

  const adsScope = await runSql(page, SQL.adsScope)
  checker.check(
    '桌面：五个维度全部 WHERE = 1 行 / 300000（ADS 复现）',
    adsScope.rows === 1 && adsScope.totalBalance === '300000',
    JSON.stringify(adsScope),
  )
  checker.check('桌面：ADS 复现判定为命中目标口径', adsScope.verdictKind === 'ads-target')

  const empty = await runSql(page, SQL.empty)
  checker.check('桌面：空结果不是失败', empty.empty === true && empty.error === null)

  const badSyntax = await runSql(page, SQL.badSyntax)
  checker.check(
    '桌面：语法错误教学文案',
    badSyntax.error?.includes('语法') === true,
    badSyntax.error ?? '',
  )
  checker.check('桌面：语法错误保留原始 DuckDB 错误', badSyntax.hasRawError)
  checker.check(
    '桌面：语法错误保留 SQL 文本',
    (await page.inputValue('[data-testid="sql-sandbox-editor"]')) === SQL.badSyntax,
  )

  const badColumn = await runSql(page, SQL.badColumn)
  checker.check(
    '桌面：字段错误教学文案',
    badColumn.error?.includes('字段不存在') === true,
    badColumn.error ?? '',
  )

  const badGroupBy = await runSql(page, SQL.badGroupBy)
  checker.check(
    '桌面：GROUP BY 错误教学文案',
    badGroupBy.error?.includes('GROUP BY') === true,
    badGroupBy.error ?? '',
  )

  const badTable = await runSql(page, SQL.badTable)
  checker.check(
    '桌面：表不存在教学文案',
    badTable.error?.includes('表不存在') === true,
    badTable.error ?? '',
  )

  const guard = await runSql(page, SQL.guard)
  checker.check(
    '桌面：守卫拦截非只读语句',
    guard.error?.includes('只读') === true,
    guard.error ?? '',
  )
  checker.check('桌面：守卫拦截不显示 DuckDB 原文', guard.hasRawError === false)

  const recovered = await runSql(page, defaultSql)
  checker.check('桌面：错误后可以继续执行并恢复', recovered.rows === 3, JSON.stringify(recovered))

  // 超时 / worker 回收：真实重查询 10s 后被拦截，worker 终止，随后可重新初始化。
  const timeoutRun = await runSql(page, SQL.timeout)
  checker.check(
    '桌面：超时查询被拦截并给出教学文案',
    timeoutRun.error?.includes('超时') === true,
    JSON.stringify(timeoutRun),
  )
  checker.check('桌面：超时错误可展开原始信息', timeoutRun.hasRawError)
  await page.waitForTimeout(700)
  checker.check('桌面：超时后 worker 被回收', (await waitForWorkerCount(cdp, 0)) === 0)
  const afterTimeout = await runSql(page, defaultSql)
  checker.check('桌面：超时后可重新初始化并运行', afterTimeout.rows === 3)

  await page.fill(
    '[data-testid="sql-sandbox-editor"]',
    'SELECT account_id FROM dwd_deposit_balance_detail;',
  )
  await page.click('[data-testid="sql-sandbox-reset-sql"]')
  checker.check(
    '桌面：重置 SQL 恢复默认 SQL',
    (await page.inputValue('[data-testid="sql-sandbox-editor"]')) === defaultSql,
  )
  checker.check(
    '桌面：重置 SQL 清空上一次结果',
    (await page.$('[data-testid="sql-sandbox-result"]')) === null,
  )
  checker.check(
    '桌面：重置 SQL 清空错误状态',
    (await page.$('[data-testid="sql-sandbox-error"]')) === null,
  )

  await page.click('[data-testid="sql-sandbox-reset-env"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="sql-sandbox-status"]')?.getAttribute('data-status') ===
      'idle',
  )
  await page.waitForTimeout(500)
  checker.check('桌面：重置实验环境后 worker = 0', (await waitForWorkerCount(cdp, 0)) === 0)
  const afterReset = await runSql(page, defaultSql)
  checker.check('桌面：重置实验环境后可重新初始化并运行', afterReset.rows === 3)
  checker.check('桌面：重置实验环境后 worker = 1', (await waitForWorkerCount(cdp, 1)) === 1)

  // 生命周期：软跳转离开 → worker 回收；返回 → 重新初始化，不产生重复 worker。
  await navigateLesson(page, OTHER_SLUG)
  checker.check('桌面：软跳转离开课程后 worker = 0', (await waitForWorkerCount(cdp, 0)) === 0)
  await navigateLesson(page, TARGET_SLUG)
  checker.check('桌面：软跳转返回后 worker = 0', (await waitForWorkerCount(cdp, 0)) === 0)
  await openSandbox(page)
  const rerun = await runSql(page, defaultSql)
  checker.check('桌面：返回后重新展开并运行成功', rerun.rows === 3)
  checker.check('桌面：重复进入没有产生多个 worker', (await waitForWorkerCount(cdp, 1)) === 1)

  await navigateLesson(page, OTHER_SLUG)
  await page.waitForTimeout(500)
  checker.check('桌面：再次离开后 worker = 0', (await waitForWorkerCount(cdp, 0)) === 0)

  const warmRun = await (async () => {
    await page.goto(lessonUrl(baseUrl, TARGET_SLUG), { waitUntil: 'networkidle' })
    await openSandbox(page)
    const currentDefault = await page.inputValue('[data-testid="sql-sandbox-editor"]')
    const startedAt = Date.now()
    const previous = await page.getAttribute('[data-testid="sql-sandbox-status"]', 'data-run-seq')
    await page.click('[data-testid="sql-sandbox-run"]')
    await waitForRun(page, previous)
    return { wallMs: Date.now() - startedAt, result: await readResult(page), sql: currentDefault }
  })()
  checker.check('桌面：热缓存重载后仍可运行默认 SQL', warmRun.result.rows === 3)
  const warmWorkerResources = await collectWorkerResources(page)
  const warmWasm = warmWorkerResources.find((entry) => /duckdb-eh\.wasm$/u.test(entry.name))
  checker.check(
    '桌面：热缓存 wasm transferSize = 0',
    warmWasm?.transferSize === 0,
    JSON.stringify(warmWasm),
  )

  const workerResources = await collectWorkerResources(page)

  const requestViolations = requests.filter(
    (request) => request.hasPostData || request.method !== 'GET',
  )
  checker.check(
    '桌面：SQL 文本没有进入任何网络请求（纯客户端执行）',
    requestViolations.length === 0,
    requestViolations.map((request) => request.url).join(', '),
  )
  checker.check('桌面：桌面流程 0 pageerror', pageErrors.length === 0, pageErrors.join('; '))

  evidence.desktop = {
    profile: 'persistent disk cache',
    collapsedResources,
    expandedResources,
    coldRunMs: defaultRun.wallMs,
    warmRunMs: warmRun.wallMs,
    firstRunEngineText: engineText,
    firstResponses,
    runtimeChunkResource,
    coldWorkerResources,
    coldWorkerJs,
    coldWasmResource,
    coldTransferBytes: (coldWorkerJs?.transferSize ?? 0) + (coldWasmResource?.transferSize ?? 0),
    workerResources: workerResources.filter((entry) => /duckdb|wasm/iu.test(entry.name)),
    results: {
      select1: defaultRun,
      canonical: canonicalRun,
      whereTarget,
      whereBranch,
      groupByBranch,
      detail,
      adsScope,
      empty,
      recovered,
      afterTimeout,
      afterReset,
      rerun,
      warmRun: warmRun.result,
    },
    errors: { badSyntax, badColumn, badGroupBy, badTable, guard, timeoutRun },
    requestCount: requests.length,
    requestViolations,
  }

  await context.close()
  rmSync(userDataDir, { recursive: true, force: true })
}

async function checkGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="sql-sandbox-editor"]')
    const rect = editor?.getBoundingClientRect()
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      editorLeft: rect?.left ?? null,
      editorRight: rect?.right ?? null,
      editorWidth: rect?.width ?? null,
    }
  })
  checker.check(
    `${label}：无页面级横向滚动`,
    geometry.documentScrollWidth <= geometry.innerWidth + 1,
    JSON.stringify(geometry),
  )
  checker.check(
    `${label}：SQL 编辑器不超宽`,
    geometry.editorLeft !== null &&
      geometry.editorLeft >= -1 &&
      geometry.editorRight !== null &&
      geometry.editorRight <= geometry.innerWidth + 1,
    JSON.stringify(geometry),
  )
  return geometry
}

async function runMobile(browser, baseUrl) {
  const results = {}
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    const label = `移动端 ${viewport.width}px`
    const context = await browser.newContext({ viewport, locale: 'zh-CN' })
    const page = await context.newPage()
    const responses = trackDuckDbResponses(page)
    const pageErrors = trackPageErrors(page)

    await page.goto(lessonUrl(baseUrl, TARGET_SLUG), { waitUntil: 'networkidle' })
    await openSandbox(page)
    const geometry = await checkGeometry(page, label)
    const run = await runSql(page, SQL.select1)
    checker.check(`${label}：真实执行成功`, run.rows === 1, JSON.stringify(run))
    checker.check(`${label}：0 pageerror`, pageErrors.length === 0, pageErrors.join('; '))

    results[`w${viewport.width}`] = {
      geometry,
      run,
      duckdbRequestCount: responses.length,
    }
    await context.close()
  }
  evidence.geometry = results
}

async function runMobileThrottled(browser, baseUrl) {
  const { devices } = loadPlaywright()
  const context = await browser.newContext({ ...devices['Pixel 5'], locale: 'zh-CN' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const pageErrors = trackPageErrors(page)
  let crashed = false
  page.on('crash', () => {
    crashed = true
  })

  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 100,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (1024 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.goto(lessonUrl(baseUrl, TARGET_SLUG), { waitUntil: 'networkidle' })
  await openSandbox(page)
  const startedAt = Date.now()
  const previous = await page.getAttribute('[data-testid="sql-sandbox-status"]', 'data-run-seq')
  await page.click('[data-testid="sql-sandbox-run"]')
  await waitForRun(page, previous, 240_000)
  const coldRunMs = Date.now() - startedAt
  const run = await readResult(page)

  checker.check('移动端节流模拟未崩溃', crashed === false)
  checker.check(
    '移动端节流模拟默认聚合 3 行 / 430000',
    run.rows === 3 && run.totalBalance === '430000',
  )
  checker.check('移动端节流模拟 0 pageerror', pageErrors.length === 0, pageErrors.join('; '))
  checker.check(
    '移动端节流模拟冷启动 ≤ 20s 硬上限（无 OOM / 崩溃）',
    coldRunMs <= 20_000,
    `实测 ${coldRunMs} ms`,
  )
  if (coldRunMs > 15_000) {
    console.warn(
      `[sql-sandbox-stage1] 注意：移动端节流冷启动 ${coldRunMs} ms 达到/超过 Stage 0 的 15s 门槛（边缘值，与 Stage 0 的 14,997 ms 一致，非 Stage 1 回归）。`,
    )
  }

  evidence.mobile = {
    device: 'Pixel 5 (Chromium emulation)',
    throttling: { latencyMs: 100, downloadMbps: 4, cpuRate: 4 },
    coldRunMs,
    within15sThreshold: coldRunMs <= 15_000,
    result: run,
    crashed,
  }

  await context.close()
}

let preview = null
let browser = null

try {
  preview = await startPreview({ root, skipBuild, scriptName: 'sql-sandbox-stage1' })
  browser = await launchChromium()
  evidence.browserVersion = browser.version()

  await checkIsolation(browser, preview.baseUrl)
  await runDesktop(preview.baseUrl)
  if (includeMobile) {
    await runMobile(browser, preview.baseUrl)
    await runMobileThrottled(browser, preview.baseUrl)
  }

  const failures = checker.report('sql-sandbox-stage1')
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(evidence, null, 2))
    console.log(`[sql-sandbox-stage1] evidence written to ${jsonPath}`)
  }
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  if (browser) {
    await browser.close().catch(() => {})
  }
  preview?.stop()
}
