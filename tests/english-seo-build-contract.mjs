#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()
const dist = resolve(root, 'dist')
const baseArgumentIndex = process.argv.indexOf('--base-path')
const rawBasePath = baseArgumentIndex >= 0 ? process.argv[baseArgumentIndex + 1] : '/'

if (!rawBasePath) {
  throw new Error('Usage: node tests/english-seo-build-contract.mjs [--base-path /prefix/]')
}

const basePath = rawBasePath === '/' ? '' : `/${rawBasePath.split('/').filter(Boolean).join('/')}`
const siteOrigin = 'https://sql.sb'
const expectedEnglishPages = [
  { route: '/en/', file: 'en/index.html', title: 'English Data Engineering Resources | sql.sb' },
  {
    route: '/en/sql/',
    file: 'en/sql/index.html',
    title: 'SQL Resources | English Data Engineering | sql.sb',
  },
  {
    route: '/en/sql/sql-join-duplicate-rows/',
    file: 'en/sql/sql-join-duplicate-rows/index.html',
    title: 'Why Does a SQL JOIN Duplicate Rows? Examples & Fixes | sql.sb',
  },
  {
    route: '/en/data-warehouse/',
    file: 'en/data-warehouse/index.html',
    title: 'Data Warehouse Engineering | English Resources | sql.sb',
  },
  {
    route: '/en/data-warehouse/grain/',
    file: 'en/data-warehouse/grain/index.html',
    title: 'Data Warehouse Grain: What Does One Row Represent? | sql.sb',
  },
  {
    route: '/en/data-warehouse/idempotent-etl/',
    file: 'en/data-warehouse/idempotent-etl/index.html',
    title: 'How to Make an ETL Job Idempotent: Examples & Trade-offs | sql.sb',
  },
  {
    route: '/en/data-warehouse/data-lineage-vs-task-dependency/',
    file: 'en/data-warehouse/data-lineage-vs-task-dependency/index.html',
    title: 'Data Lineage vs Task Dependency: Why the Graphs Differ | sql.sb',
  },
  {
    route: '/en/data-warehouse/scd-type-2/',
    file: 'en/data-warehouse/scd-type-2/index.html',
    title: 'SCD Type 2 Example: Effective Dates & Historical Rows | sql.sb',
  },
  { route: '/en/tools/', file: 'en/tools/index.html', title: 'Data Engineering Tools | sql.sb' },
]

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function getTitle(html) {
  return decodeEntities(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '')
}

function addBase(path) {
  return `${basePath}${path}`
}

function removeBase(path) {
  if (!basePath || !(path === basePath || path.startsWith(`${basePath}/`))) return path
  return path.slice(basePath.length) || '/'
}

function readPage(file) {
  const path = join(dist, file)
  assert.ok(existsSync(path), `Missing static page: dist/${file}`)
  return readFileSync(path, 'utf8')
}

function getTagAttribute(html, tagPattern, attribute) {
  const tag = html.match(tagPattern)?.[0]
  assert.ok(tag, `Missing tag ${tagPattern}`)
  const value = tag.match(new RegExp(`\\b${attribute}="([^"]*)"`))?.[1]
  assert.ok(value !== undefined, `Missing ${attribute} on ${tag}`)
  return value
}

function getMeta(html, selector) {
  const tag = html.match(selector)?.[0]
  assert.ok(tag, `Missing metadata tag ${selector}`)
  return decodeEntities(tag.match(/\bcontent="([^"]*)"/)?.[1] ?? '')
}

function getUrls(xml) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1])
}

function sitemapPathToFile(url) {
  const pathname = removeBase(new URL(url).pathname)
  return join(dist, pathname.replace(/^\/+/, ''))
}

function checkPageIndexability(html, name) {
  assert.doesNotMatch(
    html,
    /<meta\b(?=[^>]*\bname="robots")(?=[^>]*\bcontent="[^"]*noindex)/i,
    `${name} must not emit a noindex robots directive`,
  )
  assert.doesNotMatch(html, /<meta\b[^>]*\bname="robots"[^>]*\bcontent="none"/i)
}

assert.ok(existsSync(dist), 'Missing dist/. Run npm run build first.')
const robots = readFileSync(join(dist, 'robots.txt'), 'utf8')
assert.match(robots, /^User-agent:\s*\*\s*$/m, 'robots.txt must target all user agents')
assert.match(robots, /^Allow:\s*\/\s*$/m, 'robots.txt must allow crawling the site')
const disallowRules = Array.from(robots.matchAll(/^Disallow:\s*(\S+)\s*$/gm), (match) => match[1])
assert.deepEqual(
  disallowRules,
  ['/dev/'],
  'robots.txt may only disallow the experimental /dev/ area',
)
const robotsSitemap = robots.match(/^Sitemap:\s*(\S+)\s*$/m)?.[1]
assert.ok(robotsSitemap, 'robots.txt must advertise a sitemap')
assert.equal(new URL(robotsSitemap).origin, siteOrigin)
const sitemapIndexPath = removeBase(new URL(robotsSitemap).pathname)
const sitemapIndexFile = join(dist, sitemapIndexPath.replace(/^\/+/, ''))
assert.ok(existsSync(sitemapIndexFile), `robots sitemap reference is missing: ${sitemapIndexPath}`)

