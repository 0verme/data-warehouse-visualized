import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SearchDialog } from '../src/features/search/SearchDialog'

describe('SearchDialog 基础无障碍与初始状态', () => {
  it('提供 modal dialog / combobox / listbox 语义，初始不渲染结果', () => {
    const markup = renderToStaticMarkup(
      <SearchDialog locale="zh-CN" onClose={() => {}} onNavigate={() => {}} />,
    )

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('aria-labelledby="learn-search-title"')
    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('aria-controls="learn-search-results"')
    expect(markup).toContain('role="listbox"')
    expect(markup).toContain('试试：拉链表、幂等、数据倾斜、first_seen')
    expect(markup).not.toContain('role="option"')
    expect(markup).not.toContain('dangerouslySetInnerHTML')
  })
})
