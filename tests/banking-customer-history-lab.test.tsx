import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BankingCustomerHistoryLab } from '../src/components/visualizations/BankingCustomerHistoryLab'
import { slowlyChangingDimensionContent } from '../src/content/lessons/slowly-changing-dimension'
import type { BankingCustomerHistoryVisualization } from '../src/types'

function getVisualization(): BankingCustomerHistoryVisualization {
  for (const section of slowlyChangingDimensionContent.sections) {
    if (
      section.kind === 'visualization' &&
      section.visualization.kind === 'banking-customer-history'
    ) {
      return section.visualization
    }
  }

  throw new Error('客户历史组件测试需要 banking-customer-history visualization 数据')
}

const markup = renderToStaticMarkup(
  <BankingCustomerHistoryLab visualization={getVisualization()} />,
)

describe('BankingCustomerHistoryLab 版本区间与日期游标', () => {
  it('默认停在实际放款日，并保留 Type 1 / Type 2、写变更与 Reset 入口', () => {
    expect(markup).toContain('Customer 历史版本实验台')
    expect(markup).toContain('业务日期 t')
    expect(markup).toContain('2025-10-10')
    expect(markup).toContain('customer_sk 101')
    expect(markup).toContain('TYPE 1')
    expect(markup).toContain('TYPE 2')
    expect(markup).toContain('执行：升级为 VIP 并转入上海支行')
    expect(markup).toContain('重置历史')
  })

  it('区间条用 [start_date, end_date) 表达命中语义，而不是事件点', () => {
    expect(markup).toContain('[start_date, end_date) 如何决定命中的 customer_sk')
    expect(markup).toContain('start 包含')
    expect(markup).toContain('end 不包含')
    expect(markup).toContain('2025-01-01 ≤ t &lt; 9999-12-31')
    expect(markup).toContain('当前命中')
    expect(markup).toContain('data-open-end="true"')
    expect(markup).toContain('开放结束')
  })

  it('日期游标是日粒度区间控件，并提供边界与事件锚点入口', () => {
    expect(markup).toContain('type="range"')
    expect(markup).toContain('min="0"')
    expect(markup).toContain('max="622"')
    expect(markup).toContain('step="1"')
    expect(markup).toContain('value="282"')
    expect(markup).toContain('aria-valuetext="2025-10-10，命中 customer_sk 101，普通，杭州支行"')
    expect(markup).toContain('2026-03-31 · 旧版本')
    expect(markup).toContain('2026-04-01 · 新版本')
    expect(markup).toContain('前一天')
    expect(markup).toContain('后一天')
    for (const date of ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']) {
      expect(markup).toContain(date)
    }
  })

  it('as-of JOIN 结果始终可见，并说明真实放款日与对照日期', () => {
    expect(markup).toContain('AS-OF QUERY')
    expect(markup).toContain('N001')
    expect(markup).toContain('JOIN')
    expect(markup).toContain('N001 的实际放款日就是 2025-10-10，这是真实的历史查询。')
    expect(markup).toContain('role="status"')
  })

  it('状态不只靠颜色：同时输出文字状态与 aria-pressed', () => {
    expect(markup).toContain('data-state="active"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('<span class="banking-history__interval-badge">当前命中</span>')
    expect(markup).toContain('<em class="banking-history__boundary-day-flag"></em>')
  })

  it('reduced motion 下关闭版本切换动画，信息仍由静态文本承载', () => {
    const stylesheet = readFileSync(
      new URL('../src/styles/lessons/banking-modeling.css', import.meta.url),
      'utf8',
    )
    const reduceStart = stylesheet.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(reduceStart).toBeGreaterThanOrEqual(0)
    const reduceBlock = stylesheet.slice(reduceStart)

    expect(reduceBlock).toContain('.banking-history__switch-indicator')
    expect(reduceBlock).toContain('animation: none;')
    expect(stylesheet).not.toContain('.banking-history__point-rail')
    expect(stylesheet).not.toContain('min-width: 510px')
  })
})
