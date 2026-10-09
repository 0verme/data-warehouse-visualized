#!/usr/bin/env node
/** Local Workers Assets contract for the static custom 404 page. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WRANGLER = process.env.WRANGLER_BIN || join(ROOT, 'node_modules/wrangler/bin/wrangler.js')
const UNKNOWN_PATH = '/__smart-404-verification-path__'
const XSS_PATH = `/__smart-404-${encodeURIComponent('<img src=x onerror=window.__smart404Injected=1>')}`

if (!existsSync(resolve(ROOT, 'dist/404.html'))) {
  throw new Error('Missing dist/404.html. Run npm run build before this test.')
}
if (!existsSync(WRANGLER)) {
  throw new Error(`Missing Wrangler CLI: ${WRANGLER}`)
}

async function getAvailablePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()))
  })
  return address.port
}

async function startWrangler(port, persistenceDir) {
  const server = spawn(
    process.execPath,
    [
      WRANGLER,
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      persistenceDir,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let output = ''
  let ready = false
  const readyPromise = new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => {
      server.kill('SIGTERM')
      reject(new Error(`Wrangler did not become ready in 45s. Output:\n${output}`))
    }, 45_000)

    const onData = (chunk) => {
      output += chunk.toString()
      if (!ready && output.includes('Ready on')) {
        ready = true
        clearTimeout(timeout)
        resolveReady()
      }
    }

    server.stdout.on('data', onData)
    server.stderr.on('data', onData)
    server.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    server.once('exit', (code, signal) => {
      if (!ready) {
        clearTimeout(timeout)
        reject(
          new Error(
            `Wrangler exited before becoming ready (code=${code}, signal=${signal}). Output:\n${output}`,
          ),
        )
      }
    })
  })

  await readyPromise
  return { server, getOutput: () => output }
}

async function stopWrangler(server) {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3000)),
  ])
  if (server.exitCode === null) server.kill('SIGKILL')
}

const port = await getAvailablePort()
const origin = `http://127.0.0.1:${port}`
const persistenceDir = await mkdtemp(join(tmpdir(), 'smart-404-wrangler-'))
let server
let browser

try {
  const started = await startWrangler(port, persistenceDir)
  server = started.server

  const notFoundResponse = await fetch(`${origin}${UNKNOWN_PATH}`, { redirect: 'manual' })
  const notFoundHtml = await notFoundResponse.text()
  assert.equal(notFoundResponse.status, 404, 'Unknown paths must retain the HTTP 404 status')
  assert.equal(notFoundResponse.redirected, false, 'Unknown paths must not redirect')
  assert.equal(
    notFoundResponse.headers.get('location'),
    null,
    'Unknown paths must not emit Location',
  )
  assert.match(notFoundResponse.headers.get('content-type') || '', /text\/html/i)
  assert.ok(notFoundHtml.includes('页面未找到'), 'Workers must serve the custom 404 body')
  assert.ok(notFoundHtml.includes('This page isn’t here.'), '404 body must include English copy')
  assert.equal(notFoundHtml.includes(UNKNOWN_PATH), false, 'The requested path must not be echoed')

  const xssResponse = await fetch(`${origin}${XSS_PATH}`, { redirect: 'manual' })
  const xssHtml = await xssResponse.text()
  assert.equal(xssResponse.status, 404, 'An encoded HTML path must remain a 404')
  assert.equal(xssResponse.headers.get('location'), null, 'Encoded paths must not redirect')
  assert.equal(
    xssHtml.includes('window.__smart404Injected'),
    false,
    'Request paths must not be injected',
  )
  assert.equal(xssHtml, notFoundHtml, 'All unknown paths must receive the same static document')

  const normalRoutes = ['/', '/learn/', '/en/']
  const normalResponses = new Map()
  for (const route of normalRoutes) {
    const response = await fetch(`${origin}${route}`, { redirect: 'manual' })
    const html = await response.text()
    assert.equal(response.status, 200, `${route} must remain available`)
    assert.equal(response.headers.get('location'), null, `${route} must not redirect`)
    assert.ok(
      html.includes(`href="https://sql.sb${route}"`),
      `${route} canonical must remain intact`,
    )
    normalResponses.set(route, response)
  }

  const stylesheetPath = notFoundHtml.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1]
  assert.ok(stylesheetPath, '404 document must load its page stylesheet')
  const stylesheetResponse = await fetch(new URL(stylesheetPath, `${origin}/`))
  assert.equal(stylesheetResponse.status, 200, 'The 404 page stylesheet must be a normal asset')
  const stylesheetCacheControl = stylesheetResponse.headers.get('cache-control')
  const htmlCacheControl = notFoundResponse.headers.get('cache-control')
  assert.ok(
    stylesheetCacheControl,
    'The stylesheet must retain an explicit static-asset cache policy',
  )
  assert.ok(htmlCacheControl, 'The fallback HTML must retain an explicit cache policy')
  assert.equal(
    htmlCacheControl,
    normalResponses.get('/')?.headers.get('cache-control'),
    'The custom fallback must retain the normal HTML asset cache policy',
  )

  console.log(
    `[smart-404-workers] HTTP PASS · status=404 · content-type=${notFoundResponse.headers.get('content-type')} · location=none`,
  )
  console.log(
    `[smart-404-workers] CACHE PASS · html=${htmlCacheControl} · css=${stylesheetCacheControl}`,
  )
  console.log(
    `[smart-404-workers] ROUTES PASS · ${normalRoutes.map((route) => `${route}=200`).join(' · ')}`,
  )

  browser = await chromium.launch({ headless: true })
  const viewportCases = [
    { name: 'desktop-light', width: 1280, height: 800, theme: 'light' },
    { name: 'mobile-light', width: 390, height: 844, theme: 'light' },
    { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
    { name: 'narrow-mobile', width: 320, height: 720, theme: 'dark' },
  ]

  for (const testCase of viewportCases) {
    const context = await browser.newContext({
      viewport: { width: testCase.width, height: testCase.height },
    })
    await context.addInitScript((theme) => {
      localStorage.setItem('data-warehouse-visualized:theme', theme)
    }, testCase.theme)
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const response = await page.goto(`${origin}${UNKNOWN_PATH}`, { waitUntil: 'networkidle' })

    assert.equal(
      response?.status(),
      404,
      `${testCase.name}: browser navigation must expose HTTP 404`,
    )
    assert.equal(await page.getByRole('heading', { name: '页面未找到' }).isVisible(), true)
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN')
    assert.equal(await page.locator('.not-found__copy--english').getAttribute('lang'), 'en')
    assert.equal(await page.locator('[data-404-link="home"]').getAttribute('href'), '/')
    assert.equal(await page.locator('[data-404-link="learn"]').getAttribute('href'), '/learn/')
    assert.equal(
      await page.locator('[data-404-link="english-resources"]').getAttribute('href'),
      '/en/',
    )
    assert.equal(await page.locator('link[rel="canonical"]').count(), 0)
    assert.equal(await page.locator('meta[property="og:url"]').count(), 0)
    assert.equal(await page.locator('meta[name="robots"]').count(), 0)

    await page.keyboard.press('Tab')
    const keyboardFocus = await page.evaluate(() => ({
      tagName: document.activeElement?.tagName,
      outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
    }))
    assert.equal(keyboardFocus.tagName, 'A', `${testCase.name}: links must be keyboard reachable`)
    assert.notEqual(
      keyboardFocus.outlineStyle,
      'none',
      `${testCase.name}: keyboard focus must be visually apparent`,
    )

    const layout = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      cardBackground: getComputedStyle(document.querySelector('.not-found__card')).backgroundColor,
    }))
    assert.equal(layout.theme, testCase.theme, `${testCase.name}: saved theme must be honored`)
    assert.ok(
      layout.documentWidth <= layout.viewportWidth,
      `${testCase.name}: page must not overflow horizontally (${layout.documentWidth}px)`,
    )
    assert.notEqual(
      layout.cardBackground,
      'rgba(0, 0, 0, 0)',
      `${testCase.name}: card must be visible`,
    )
    assert.deepEqual(pageErrors, [], `${testCase.name}: page must not produce uncaught errors`)

    await context.close()
    console.log(`[smart-404-workers] PASS · ${testCase.name}`)
  }

  console.log(
    `[smart-404-workers] PASS · HTTP 404, no redirect, safe static body, cache policy, ` +
      `${normalRoutes.length} normal routes · Wrangler local`,
  )
} finally {
  await browser?.close()
  await stopWrangler(server)
  await rm(persistenceDir, { recursive: true, force: true })
}
