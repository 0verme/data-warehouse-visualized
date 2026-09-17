import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GlobalHeaderActions } from '../src/components/GlobalHeaderActions'

const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')

function getHomepageHeader(): string {
  const headerStart = homepage.indexOf('<header class="site-header">')
  const headerEnd = homepage.indexOf('</header>', headerStart)

  if (headerStart < 0 || headerEnd < 0) {
    throw new Error('Homepage header not found')
  }

  return homepage.slice(headerStart, headerEnd)
}

describe('首页 Header 操作区', () => {
  it('复用学习页的语言与主题图标控件', () => {
    const markup = renderToStaticMarkup(<GlobalHeaderActions />)

    expect(markup).toContain('class="locale-switcher__trigger"')
    expect(markup).toContain('<svg class="locale-switcher__globe"')
    expect(markup).toContain('class="theme-toggle"')
    expect(markup).not.toContain('locale-switcher__label')
  })

  it('只保留全局操作并移除原有首页导航入口', () => {
    const header = getHomepageHeader()

    expect(header).toContain('<GlobalHeaderActions client:load />')
    expect(header).not.toContain('一行数据')
    expect(header).not.toContain('学习方式')
    expect(header).not.toContain('开始学习')
    expect(header).not.toContain('site-header__nav')
  })
})
