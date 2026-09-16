import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PerformanceLab } from '../src/components/visualizations/PerformanceLab'
import { performanceVisualizations } from '../src/features/performance/banking'

describe('第 11 章五种交互实验', () => {
  it('11-1 SSR 渲染阶段时间线和诊断流程', () => {
    const markup = renderToStaticMarkup(
      <PerformanceLab visualization={performanceVisualizations.diagnosis} />,
    )

    expect(markup).toContain('Scan')
    expect(markup).toContain('41 min')
    expect(markup).toContain('症状')
    expect(markup).toContain('检查副作用')
  })

  it('11-2 SSR 渲染分区扫描、文件布局和双 11', () => {
    const markup = renderToStaticMarkup(
      <PerformanceLab visualization={performanceVisualizations.scanLayout} />,
    )

    expect(markup).toContain('Partition Pruning')
    expect(markup).toContain('少读数据 ≠ 一定读得高效')
    expect(markup).toContain('1.8 TB')
    expect(markup).toContain('Compaction')
  })

  it('11-3 SSR 渲染 Worker 分布、最长 Task 和两类倾斜', () => {
    const markup = renderToStaticMarkup(
      <PerformanceLab visualization={performanceVisualizations.shuffleSkew} />,
    )

    expect(markup).toContain('Worker 4')
    expect(markup).toContain('680 GB')
    expect(markup).toContain('日期分区倾斜')
    expect(markup).toContain('Shuffle Key 倾斜')
  })

  it('11-4 SSR 渲染当日关系、first_seen 状态和客户日特征', () => {
    const markup = renderToStaticMarkup(
      <PerformanceLab visualization={performanceVisualizations.firstSeen} />,
    )

    expect(markup).toContain('customer_counterparty_first_seen')
    expect(markup).toContain('A001')
    expect(markup).toContain('B003')
    expect(markup).toContain('customer_id × business_date')
  })

  it('11-5 SSR 渲染工程验收、迟到数据和章节末思考题', () => {
    const markup = renderToStaticMarkup(
      <PerformanceLab visualization={performanceVisualizations.tradeoffs} />,
    )

    expect(markup).toContain('68 min')
    expect(markup).toContain('18 min')
    expect(markup).toContain('2026-09-16')
    expect(markup).toContain('任意日期区间内的去重交易对手数')
  })
})
