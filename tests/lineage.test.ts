import { describe, expect, it } from 'vitest'
import { dataLineageContent } from '../src/content/lessons/data-lineage'
import {
  analyzeLineageInvestigation,
  getBlastRadius,
  getDownstreamNodes,
  getImpactAnalysis,
  getLineageEdgeConfidence,
  getLineageEdgeEvidence,
  getLineagePath,
  getLineageView,
  getUpstreamNodes,
} from '../src/utils/lineage'

const visualization = dataLineageContent.visualization

if (!visualization || visualization.kind !== 'lineage') {
  throw new Error('血缘测试需要 lineage visualization 数据')
}

const { nodes, edges } = visualization

describe('数据血缘分析', () => {
  it('保留表级示例的上游、直接下游和最终影响', () => {
    expect(getUpstreamNodes(nodes, edges, 'dwd-order-detail')).toEqual(['ods-order'])
    expect(getDownstreamNodes(nodes, edges, 'dwd-order-detail')).toEqual([
      'dws-sales',
      'dws-user',
      'ads-report',
    ])
    expect(getImpactAnalysis(nodes, edges, 'dwd-order-detail')).toEqual({
      upstream: ['ods-order'],
      directDownstream: ['dws-sales', 'dws-user'],
      finalImpact: ['dws-sales', 'dws-user', 'ads-report'],
    })
  })

  it('按实体类型切换视图时只保留对应节点和边', () => {
    const fieldView = getLineageView(nodes, edges, 'field')
    const taskView = getLineageView(nodes, edges, 'task')

    expect(fieldView.nodes).toHaveLength(5)
    expect(fieldView.edges).toHaveLength(5)
    expect(fieldView.nodes.every((node) => node.entityType === 'field')).toBe(true)
    expect(
      fieldView.edges.every((edge) => fieldView.nodes.some((node) => node.id === edge.source)),
    ).toBe(true)
    expect(taskView.nodes).toHaveLength(5)
    expect(taskView.edges).toHaveLength(5)
  })

  it('区分字段视图的直接下游与传递下游', () => {
    const fieldView = getLineageView(nodes, edges, 'field')
    const analysis = getImpactAnalysis(fieldView.nodes, fieldView.edges, 'field-dwd-order-status')

    expect(analysis.directDownstream).toEqual(['field-dws-sales-status', 'field-dws-user-status'])
    expect(analysis.finalImpact).toEqual([
      'field-dws-sales-status',
      'field-dws-user-status',
      'field-ads-report-status',
    ])
  })

  it('计算跨实体的最终爆炸半径', () => {
    const blastRadius = getBlastRadius(nodes, edges, 'field-dwd-order-status', {
      includeCrossEntity: true,
    })

    expect(blastRadius.total).toBeGreaterThan(blastRadius.byType.field)
    expect(blastRadius.byType.task).toBeGreaterThan(0)
    expect(blastRadius.byType.table).toBeGreaterThan(0)
    expect(blastRadius.byType.metric).toBeGreaterThan(0)
  })

  it('保留边的关系、证据和置信度', () => {
    const sqlEdge = edges.find(
      (edge) => edge.source === 'ods-order' && edge.target === 'dwd-order-detail',
    )

    expect(sqlEdge).toBeDefined()
    expect(getLineageEdgeEvidence(sqlEdge!).source).toBe('sql_transformation')
    expect(getLineageEdgeConfidence(sqlEdge!)).toBe('confirmed')
  })

  it('生成字段变更到目标指标的调查路径', () => {
    const event = visualization.investigationEvent
    if (!event) {
      throw new Error('血缘测试需要字段变更调查事件')
    }

    const path = getLineagePath(nodes, edges, event.sourceEntityId, event.affectedEntityId)
    const result = analyzeLineageInvestigation(nodes, edges, event)

    expect(path).not.toBeNull()
    expect(path?.nodeIds[0]).toBe(event.sourceEntityId)
    expect(path?.nodeIds[path.nodeIds.length - 1]).toBe(event.affectedEntityId)
    expect(path?.nodeIds.some((nodeId) => nodeId.startsWith('task-'))).toBe(true)
    expect(result.impact.directDownstream).toContain('task-build-order-detail')
    expect(result.blastRadius.nodeIds).toContain(event.affectedEntityId)
    expect(result.path?.edges.every((edge) => edge.evidence && edge.confidence)).toBe(true)
  })
})
