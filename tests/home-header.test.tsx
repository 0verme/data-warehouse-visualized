import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GlobalHeaderActions } from '../src/components/GlobalHeaderActions'
import { getPrimaryNavItems, PrimaryNav } from '../src/components/PrimaryNav'
import { lessons } from '../src/data/course'

const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')

function getHomepageHeader(): string {
  const headerStart = homepage.indexOf('<header class="site-header">')
  const headerEnd = homepage.indexOf('</header>', headerStart)

  if (headerStart < 0 || headerEnd < 0) {
    throw new Error('Homepage header not found')
  }

  return homepage.slice(headerStart, headerEnd)
}

describe('首页 Header', () => {
  it('复用学习页的语言与主题图标控件', () => {
    const markup = renderToStaticMarkup(<GlobalHeaderActions />)

    expect(markup).toContain(
      '<a class="english-entry-link" href="/en/" aria-label="English resources">EN</a>',
    )
    expect(markup).toContain('class="topbar-control locale-switcher__trigger"')
    expect(markup).toContain('<svg class="locale-switcher__globe"')
    expect(markup).toContain('class="topbar-control theme-toggle"')
    expect(markup).not.toContain('locale-switcher__label')
  })

  it('在 Header 中引入一级导航，并保留独立的 utility 控件', () => {
    const header = getHomepageHeader()

    expect(header).toContain('<PrimaryNav current="home" />')
    expect(header).toContain('<GlobalHeaderActions client:load />')
    expect(header).not.toContain('site-header__nav')
  })

  it('一级导航固定为五个内容入口且顺序稳定', () => {
    const items = getPrimaryNavItems()

    expect(items.map((item) => item.label)).toEqual(['首页', '学习', '路线', '案例', '关于'])
    expect(items.map((item) => item.href)).toEqual([
      '/',
      '/learn/',
      '/roadmap/',
      '/learn/lifecycle-path-failure/',
      'https://github.com/0verme/data-warehouse-visualized',
    ])
    expect(items.some((item) => item.label === '实验')).toBe(false)
  })

  it('路线导航与首页 Roadmap CTA 指向同一个既有 route', () => {
    const roadmapItem = getPrimaryNavItems().find((item) => item.id === 'roadmap')
    const ctaTarget = homepage.match(
      /<a class="home-text-link" href={getRoute\('([^']+)'\)}>\s*按知识关系浏览 Roadmap/,
    )?.[1]

    expect(ctaTarget).toBe('/roadmap/')
    expect(roadmapItem?.href).toBe(ctaTarget)
  })

  it('导航目标是真实存在的稳定入口，没有空壳链接', () => {
    const items = getPrimaryNavItems()

    expect(items.every((item) => item.href !== '#' && !item.href.startsWith('javascript:'))).toBe(
      true,
    )
    expect(lessons.some((lesson) => lesson.slug === 'lifecycle-path-failure')).toBe(true)
  })

  it('只有当前页带 aria-current，且外部入口语义明确', () => {
    const markup = renderToStaticMarkup(<PrimaryNav current="home" />)

    expect(markup).toContain('<nav class="site-header__nav" aria-label="主导航">')
    expect((markup.match(/<a /g) ?? []).length).toBe(5)

    const anchors = markup.split('<a ').slice(1)
    expect(anchors).toHaveLength(5)
    expect(anchors[0]).toContain('href="/"')
    expect(anchors[0]).toContain('aria-current="page"')
    for (const anchor of anchors.slice(1)) {
      expect(anchor).not.toContain('aria-current')
    }

    expect(anchors[4]).toContain('target="_blank"')
    expect(anchors[4]).toContain('rel="noopener noreferrer"')
    expect(anchors[4]).toContain('sr-only')
  })

  it('路线当前页高亮，且学习 / 案例 active IDs 保持可用', () => {
    for (const [current, activeIndex] of [
      ['roadmap', 2],
      ['learn', 1],
      ['case', 3],
    ] as const) {
      const markup = renderToStaticMarkup(<PrimaryNav current={current} />)
      const anchors = markup.split('<a ').slice(1)

      expect(anchors.filter((anchor) => anchor.includes('aria-current="page"'))).toHaveLength(1)
      expect(anchors[activeIndex]).toContain('aria-current="page"')
    }
  })
})
