import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LayerNetworkEvolution } from '../src/components/visualizations/LayerNetworkEvolution'

describe('LayerNetworkEvolution', () => {
  it('shows accumulated cross-layer, multiple-output, and temporary paths as individual dependencies', () => {
    const markup = renderToStaticMarkup(<LayerNetworkEvolution stage="accumulated" />)

    expect(markup).toContain('data-layer-network-stage="accumulated"')
    expect(markup.match(/class="layer-network__edge /g)).toHaveLength(8)
    expect(markup.match(/data-edge-kind="cross-layer"/g)).toHaveLength(2)
    expect(markup.match(/data-edge-kind="temporary"/g)).toHaveLength(2)
    expect(markup).toContain('分行数据 API')
    expect(markup).toContain('临时分行口径')
    expect(markup).toContain('对外核对接口')
    expect(markup).toContain('不等于每条跨层边都要立刻删除')
  })

  it('converges one duplicated path while retaining explained cross-layer exceptions', () => {
    const markup = renderToStaticMarkup(<LayerNetworkEvolution stage="governance" />)

    expect(markup).toContain('data-layer-network-stage="governance"')
    expect(markup.match(/class="layer-network__edge /g)).toHaveLength(7)
    expect(markup).not.toContain('data-edge-kind="temporary"')
    expect(markup).toContain('data-edge-id="summary-partner-api"')
    expect(markup).toContain('触碰时治理')
    expect(markup).toContain('受控例外')
    expect(markup).toContain('保留直读')
    expect(markup).toContain('渐进治理，不做全量推倒')
    expect(markup).toContain('新增链路：先把关系说清楚')
    expect(markup).toContain('负责人、数据时效和运行依赖')
  })
})
