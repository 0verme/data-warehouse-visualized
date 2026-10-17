#!/usr/bin/env node
/**
 * Build contract for the Smart 404 recovery manifest (#215 Phase 2).
 *
 * Verifies that:
 *   - the built 404 document ships a recovery manifest and evidence-gated aliases;
 *   - every manifest route is a real page in `dist/`;
 *   - every built page (except `/404` and `/dev/*`) is reachable through the manifest;
 *   - alias targets resolve to manifest routes.
 *
 * Usage: node tests/smart-404-build-contract.mjs [--base-path /prefix/]
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = process.cwd()
const dist = resolve(root, 'dist')
const baseArgumentIndex = process.argv.indexOf('--base-path')
const rawBasePath = baseArgumentIndex >= 0 ? process.argv[baseArgumentIndex + 1] : '/'
const basePath = rawBasePath === '/' ? '' : `/${rawBasePath.split('/').filter(Boolean).join('/')}`

const notFoundPath = join(dist, '404.html')
assert.ok(
  existsSync(notFoundPath),
  'Missing dist/404.html. Run npm run build before this contract.',
)
const html = readFileSync(notFoundPath, 'utf8')

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}(?:="([^"]*)")?`))
  assert.ok(match, `404 document must expose ${name}`)
  return decodeEntities(match[1] ?? '')
}

const sectionTag = html.match(/<section[^>]*data-404-recovery[^>]*>/)?.[0]
assert.ok(sectionTag, '404 document must contain the recovery section')
const manifest = JSON.parse(getAttribute(sectionTag, 'data-routes'))
const aliases = JSON.parse(getAttribute(sectionTag, 'data-aliases'))
const declaredBasePath = getAttribute(sectionTag, 'data-base-path')

assert.equal(
  declaredBasePath,
  basePath,
  `Recovery BASE_PATH must match the build base (expected "${basePath}", got "${declaredBasePath}")`,
)
assert.ok(Array.isArray(manifest), 'Recovery manifest must be a JSON array')
assert.deepEqual([...new Set(manifest)], manifest, 'Recovery manifest routes must be unique')
assert.deepEqual([...manifest].sort(), manifest, 'Recovery manifest routes must be sorted')

const builtRoutes = new Set()
const publicDir = resolve(root, 'public')
const publicFiles = new Set()
function collectPublic(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) collectPublic(path)
    else publicFiles.add(`/${relative(publicDir, path).replace(/\\/g, '/')}`)
  }
}
collectPublic(publicDir)
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (name.endsWith('.html')) {
      const rel = `/${relative(dist, path).replace(/\\/g, '/')}`
      if (rel === '/404.html' || rel.startsWith('/dev/') || publicFiles.has(rel)) continue
      const route =
        rel === '/index.html'
          ? '/'
          : rel.endsWith('/index.html')
            ? rel.slice(0, -'index.html'.length)
            : rel.slice(0, -'.html'.length)
      builtRoutes.add(route)
    }
  }
}
walk(dist)

for (const route of manifest) {
  assert.ok(builtRoutes.has(route), `Manifest route ${route} is not a page in dist/`)
}
for (const route of builtRoutes) {
  assert.ok(manifest.includes(route), `Built page ${route} is missing from the recovery manifest`)
}
for (const [key, target] of Object.entries(aliases)) {
  assert.ok(key.startsWith('/'), `Alias key ${key} must be an absolute app path`)
  assert.ok(manifest.includes(target), `Alias target ${target} is not a manifest route`)
}

console.log(
  `[smart-404-build] PASS · ${manifest.length} recoverable routes · ` +
    `aliases=${Object.keys(aliases).length} · base=${basePath || '/'}`,
)
