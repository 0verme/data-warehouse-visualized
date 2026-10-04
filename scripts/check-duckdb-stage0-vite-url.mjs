#!/usr/bin/env node
/**
 * Stage 0（Issue #35）补充证据：验证 Vite 在当前版本下如何处理
 * DuckDB worker / wasm 的 `?url` 资产，以及 `--base` 是否进入产物 URL。
 *
 * 该脚本在临时目录里跑一个最小 Vite build，不向仓库构建产物写入 34 MB wasm。
 * 用法：node scripts/check-duckdb-stage0-vite-url.mjs
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tempDir = mkdtempSync(join(tmpdir(), 'stage0-vite-url-'))
const base = '/data-warehouse-visualized/'

try {
  symlinkSync(resolve(root, 'node_modules'), join(tempDir, 'node_modules'), 'dir')
  writeFileSync(
    join(tempDir, 'index.html'),
    '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>',
  )
  writeFileSync(
    join(tempDir, 'main.js'),
    [
      "import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'",
      "import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'",
      'window.__stage0Urls = { ehWasm, ehWorker }',
      '',
    ].join('\n'),
  )

  execFileSync(
    resolve(root, 'node_modules/.bin/vite'),
    ['build', '--base', base, '--outDir', 'dist', '--logLevel', 'warn'],
    { cwd: tempDir, stdio: 'inherit' },
  )

  const assetsDir = join(tempDir, 'dist/assets')
  const assets = readdirSync(assetsDir)
  const wasmAsset = assets.find((name) => name.endsWith('.wasm'))
  const workerAsset = assets.find((name) => name.includes('.worker-') && name.endsWith('.js'))
  const entryAsset = assets.find((name) => name.startsWith('index-') && name.endsWith('.js'))

  if (!wasmAsset || !workerAsset || !entryAsset) {
    throw new Error(`Vite 产物缺少预期资产: ${assets.join(', ')}`)
  }

  const entryCode = readFileSync(join(assetsDir, entryAsset), 'utf8')
  const expectedWasmUrl = `${base}assets/${wasmAsset}`
  const expectedWorkerUrl = `${base}assets/${workerAsset}`
  const results = {
    base,
    wasmAsset,
    wasmBytes: statSync(join(assetsDir, wasmAsset)).size,
    workerAsset,
    workerBytes: statSync(join(assetsDir, workerAsset)).size,
    wasmUrlInBundle: entryCode.includes(expectedWasmUrl),
    workerUrlInBundle: entryCode.includes(expectedWorkerUrl),
  }

  const ok = results.wasmUrlInBundle && results.workerUrlInBundle
  console.log(JSON.stringify({ ok, ...results }, null, 2))
  process.exit(ok ? 0 : 1)
} finally {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
