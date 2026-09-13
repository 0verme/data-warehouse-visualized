import { describe, expect, it } from 'vitest'
import { dataLineageContent } from '../src/content/lessons/data-lineage'
import { getDownstreamNodes, getImpactAnalysis, getUpstreamNodes } from '../src/utils/lineage'

const visualization = dataLineageContent.visualization

if (!visualization || visualization.kind !== 'lineage') {
  throw new Error('血缘测试需要 lineage visualization 数据')
}

describe('数据血缘分析', () => {
  it('找到当前节点的所有上游', () => {
    expect(getUpstreamNodes(visualization.nodes, visualization.edges, 'dwd-order-detail')).toEqual([
      'ods-order',
    ])
  })

  it('找到当前节点的所有下游并区分直接下游', () => {
    expect(
      getDownstreamNodes(visualization.nodes, visualization.edges, 'dwd-order-detail'),
    ).toEqual(['dws-sales', 'dws-user', 'ads-report'])
  })

  it('计算 DWD.ORDER_DETAIL 的影响范围', () => {
    expect(getImpactAnalysis(visualization.nodes, visualization.edges, 'dwd-order-detail')).toEqual(
      {
        upstream: ['ods-order'],
        directDownstream: ['dws-sales', 'dws-user'],
        finalImpact: ['dws-sales', 'dws-user', 'ads-report'],
      },
    )
  })
})
