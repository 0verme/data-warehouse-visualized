#!/usr/bin/env node
/**
 * Stage 0（Issue #35）浏览器证据脚本（opt-in）。
 *
 * 在真实 Chromium 中验证：
 *   - 普通 /learn/* 页面 0 DuckDB JS / 0 WASM / 0 Worker；
 *   - harness 点击前 0 DuckDB 请求，点击后才动态加载 runtime / worker / wasm；
 *   - SELECT 1 与 Banking seed 上的 SELECT / WHERE / GROUP BY / SUM；
 *   - CDN 与 self-host 两种托管策略的真实 transfer size；
 *   - create → query → terminate → recreate 与 ClientRouter 软跳转后的 worker 数量；
 *   - 可选移动端 viewport + 网络 / CPU 节流（Chromium 模拟，非真机）。
 *
 * 用法：
 *   node tests/e2e/sql-sandbox-stage0.mjs [--skip-build] [--mobile] [--strategy=both|cdn|selfhost]
 *                                          [--json /tmp/stage0-evidence.json]
 * 需要已安装 playwright + Chromium；BASE_PATH 通过环境变量传入。
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
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
const strategyArg = args.find((arg) => arg.startsWith('--strategy='))?.split('=')[1] ?? 'both'

const duckdbDist = resolve(root, 'node_modules/@duckdb/duckdb-wasm/dist')
const selfHostDirName = 'duckdb-stage0'
const selfHostTarget = resolve(root, 'dist/_astro', selfHostDirName)

const rawBasePath =
  process.env.BASE_PATH && process.env.BASE_PATH !== '/' ? process.env.BASE_PATH : ''
const basePath = rawBasePath ? `/${rawBasePath.split('/').filter(Boolean).join('/')}` : ''
const selfHostAssetBase = `${basePath}/_astro/${selfHostDirName}/`

const checker = createChecker()
const evidence = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  basePath: basePath || '/',
  browserVersion: null,
  isolation: {},
  cdn: {},
  selfHost: {},
  mobile: null,
}

function harnessUrl(baseUrl, params = '') {
  return `${baseUrl}${basePath}/dev/sql-sandbox-poc/${params}`
}

function learnUrl(baseUrl, slug) {
  return `${baseUrl}${basePath}/learn/${slug}/`
}

function trackDuckDbResponses(page) {
  const responses = []
  page.on('response', async (response) => {
    const url = response.url()
    const resourceType = response.request().resourceType()
    if (resourceType === 'document') return
    if (!/duckdb|\.wasm|worker/iu.test(url)) return

    const rawLength = await readHeader(response, 'content-length')
    const contentLength = rawLength === null ? null : Number(rawLength)
    const contentEncoding = await readHeader(response, 'content-encoding')

    responses.push({
      url,
      status: response.status(),
      contentLength,
      contentEncoding,
      resourceType,
    })
  })
  return responses
}

async function readHeader(response, name) {
  try {
    return await response.headerValue(name)
  } catch {
    return null
  }
}

async function countWorkers(cdp) {
  const { targetInfos } = await cdp.send('Target.getTargets')
  return targetInfos.filter((target) => target.type === 'worker').length
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

async function readHarnessMetrics(page) {
  const text = await page.textContent('[data-testid="stage0-metrics"]')
  return JSON.parse(text)
}

async function startAndWait(page, timeout = 180_000) {
  const startedAt = Date.now()
  await page.click('[data-testid="stage0-start"]')
  await page.waitForSelector('[data-testid="stage0-status"][data-status="ready"]', { timeout })
  return Date.now() - startedAt
}

async function runCannedAndRead(page, testId) {
  const previousSequence = await page.getAttribute('[data-testid="stage0-status"]', 'data-run-seq')
  await page.click(`[data-testid="${testId}"]`)
  await page.waitForFunction((previous) => {
    const statusElement = document.querySelector('[data-testid="stage0-status"]')
    return (
      statusElement?.getAttribute('data-status') === 'ready' &&
      statusElement?.getAttribute('data-run-seq') !== previous
    )
  }, previousSequence)
  return {
    rows: await page.locator('[data-testid="stage0-result-row"]').count(),
    rowCount: await page.textContent('[data-testid="stage0-row-count"]'),
    totalBalance: await page.textContent('[data-testid="stage0-total-balance"]'),
    targetCount: await page.textContent('[data-testid="stage0-target-count"]'),
    targetBalance: await page.textContent('[data-testid="stage0-target-balance"]'),
    error: (await page.$('[data-testid="stage0-error"]'))
      ? await page.textContent('[data-testid="stage0-error"]')
      : null,
  }
}

async function assertNoDuckDbRequests(responses, label) {
  checker.check(
    `${label} 无 DuckDB / wasm / worker 请求`,
    responses.length === 0,
    responses.map((entry) => entry.url).join(', '),
  )
}

async function checkIsolation(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const responses = trackDuckDbResponses(page)
  const pageErrors = trackPageErrors(page)

  for (const slug of ['why-data-warehouse', 'sql-and-transformation-layers', 'scheduling-system']) {
    await page.goto(learnUrl(baseUrl, slug), { waitUntil: 'networkidle' })
    await assertNoDuckDbRequests(responses, `普通课程 /${slug}/`)
  }

  const crossOriginIsolated = await page.evaluate(() => window.crossOriginIsolated)
  checker.check('普通课程未要求 crossOriginIsolated', crossOriginIsolated === false)

  await page.goto(harnessUrl(baseUrl), { waitUntil: 'networkidle' })
  await assertNoDuckDbRequests(responses, 'harness 点击前')
  checker.check(
    '普通课程 / harness 点击前 0 pageerror',
    pageErrors.length === 0,
    pageErrors.join('; '),
  )

  evidence.isolation = {
    checkedSlugs: ['why-data-warehouse', 'sql-and-transformation-layers', 'scheduling-system'],
    duckdbResponses: responses.map((entry) => entry.url),
    crossOriginIsolated,
  }

  await context.close()
}

async function runCdnDesktop(baseUrl) {
  const { chromium } = loadPlaywright()
  const userDataDir = mkdtempSync(join(tmpdir(), 'stage0-profile-'))
  // 持久 profile 使用真实磁盘缓存；Playwright 默认 context 是内存缓存，
  // 6.7 MB 的 wasm 会被反复下载，不能用来判断 warm cache。
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true })
  const page = context.pages()[0] ?? (await context.newPage())
  const cdp = await context.newCDPSession(page)
  const responses = trackDuckDbResponses(page)
  const pageErrors = trackPageErrors(page)

  const documentResponse = await page.goto(harnessUrl(baseUrl), { waitUntil: 'networkidle' })
  const documentHeaders = documentResponse.headers()
  checker.check('页面未设置 CSP 响应头', documentHeaders['content-security-policy'] === undefined)
  checker.check(
    '页面未设置 COOP 响应头',
    documentHeaders['cross-origin-opener-policy'] === undefined,
  )
  checker.check(
    '页面未设置 COEP 响应头',
    documentHeaders['cross-origin-embedder-policy'] === undefined,
  )

  const coldWallMs = await startAndWait(page)
  const coldMetrics = await readHarnessMetrics(page)
  const coldWorkerCount = await countWorkers(cdp)
  const pageResources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      durationMs: entry.duration,
    })),
  )
  const runtimeChunkResource = pageResources.find((entry) =>
    /\/runtime\.[A-Za-z0-9_-]+\.js$/u.test(entry.name),
  )
  checker.check(
    'dynamic import runtime chunk 存在',
    Boolean(runtimeChunkResource),
    JSON.stringify(pageResources.map((entry) => entry.name)),
  )
  if (runtimeChunkResource && basePath) {
    checker.check(
      `dynamic import runtime chunk 走 BASE_PATH (${basePath})`,
      new URL(runtimeChunkResource.name).pathname.startsWith(`${basePath}/_astro/`),
      runtimeChunkResource.name,
    )
  }
  const workerResources = await collectWorkerResources(page)

  checker.check('CDN 冷启动 worker 数量 = 1', coldWorkerCount === 1, String(coldWorkerCount))
  checker.check('CDN 冷启动 runtime 来自 CDN', coldMetrics.engine?.strategy === 'cdn')
  checker.check('CDN 冷启动 engine 版本可读', /^v/iu.test(coldMetrics.engine?.engineVersion ?? ''))
  checker.check(
    'CDN 冷启动 worker 有真实 transfer',
    workerResources.some((entry) => /duckdb-eh\.wasm$/u.test(entry.name) && entry.transferSize > 0),
  )

  const select1 = await runCannedAndRead(page, 'stage0-run-select1')
  checker.check('SELECT 1 返回 1 行', select1.rows === 1, JSON.stringify(select1))

  const defaultAggregate = await runCannedAndRead(page, 'stage0-run-default')
  checker.check('默认聚合 3 行', defaultAggregate.rows === 3, JSON.stringify(defaultAggregate))
  checker.check('默认聚合合计 430000', defaultAggregate.totalBalance === '430000')
  checker.check('默认聚合目标口径 1 行', defaultAggregate.targetCount === '1')
  checker.check('默认聚合目标余额 300000', defaultAggregate.targetBalance === '300000')

  const whereTarget = await runCannedAndRead(page, 'stage0-run-where')
  checker.check(
    'WHERE 目标口径 1 行 / 300000',
    whereTarget.rows === 1 && whereTarget.totalBalance === '300000',
  )

  const groupByBranch = await runCannedAndRead(page, 'stage0-run-groupby')
  checker.check(
    'GROUP BY 机构 2 行 / 430000',
    groupByBranch.rows === 2 && groupByBranch.totalBalance === '430000',
  )

  const detail = await runCannedAndRead(page, 'stage0-run-detail')
  checker.check('账户明细 4 行', detail.rows === 4)
  const queryMetrics = (await readHarnessMetrics(page)).metrics.filter((metric) =>
    metric.label.includes('查询'),
  )

  const badColumn = await runCannedAndRead(page, 'stage0-run-bad-column')
  checker.check('字段错误有可读文案', (badColumn.error ?? '').includes('balanc'))
  const badSyntax = await runCannedAndRead(page, 'stage0-run-bad-syntax')
  checker.check('语法错误有可读文案', (badSyntax.error ?? '').includes('Parser Error'))
  const externalProbe = await runCannedAndRead(page, 'stage0-run-external')
  checker.check(
    '外部访问被配置禁用',
    /disabled by configuration|Permission Error/iu.test(externalProbe.error ?? ''),
    externalProbe.error ?? '',
  )

  await page.fill(
    '[data-testid="stage0-sql"]',
    'INSERT INTO dwd_deposit_balance_detail VALUES (1);',
  )
  const guardSequence = await page.getAttribute('[data-testid="stage0-status"]', 'data-run-seq')
  await page.click('[data-testid="stage0-run-sql"]')
  await page.waitForFunction(
    (previous) =>
      document.querySelector('[data-testid="stage0-status"]')?.getAttribute('data-run-seq') !==
      previous,
    guardSequence,
  )
  const guardError = await page.textContent('[data-testid="stage0-error"]')
  checker.check(
    '守卫拦截非只读语句',
    (guardError ?? '').includes('只读') || (guardError ?? '').includes('只允许'),
  )

  const recovered = await runCannedAndRead(page, 'stage0-run-default')
  checker.check('错误后仍可继续执行', recovered.rows === 3)

  await page.click('[data-testid="stage0-terminate"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="stage0-status"]')?.getAttribute('data-status') ===
      'idle',
  )
  checker.check('terminate 后 worker 数量 = 0', (await countWorkers(cdp)) === 0)

  const recreateWallMs = await startAndWait(page)
  checker.check('重建后 worker 数量 = 1', (await countWorkers(cdp)) === 1)
  const recreated = await runCannedAndRead(page, 'stage0-run-select1')
  checker.check('重建后可执行查询', recreated.rows === 1)

  await page.reload({ waitUntil: 'networkidle' })
  const warmReloadWallMs = await startAndWait(page)
  const warmMetrics = await readHarnessMetrics(page)
  const warmPageResources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      durationMs: entry.duration,
    })),
  )
  const warmWorkerResources = await collectWorkerResources(page)
  const warmWasmResource = warmWorkerResources.find((entry) => /duckdb-eh\.wasm$/u.test(entry.name))
  const warmWorkerJsResource = warmPageResources.find((entry) =>
    /duckdb-browser-eh\.worker\.js$/u.test(entry.name),
  )
  checker.check(
    '热加载 wasm 命中真实浏览器缓存（transferSize = 0）',
    warmWasmResource?.transferSize === 0,
    JSON.stringify(warmWasmResource),
  )
  checker.check(
    '热加载 worker JS 命中浏览器缓存（transferSize = 0）',
    warmWorkerJsResource?.transferSize === 0,
    JSON.stringify(warmWorkerJsResource),
  )
  checker.check(
    '热加载后可执行查询',
    (await runCannedAndRead(page, 'stage0-run-default')).rows === 3,
  )

  await page.click('[data-testid="stage0-nav-learn"]')
  await page.waitForURL(/learn\/why-data-warehouse/u)
  await page.waitForTimeout(1000)
  checker.check('ClientRouter 软跳转后 worker 数量 = 0', (await countWorkers(cdp)) === 0)

  await page.goBack()
  await page.waitForURL(/dev\/sql-sandbox-poc/u)
  await page.waitForTimeout(1000)
  checker.check('返回 harness 后 worker 数量 = 0', (await countWorkers(cdp)) === 0)
  const restartWallMs = await startAndWait(page)
  checker.check('再次进入可重新启动 worker = 1', (await countWorkers(cdp)) === 1)
  await page.click('[data-testid="stage0-terminate"]')
  await page.waitForTimeout(500)
  checker.check('最终 worker 数量 = 0', (await countWorkers(cdp)) === 0)

  checker.check('CDN 流程 0 pageerror', pageErrors.length === 0, pageErrors.join('; '))

  evidence.cdn = {
    documentHeaders: {
      csp: documentHeaders['content-security-policy'] ?? null,
      coop: documentHeaders['cross-origin-opener-policy'] ?? null,
      coep: documentHeaders['cross-origin-embedder-policy'] ?? null,
    },
    profile: 'persistent disk cache',
    coldWallMs,
    recreateWallMs,
    warmReloadWallMs,
    restartWallMs,
    coldMetrics: coldMetrics.metrics,
    warmMetrics: warmMetrics.metrics,
    queryMetrics,
    engine: coldMetrics.engine,
    runtimeChunkResource,
    requests: responses,
    pageResources: pageResources.filter((entry) => /duckdb|wasm|worker/iu.test(entry.name)),
    workerResources,
    warmPageResources: warmPageResources.filter((entry) => /duckdb|wasm|worker/iu.test(entry.name)),
    warmWorkerResources,
    results: { select1, defaultAggregate, whereTarget, groupByBranch, detail },
  }

  await context.close()
  rmSync(userDataDir, { recursive: true, force: true })
}

async function runSelfHostDesktop(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const responses = trackDuckDbResponses(page)
  const pageErrors = trackPageErrors(page)

  const params = `?strategy=selfhost&assetBase=${encodeURIComponent(selfHostAssetBase)}`
  await page.goto(harnessUrl(baseUrl, params), { waitUntil: 'networkidle' })
  checker.check('self-host 点击前无 DuckDB 请求', responses.length === 0, JSON.stringify(responses))

  const wallMs = await startAndWait(page)
  const metrics = await readHarnessMetrics(page)
  checker.check('self-host 启动 worker 数量 = 1', (await countWorkers(cdp)) === 1)
  checker.check('self-host strategy 生效', metrics.engine?.strategy === 'self-host')

  const result = await runCannedAndRead(page, 'stage0-run-default')
  checker.check(
    'self-host 默认聚合 3 行 / 430000',
    result.rows === 3 && result.totalBalance === '430000',
  )

  await page.click('[data-testid="stage0-terminate"]')
  await page.waitForTimeout(500)
  checker.check('self-host terminate 后 worker = 0', (await countWorkers(cdp)) === 0)
  checker.check('self-host 流程 0 pageerror', pageErrors.length === 0, pageErrors.join('; '))

  evidence.selfHost = {
    assetBase: selfHostAssetBase,
    wallMs,
    metrics: metrics.metrics,
    engine: metrics.engine,
    requests: responses,
  }

  await context.close()
}

async function runMobile(browser, baseUrl) {
  const { devices } = loadPlaywright()
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    locale: 'zh-CN',
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const responses = trackDuckDbResponses(page)
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

  await page.goto(harnessUrl(baseUrl), { waitUntil: 'networkidle' })
  const wallMs = await startAndWait(page, 240_000)
  const metrics = await readHarnessMetrics(page)
  const result = await runCannedAndRead(page, 'stage0-run-default')

  checker.check('移动端模拟未崩溃', crashed === false)
  checker.check(
    '移动端默认聚合 3 行 / 430000',
    result.rows === 3 && result.totalBalance === '430000',
  )
  checker.check('移动端 0 pageerror', pageErrors.length === 0, pageErrors.join('; '))

  await page.click('[data-testid="stage0-terminate"]')
  await page.waitForTimeout(500)
  checker.check('移动端 terminate 后 worker = 0', (await countWorkers(cdp)) === 0)

  evidence.mobile = {
    device: 'Pixel 5 (Chromium emulation)',
    throttling: { latencyMs: 100, downloadMbps: 4, cpuRate: 4 },
    wallMs,
    metrics: metrics.metrics,
    engine: metrics.engine,
    requests: responses,
    crashed,
  }

  await context.close()
}

function copySelfHostAssets() {
  mkdirSync(selfHostTarget, { recursive: true })
  for (const file of ['duckdb-eh.wasm', 'duckdb-browser-eh.worker.js']) {
    const source = resolve(duckdbDist, file)
    const target = resolve(selfHostTarget, file)
    cpSync(source, target)
    evidence.selfHost[`${file}Bytes`] = statSync(target).size
  }
}

function readBundleSizes() {
  const bundleSizes = {}
  for (const file of ['duckdb-eh.wasm', 'duckdb-browser-eh.worker.js', 'duckdb-browser.mjs']) {
    bundleSizes[file] = statSync(resolve(duckdbDist, file)).size
  }
  return bundleSizes
}

let preview = null
let browser = null

try {
  preview = await startPreview({ root, skipBuild, scriptName: 'sql-sandbox-stage0' })
  copySelfHostAssets()
  evidence.bundleSizes = readBundleSizes()

  browser = await launchChromium()
  evidence.browserVersion = browser.version()

  await checkIsolation(browser, preview.baseUrl)
  if (strategyArg === 'both' || strategyArg === 'cdn') {
    await runCdnDesktop(preview.baseUrl)
  }
  if (strategyArg === 'both' || strategyArg === 'selfhost') {
    await runSelfHostDesktop(browser, preview.baseUrl)
  }
  if (includeMobile) {
    await runMobile(browser, preview.baseUrl)
  }
} catch (error) {
  checker.check(
    'Stage 0 e2e 未抛出异常',
    false,
    error instanceof Error ? error.message : String(error),
  )
  console.error(error)
} finally {
  if (browser) {
    await browser.close()
  }
  if (preview) {
    preview.stop()
  }
  if (existsSync(selfHostTarget)) {
    rmSync(selfHostTarget, { recursive: true, force: true })
  }
}

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(evidence, null, 2))
  console.log(`[sql-sandbox-stage0] evidence written to ${jsonPath}`)
}

console.log(JSON.stringify(evidence, null, 2))
process.exit(checker.report('sql-sandbox-stage0') === 0 ? 0 : 1)
