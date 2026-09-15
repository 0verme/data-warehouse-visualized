import { describe, expect, it } from 'vitest'
import type { LineageProductionNode } from '../src/features/lineage/types'
import { dataLineageContent } from '../src/content/lessons/data-lineage'
import { SCHEDULER_TASK_IDS } from '../src/utils/scheduler'
import {
  analyzeLineageInvestigation,
  getBlastRadius,
  getDownstreamNodes,
  getImpactAnalysis,
  getLineageEdgeConfidence,
  getLineageEdgeEvidence,
  getLineageImpactSummary,
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

  it('把 SQL transformation 和 Scheduler task contract 绑定到同一条生产链', () => {
    const dwdTask = nodes.find((node) => node.id === 'task-build-order-detail')
    const sqlEdge = edges.find(
      (edge) => edge.source === 'task-build-order-detail' && edge.target === 'dwd-order-detail',
    )
    const taskEdge = edges.find(
      (edge) => edge.source === 'dwd-order-detail' && edge.target === 'task-build-sales',
    )
    const manualEdge = edges.find(
      (edge) => edge.source === 'task-build-user' && edge.target === 'dws-user',
    )

    expect(dwdTask?.role).toContain(SCHEDULER_TASK_IDS.dwd)
    expect((dwdTask as LineageProductionNode | undefined)?.schedulerTaskId).toBe(
      SCHEDULER_TASK_IDS.dwd,
    )
    expect(getLineageEdgeEvidence(sqlEdge!).detail).toContain('SQL transformation')
    expect(getLineageEdgeEvidence(sqlEdge!).detail).toContain(SCHEDULER_TASK_IDS.dwd)
    expect(getLineageEdgeEvidence(taskEdge!).detail).toContain(SCHEDULER_TASK_IDS.dws)
    expect(getLineageEdgeEvidence(manualEdge!).source).toBe('manual_metadata')
    expect(edges.every((edge) => edge.evidence && edge.confidence)).toBe(true)
  })

  it('提供字段语义变化、schema change 和 task failure 三个真实调查入口', () => {
    const events = visualization.investigationEvents ?? []

    expect(events.map((event) => event.entryPoint)).toEqual([
      'field-semantic-change',
      'schema-change',
      'task-failure',
    ])

    const taskFailure = events.find((event) => event.entryPoint === 'task-failure')
    expect(taskFailure).toMatchObject({
      sourceEntityId: 'task-build-order-detail',
      eventType: 'task_failure',
      evidence: { source: 'task_dependency' },
      context: {
        taskId: SCHEDULER_TASK_IDS.dwd,
        status: 'failed',
        outputState: 'not-produced',
      },
    })
    expect(taskFailure?.context?.runId).toBe('run.sales.daily.20260913.schedule.001')
    expect(taskFailure?.context?.attempt).toBe(2)
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

  it('task failure 调查区分直接下游、传递下游与最终 blast radius', () => {
    const event = visualization.investigationEvents?.find(
      (candidate) => candidate.entryPoint === 'task-failure',
    )
    if (!event) {
      throw new Error('血缘测试需要 task failure 调查事件')
    }

    const result = analyzeLineageInvestigation(nodes, edges, event)
    const summary = getLineageImpactSummary(nodes, edges, event.sourceEntityId, {
      includeCrossEntity: true,
    })

    expect(summary.transitiveDownstream).toEqual(result.impact.finalImpact)
    expect(summary.finalBlastRadius).toEqual(result.blastRadius)
    expect(result.impact.directDownstream).toEqual([
      'dwd-order-detail',
      'task-build-sales',
      'task-build-user',
    ])
    expect(result.impact.finalImpact).toContain('metric-report-status')
    expect(result.blastRadius.byType.metric).toBeGreaterThan(0)
    expect(result.path?.nodeIds[0]).toBe(event.sourceEntityId)
    expect(result.path?.nodeIds.at(-1)).toBe(event.affectedEntityId)
  })
})
