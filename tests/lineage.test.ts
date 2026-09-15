import { describe, expect, it } from 'vitest'
import type { LineageProductionNode } from '../src/features/lineage/types'
import { qualityEventToLineageInvestigation } from '../src/features/lineage/quality-adapter'
import { dataLineageContent } from '../src/content/lessons/data-lineage'
import { dataQualityVisualization } from '../src/content/lessons/data-quality'
import { QUALITY_RULE_IDS, evaluateDataQuality } from '../src/utils/data-quality'
import { BANKING_SCHEDULER_TASK_IDS } from '../src/features/scheduler/banking'
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
    expect(getUpstreamNodes(nodes, edges, 'dwd-deposit-balance')).toEqual(['ods-account-balance'])
    expect(getDownstreamNodes(nodes, edges, 'dwd-deposit-balance')).toEqual([
      'dws-deposit-balance',
      'dws-account-profile',
      'ads-deposit-balance',
    ])
    expect(getImpactAnalysis(nodes, edges, 'dwd-deposit-balance')).toEqual({
      upstream: ['ods-account-balance'],
      directDownstream: ['dws-deposit-balance', 'dws-account-profile'],
      finalImpact: ['dws-deposit-balance', 'dws-account-profile', 'ads-deposit-balance'],
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
    const analysis = getImpactAnalysis(fieldView.nodes, fieldView.edges, 'field-dwd-balance')

    expect(analysis.directDownstream).toEqual(['field-dws-balance', 'field-dws-account-scope'])
    expect(analysis.finalImpact).toEqual([
      'field-dws-balance',
      'field-dws-account-scope',
      'field-ads-balance',
    ])
  })

  it('计算跨实体的最终爆炸半径', () => {
    const blastRadius = getBlastRadius(nodes, edges, 'field-dwd-balance', {
      includeCrossEntity: true,
    })

    expect(blastRadius.total).toBeGreaterThan(blastRadius.byType.field)
    expect(blastRadius.byType.task).toBeGreaterThan(0)
    expect(blastRadius.byType.table).toBeGreaterThan(0)
    expect(blastRadius.byType.metric).toBeGreaterThan(0)
  })

  it('保留边的关系、证据和置信度', () => {
    const sqlEdge = edges.find(
      (edge) => edge.source === 'ods-account-balance' && edge.target === 'dwd-deposit-balance',
    )

    expect(sqlEdge).toBeDefined()
    expect(getLineageEdgeEvidence(sqlEdge!).source).toBe('sql_transformation')
    expect(getLineageEdgeConfidence(sqlEdge!)).toBe('confirmed')
  })

  it('把 SQL transformation 和 Scheduler task contract 绑定到同一条生产链', () => {
    const dwdTask = nodes.find((node) => node.id === 'task-build-deposit-detail')
    const sqlEdge = edges.find(
      (edge) =>
        edge.source === 'task-build-deposit-detail' && edge.target === 'dwd-deposit-balance',
    )
    const taskEdge = edges.find(
      (edge) => edge.source === 'dwd-deposit-balance' && edge.target === 'task-build-deposit-topic',
    )
    const manualEdge = edges.find(
      (edge) =>
        edge.source === 'task-build-account-profile' && edge.target === 'dws-account-profile',
    )

    expect(dwdTask?.role).toContain(BANKING_SCHEDULER_TASK_IDS.dwd)
    expect((dwdTask as LineageProductionNode | undefined)?.schedulerTaskId).toBe(
      BANKING_SCHEDULER_TASK_IDS.dwd,
    )
    expect(getLineageEdgeEvidence(sqlEdge!).detail).toContain('SQL transformation')
    expect(getLineageEdgeEvidence(sqlEdge!).detail).toContain(BANKING_SCHEDULER_TASK_IDS.dwd)
    expect(getLineageEdgeEvidence(taskEdge!).detail).toContain(BANKING_SCHEDULER_TASK_IDS.dws)
    expect(getLineageEdgeEvidence(manualEdge!).source).toBe('manual_metadata')
    expect(edges.every((edge) => edge.evidence && edge.confidence)).toBe(true)
  })

  it('提供字段语义变化、schema change 和 task failure 三个真实调查入口', () => {
    const events = visualization.investigationEvents ?? []

    expect(events.map((event) => event.entryPoint)).toEqual([
      'field-semantic-change',
      'schema-change',
      'task-failure',
      'quality-event',
    ])

    const taskFailure = events.find((event) => event.entryPoint === 'task-failure')
    expect(taskFailure).toMatchObject({
      sourceEntityId: 'task-build-deposit-detail',
      eventType: 'task_failure',
      evidence: { source: 'task_dependency' },
      context: {
        taskId: BANKING_SCHEDULER_TASK_IDS.dwd,
        status: 'failed',
        outputState: 'not-produced',
      },
    })
    expect(taskFailure?.context?.runId).toBe('run.deposit-balance.daily.20260930.schedule.001')
    expect(taskFailure?.context?.attempt).toBe(2)

    const qualityInvestigation = events.find((event) => event.entryPoint === 'quality-event')
    expect(qualityInvestigation?.qualityEvent).toMatchObject({
      ruleId: QUALITY_RULE_IDS.branchReference,
      target: {
        table: 'dwd_deposit_account_balance',
        field: 'branch_id',
        partition: { column: 'business_date', value: dataQualityVisualization.targetDate },
      },
      schedulerContext: { taskId: BANKING_SCHEDULER_TASK_IDS.dwd },
    })
  })

  it('把真实 QualityEvent 确定性适配为 Lineage investigation 且不丢上下文', () => {
    const evaluation = evaluateDataQuality(dataQualityVisualization, {
      injection: 'missing-branch-reference',
      action: 'block',
    })
    const qualityEvent = evaluation.events.find(
      (event) => event.ruleId === QUALITY_RULE_IDS.branchReference,
    )

    if (!qualityEvent) {
      throw new Error('测试需要第 07 课的完整性 QualityEvent')
    }

    const first = qualityEventToLineageInvestigation(qualityEvent)
    const second = qualityEventToLineageInvestigation(qualityEvent)

    expect(second).toEqual(first)
    expect(first).toMatchObject({
      entryPoint: 'quality-event',
      eventType: 'quality_alert',
      sourceEntityId: 'dwd-deposit-balance',
      affectedEntityId: 'metric-deposit-report',
      evidence: { source: 'quality_event' },
      context: {
        taskId: BANKING_SCHEDULER_TASK_IDS.dwd,
        runId: qualityEvent.schedulerContext.runId,
        businessDate: dataQualityVisualization.targetDate,
        partition: qualityEvent.target.partition,
        status: qualityEvent.schedulerContext.taskStatus,
      },
      rootCauseCandidate: {
        entityId: 'task-build-deposit-detail',
        confidence: 'inferred',
      },
      qualityEvent,
    })
    expect(first.qualityEvent?.ruleId).toBe(QUALITY_RULE_IDS.branchReference)
    expect(first.qualityEvent?.target).toEqual(qualityEvent.target)
    expect(first.qualityEvent).not.toHaveProperty('investigationContext')
    expect(first.qualityEvent?.evidence[0]?.sample?.rowKey).toBe('A003 / 2026-09-30')
  })

  it('从 Quality Event 找到可能根因并区分直接、传递和最终指标影响', () => {
    const event = visualization.investigationEvents?.find(
      (candidate) => candidate.entryPoint === 'quality-event',
    )
    if (!event) {
      throw new Error('血缘测试需要 Quality Event 调查入口')
    }

    const result = analyzeLineageInvestigation(nodes, edges, event)

    expect(result.rootCauseCandidate).toMatchObject({
      entityId: 'task-build-deposit-detail',
      confidence: 'inferred',
    })
    expect(result.impact.upstream).toContain('task-build-deposit-detail')
    expect(result.impact.directDownstream).toEqual([
      'dws-deposit-balance',
      'dws-account-profile',
      'task-build-deposit-topic',
      'task-build-account-profile',
    ])
    expect(result.impact.directDownstream).not.toContain('metric-deposit-report')
    expect(result.impact.finalImpact).toContain('metric-deposit-report')
    expect(result.blastRadius.nodeIds).toContain('ads-deposit-balance')
    expect(result.blastRadius.byType.metric).toBe(3)
    expect(result.path?.nodeIds[0]).toBe('dwd-deposit-balance')
    expect(result.path?.nodeIds.at(-1)).toBe('metric-deposit-report')
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
    expect(result.impact.directDownstream).toContain('task-build-deposit-detail')
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
      'dwd-deposit-balance',
      'task-build-deposit-topic',
      'task-build-account-profile',
    ])
    expect(result.impact.finalImpact).toContain('metric-deposit-report')
    expect(result.blastRadius.byType.metric).toBeGreaterThan(0)
    expect(result.path?.nodeIds[0]).toBe(event.sourceEntityId)
    expect(result.path?.nodeIds.at(-1)).toBe(event.affectedEntityId)
  })
})
