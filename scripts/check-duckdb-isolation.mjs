#!/usr/bin/env node
/**
 * Stage 0（Issue #35）DuckDB 隔离守卫。
 *
 * 在 `npm run build` 之后对 `dist/` 做静态检查：
 *   1. 除 `/dev/` 外的页面不得出现 duckdb 引用；
 *   2. 普通课程页面（`/learn/*`）的静态 import 闭包不得包含 DuckDB 运行时；
 *   3. 隐藏 harness 的静态闭包不得包含 DuckDB 运行时，运行时必须只通过
 *      dynamic import 出现；
 *   4. 默认构建产物不得包含 duckdb wasm / worker 资产（CDN 策略）。
 *
 * 这是 Stage 0 的最小验证，不替代浏览器 Network 证据。
 *
 * 用法：
 *   node scripts/check-duckdb-isolation.mjs
 *   node scripts/check-duckdb-isolation.mjs --json
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const asJson = process.argv.includes('--json')

const RUNTIME_MARKERS = ['apache-arrow', 'cdn.jsdelivr.net/npm/', 'DuckDBAccessMode', 'AsyncDuckDB']

const failures = []
const notes = []

function fail(message) {
  failures.push(message)
}

function walk(directory) {
  const results = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...walk(absolute))
    } else {
      results.push(absolute)
    }
  }
  return results
}

function readText(file) {
  return readFileSync(file, 'utf8')
}

function htmlEntries(html) {
  const urls = [...html.matchAll(/(?:component-url|renderer-url)="([^"]+)"/gu)].map(
    (match) => match[1],
  )
  const scripts = [...html.matchAll(/<script type="module" src="([^"]+)"/gu)].map(
    (match) => match[1],
  )
  return [...urls, ...scripts].filter((url) => url.startsWith('/'))
}

/** 跟随静态 import（`from "./x.js"` / `import "./x.js"`）构建闭包。 */
function staticClosure(entries) {
  const seen = new Set()
  const stack = [...entries]

  while (stack.length > 0) {
    const relative = stack.pop()
    if (seen.has(relative)) continue
    seen.add(relative)

    const absolute = resolve(distDir, relative.replace(/^\//u, ''))
    let code
    try {
      code = readText(absolute)
    } catch {
      continue
    }

    for (const match of code.matchAll(
      /from\s*["'](\.\/[^"']+)["']|import\s*["'](\.\/[^"']+)["']/gu,
    )) {
      const dependency = match[1] ?? match[2]
      const dependencyPath = resolve(dirname(absolute), dependency)
      stack.push(`/${dependencyPath.slice(distDir.length + 1)}`)
    }
  }

  return seen
}

/** 收集动态 import 目标（Vite 产物可能是 `import("./x.js")` 或模板字符串）。 */
function dynamicImports(files) {
  const targets = new Set()
  for (const file of files) {
    const absolute = resolve(distDir, file.replace(/^\//u, ''))
    let code
    try {
      code = readText(absolute)
    } catch {
      continue
    }
    for (const match of code.matchAll(/import\(\s*[`"'](\.\/[^`"']+)[`"']\s*\)/gu)) {
      const dependencyPath = resolve(dirname(absolute), match[1])
      targets.add(`/${dependencyPath.slice(distDir.length + 1)}`)
    }
  }
  return targets
}

function containsRuntimeMarker(code) {
  return RUNTIME_MARKERS.some((marker) => code.includes(marker))
}

if (!existsSync(distDir)) {
  fail('dist/ 不存在，请先运行 npm run build')
} else {
  const files = walk(distDir)
  const htmlFiles = files.filter((file) => file.endsWith('.html'))
  const nonDevHtml = htmlFiles.filter((file) => !file.slice(distDir.length + 1).startsWith('dev/'))
  const learnHtml = htmlFiles.filter((file) => file.slice(distDir.length + 1).startsWith('learn/'))

  // 1. 非 /dev/ 页面不得出现 duckdb。
  for (const file of nonDevHtml) {
    const relative = file.slice(distDir.length + 1)
    const html = readText(file)
    if (/duckdb/iu.test(html)) {
      fail(`非实验页面出现 duckdb 引用: ${relative}`)
    }
  }

  // 2. 普通课程静态闭包不得包含 DuckDB 运行时。
  let learnClosureMaxBytes = 0
  let learnClosureMaxFiles = 0
  for (const file of learnHtml) {
    const html = readText(file)
    const closure = staticClosure(htmlEntries(html))
    let pageBytes = 0
    for (const entry of closure) {
      const absolute = resolve(distDir, entry.replace(/^\//u, ''))
      if (!existsSync(absolute)) continue
      pageBytes += statSync(absolute).size
      if (containsRuntimeMarker(readText(absolute))) {
        fail(`普通课程静态闭包包含 DuckDB 运行时: ${file.slice(distDir.length + 1)} → ${entry}`)
      }
    }
    if (pageBytes > learnClosureMaxBytes) {
      learnClosureMaxBytes = pageBytes
      learnClosureMaxFiles = closure.size
    }
  }

  // 3. 隐藏 harness：静态闭包干净，动态 import 指向 DuckDB 运行时。
  const harnessHtml = htmlFiles.find((file) =>
    file.slice(distDir.length + 1).startsWith('dev/sql-sandbox-poc/'),
  )
  if (!harnessHtml) {
    fail('未找到隐藏 harness 页面 dist/dev/sql-sandbox-poc/index.html')
  } else {
    const closure = staticClosure(htmlEntries(readText(harnessHtml)))
    for (const entry of closure) {
      const absolute = resolve(distDir, entry.replace(/^\//u, ''))
      if (!existsSync(absolute)) continue
      if (containsRuntimeMarker(readText(absolute))) {
        fail(`harness 静态闭包包含 DuckDB 运行时（必须改为 dynamic import）: ${entry}`)
      }
    }

    const dynamicTargets = [...dynamicImports(closure)]
    const runtimeChunk = dynamicTargets.find((target) => {
      const absolute = resolve(distDir, target.replace(/^\//u, ''))
      return existsSync(absolute) && containsRuntimeMarker(readText(absolute))
    })

    if (!runtimeChunk) {
      fail('harness 没有找到只通过 dynamic import 加载的 DuckDB runtime chunk')
    } else {
      const runtimeBytes = statSync(resolve(distDir, runtimeChunk.replace(/^\//u, ''))).size
      const harnessBytes = [...closure].reduce((total, entry) => {
        const absolute = resolve(distDir, entry.replace(/^\//u, ''))
        return existsSync(absolute) ? total + statSync(absolute).size : total
      }, 0)
      notes.push(`harness 静态闭包: ${harnessBytes} B`)
      notes.push(`DuckDB runtime chunk: ${runtimeChunk} (${runtimeBytes} B)`)
    }
  }

  // 4. 默认构建不得包含 duckdb wasm / worker 资产。
  for (const file of files) {
    const relative = file.slice(distDir.length + 1)
    if (/duckdb.*\.wasm$/u.test(relative) || /duckdb-browser-.*worker.*\.js$/u.test(relative)) {
      fail(`默认构建出现 DuckDB wasm / worker 资产: ${relative}`)
    }
  }

  notes.push(`普通课程静态闭包最大值: ${learnClosureMaxBytes} B / ${learnClosureMaxFiles} 个文件`)
}

const report = { ok: failures.length === 0, failures, notes }

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  for (const note of notes) console.log(`[isolation] ${note}`)
  if (failures.length > 0) {
    for (const failure of failures) console.error(`[isolation] FAIL ${failure}`)
    console.error(`[isolation] ${failures.length} 项隔离检查失败`)
  } else {
    console.log('[isolation] DuckDB 隔离检查通过')
  }
}

process.exit(failures.length === 0 ? 0 : 1)