for (const page of expectedEnglishPages) {
  const html = readPage(page.file)
  const canonical = `${siteOrigin}${page.route}`
  assert.equal(getTagAttribute(html, /<html\b[^>]*>/i, 'lang'), 'en', `${page.route} lang`)
  assert.equal(getTitle(html), page.title, `${page.route} title`)
  assert.ok(getMeta(html, /<meta\b[^>]*\bname="description"[^>]*>/i), `${page.route} description`)
  assert.equal(
    getTagAttribute(html, /<link\b[^>]*\brel="canonical"[^>]*>/i, 'href'),
    canonical,
    `${page.route} must canonicalize to its public self URL without BASE_PATH`,
  )
  assert.equal(
    getTagAttribute(html, /<meta\b[^>]*\bproperty="og:locale"[^>]*>/i, 'content'),
    'en_US',
    `${page.route} Open Graph locale`,
  )
  assert.equal(
    getTagAttribute(html, /<meta\b[^>]*\bproperty="og:url"[^>]*>/i, 'content'),
    canonical,
    `${page.route} Open Graph URL`,
  )
  assert.equal(
    getMeta(html, /<meta\b[^>]*\bproperty="og:title"[^>]*>/i),
    page.title,
    `${page.route} Open Graph title`,
  )
  assert.ok(getMeta(html, /<meta\b[^>]*\bproperty="og:description"[^>]*>/i))
  assert.match(html, /<h1\b[^>]*>/, `${page.route} must render its page heading`)
  assert.doesNotMatch(html, /hreflang=/i, `${page.route} must not emit hreflang`)
  checkPageIndexability(html, page.route)

  const expectedAssetPrefix = `${basePath}/_astro/`
  const assetReferences = Array.from(
    html.matchAll(/\b(?:href|src)="([^"]+)"/g),
    (match) => match[1],
  ).filter((href) => href.startsWith(expectedAssetPrefix))
  assert.ok(assetReferences.length > 0, `${page.route} must load BASE_PATH-aware built assets`)
  for (const asset of assetReferences) {
    const assetPath = removeBase(new URL(asset, siteOrigin).pathname)
    assert.ok(existsSync(join(dist, assetPath.replace(/^\/+/, ''))), `Missing asset ${asset}`)
  }
}

const homepage = readPage('index.html')
assert.equal(getTagAttribute(homepage, /<html\b[^>]*>/i, 'lang'), 'zh-CN')
assert.equal(
  getTagAttribute(homepage, /<link\b[^>]*\brel="canonical"[^>]*>/i, 'href'),
  `${siteOrigin}/`,
)
assert.equal(
  getTagAttribute(homepage, /<meta\b[^>]*\bproperty="og:locale"[^>]*>/i, 'content'),
  'zh_CN',
)
assert.ok(
  homepage.includes(`href="${addBase('/en/')}"`),
  'Homepage must link to the English namespace',
)
checkPageIndexability(homepage, '/')

const learnIndex = readPage('learn/index.html')
assert.equal(getTagAttribute(learnIndex, /<html\b[^>]*>/i, 'lang'), 'zh-CN')
assert.equal(
  getTagAttribute(learnIndex, /<link\b[^>]*\brel="canonical"[^>]*>/i, 'href'),
  `${siteOrigin}/learn/`,
)
checkPageIndexability(learnIndex, '/learn/')

const lessonDirectories = readdirSync(join(dist, 'learn'), { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(join(dist, 'learn', entry.name, 'index.html')),
  )
  .map((entry) => entry.name)
  .sort()
assert.equal(lessonDirectories.length, 55, 'The existing 55 static lesson routes must remain')

const sitemapIndexXml = readFileSync(sitemapIndexFile, 'utf8')
const sitemapFiles = getUrls(sitemapIndexXml)
assert.ok(sitemapFiles.length > 0, 'The actual sitemap index must reference a sitemap file')
const sitemapUrls = sitemapFiles.flatMap((url) => {
  assert.equal(new URL(url).origin, siteOrigin)
  const file = sitemapPathToFile(url)
  assert.ok(existsSync(file), `Sitemap-index URL does not map to a real dist file: ${url}`)
  return getUrls(readFileSync(file, 'utf8'))
})
const sitemapSet = new Set(sitemapUrls)
assert.equal(sitemapSet.size, sitemapUrls.length, 'Sitemap URLs must be unique')
for (const page of expectedEnglishPages) {
  const expectedUrl = `${siteOrigin}${addBase(page.route)}`
  assert.ok(sitemapSet.has(expectedUrl), `Sitemap is missing ${expectedUrl}`)
}
assert.ok(sitemapSet.has(`${siteOrigin}${addBase('/learn/')}`), 'Sitemap must retain /learn/')
for (const slug of lessonDirectories) {
  assert.ok(
    sitemapSet.has(`${siteOrigin}${addBase(`/learn/${slug}/`)}`),
    `Sitemap is missing the existing lesson URL /learn/${slug}/`,
  )
}
assert.equal(
  sitemapUrls.filter((url) => {
    const path = removeBase(new URL(url).pathname)
    return path === '/learn/' || /^\/learn\/[^/]+\/$/.test(path)
  }).length,
  56,
  'The sitemap must preserve the Learn index and all 55 lesson URLs',
)
assert.ok(sitemapUrls.every((url) => !new URL(url).pathname.includes('/zh/')))

console.log(
  `[english-seo-build-contract] PASS · ${expectedEnglishPages.length} English routes · ` +
    `${lessonDirectories.length} Learn lessons · BASE_PATH=${rawBasePath} · ` +
    `robots=${sitemapIndexPath} · sitemap files=${sitemapFiles.length}`,
)
