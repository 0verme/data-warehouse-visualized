#!/usr/bin/env node
/**
 * Shared Playwright harness for the repository browser checks.
 *
 * Both browser scripts in `tests/e2e/` are opt-in CLI tools that:
 *   1. build (or reuse) the static site,
 *   2. serve `dist/` with `astro preview` on a free port,
 *   3. drive Chromium through Playwright and count labelled checks.
 *
 * Only the plumbing lives here. Page-level assertions stay inside each script
 * so the two contracts (`learn-scroll-boundary` layout invariants and
 * `release-smoke` release gate) remain independently readable.
 *
 * Requires the `playwright` devDependency (and a Chromium build):
 *   npx playwright install chromium
 * Override resolution with `PLAYWRIGHT_MODULE=/path/to/node_modules/playwright`.
 * Override the browser binary with `CHROMIUM_EXECUTABLE=/path/to/chrome`.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'

/** Geometry tolerance shared by every layout assertion (sub-pixel rounding). */
export const TOLERANCE = 1

/** Viewports owned by the minimum release gate. */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 }
export const MOBILE_VIEWPORT = { width: 390, height: 844 }

/**
 * Labelled check bookkeeping.
 *
 * A failing check keeps the run going so one report lists every broken
 * invariant, then the CLI exits non-zero.
 */
export function createChecker() {
  let checks = 0
  let failures = 0
  const failedLabels = []

  function check(label, condition, detail = '') {
    checks += 1
    if (!condition) {
      failures += 1
      failedLabels.push(label)
      console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    }
  }

  return {
    check,
    failedLabels,
    get checks() {
      return checks
    },
    get failures() {
      return failures
    },
    /** Print the summary line pair used by both scripts and return the failure count. */
    report(scriptName) {
      console.log(`[${scriptName}] ${checks - failures}/${checks} checks passed`)
      if (failures > 0) {
        console.error(`[${scriptName}] FAILED with ${failures} failing checks`)
        for (const label of failedLabels) {
          console.error(`[${scriptName}]   - ${label}`)
        }
      }
      return failures
    },
  }
}

export function loadPlaywright() {
  const require = createRequire(import.meta.url)
  const candidates = process.env.PLAYWRIGHT_MODULE
    ? [process.env.PLAYWRIGHT_MODULE, 'playwright']
    : ['playwright']

  for (const id of candidates) {
    try {
      return require(id)
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'playwright not found. Install it with `npm ci && npx playwright install chromium` ' +
      'or point PLAYWRIGHT_MODULE at an existing installation.',
  )
}

export async function launchChromium() {
  const { chromium } = loadPlaywright()
  const launchOptions = process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : {}
  return chromium.launch(launchOptions)
}

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

export async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`preview server did not become ready: ${url}`)
}

/**
 * Serve the built site, building it first unless `--skip-build` / `--base` is used.
 * Returns `{ baseUrl, stop() }`; `stop()` is always safe to call.
 */
export async function startPreview({ root, base = null, skipBuild = false, scriptName = 'e2e' }) {
  if (base) {
    return { baseUrl: base, stop() {} }
  }

  if (!skipBuild) {
    console.log(`[${scriptName}] building static site…`)
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  }

  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const preview = spawn(
    'npx',
    ['astro', 'preview', '--port', String(port), '--host', '127.0.0.1'],
    { cwd: root, stdio: 'ignore', detached: true },
  )
  await waitForServer(`${baseUrl}/learn/`)

  return {
    baseUrl,
    stop() {
      if (preview?.pid) {
        try {
          process.kill(-preview.pid, 'SIGTERM')
        } catch {
          preview.kill('SIGTERM')
        }
      }
    },
  }
}

/**
 * Record uncaught page errors for one page.
 * Must be called before the first `page.goto()`.
 */
export function trackPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message ?? String(error)))
  return errors
}
