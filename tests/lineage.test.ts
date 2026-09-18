import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LineageGraph } from '../src/components/visualizations/LineageGraph'
import { OverviewQuestion } from '../src/components/visualizations/LineageTeachingLab'
import { depositBalanceQualityEvent } from '../src/content/lessons/data-quality'
import {
  BANKING_LINEAGE_NODE_IDS,
  BANKING_LINEAGE_TASK_NODE_IDS,
  bankingEvidenceRecords,
  bankingFieldDependencies,
  bankingLineageEdges,
  bankingLineageNodes,
  bankingRootCauseCandidates,
  bankingTaskDependencyExample,
} from '../src/features/lineage/banking'
import { qualityEventToLineageInvestigation } from '../src/features/lineage/quality-adapter'
import { getLineageTaskNodeId, getLineageTableNodeId } from '../src/features/lineage/mapping'
import { BANKING_SCHEDULER_TASK_IDS } from '../src/features/scheduler/banking'
import { QUALITY_RULE_IDS } from '../src/utils/data-quality'
import { dataLineageContent } from '../src/content/lessons/data-lineage'
import { dataLineageEvidenceContent } from '../src/content/lessons/data-lineage-evidence'
import { dataLineageFieldsContent } from '../src/content/lessons/data-lineage-fields'
import { dataLineageImpactContent } from '../src/content/lessons/data-lineage-impact'
import { dataLineageInvestigationContent } from '../src/content/lessons/data-lineage-investigation'
import {
  analyzeLineageInvestigation,
  getBlastRadius,
  getDirectDownstreamNodes,
  getDirectUpstreamNodes,
  getInvestigationDecision,
  getLineageEdgeEvidence,
  getLineageEdgeEvidenceSource,
  getLineageEdgeVerificationStatus,
  getLineageEdgeGeometry,
  getLineageImpactSummary,
  getLineagePath,
  getLineageRelationVisual,
  LINEAGE_RELATION_VISUALS,
  getLineageView,
  getDownstreamNodes,
  getUpstreamNodes,
} from '../src/utils/lineage'

const { nodes, edges } = {
  nodes: bankingLineageNodes,
  edges: bankingLineageEdges,
}

const lineageContents = [
  dataLineageContent,
  dataLineageFieldsContent,
  dataLineageInvestigationContent,
  dataLineageImpactContent,
  dataLineageEvidenceContent,
]

function getVisualizationModes() {
  return lineageContents.map((content) => {
    const section = content.sections.find((candidate) => candidate.kind === 'visualization')

    if (section?.kind !== 'visualization' || section.visualization.kind !== 'lineage') {
      throw new Error('Expected a lineage visualization section')
    }

    return section.visualization
  })
}

describe('Pilot B lineage visual grammar', () => {
  it('maps each base relation without using impact focus as a replacement relation', () => {
    expect(LINEAGE_RELATION_VISUALS).toMatchObject({
      transform: { kind: 'data-transform', marker: 'filled-arrow', linePattern: 'solid' },
      derives: { kind: 'field-derivation', marker: 'open-arrow', linePattern: 'solid' },
      depends_on: { kind: 'control-dependency', marker: 'open-arrow', linePattern: 'long-dash' },
      consumes: { kind: 'delivery-consume', marker: 'diamond', linePattern: 'solid' },
    })
    expect(getLineageRelationVisual('depends_on').direction).toContain('前置条件')
    expect(getLineageRelationVisual('consumes').label).toContain('发布')
  })

  it('clips SVG connectors to the node boundary and keeps the real direction', () => {
    const source = { x: 380, y: 180 }
    const target = { x: 380, y: 280 }
    const geometry = getLineageEdgeGeometry(source, target)

    expect(geometry.sourcePoint).toEqual({ x: 380, y: 213.5 })
    expect(geometry.targetPoint).toEqual({ x: 380, y: 246.5 })
    expect(geometry.midpoint).toEqual({ x: 380, y: 230 })
    expect(geometry.path).toContain('M 380 213.5 L 380 246.5')
  })

  it('keeps base relation data while exposing direct path focus in legacy SVG markup', () => {
    const markup = renderToStaticMarkup(React.createElement(LineageGraph, { nodes, edges }))

    expect(markup).toContain('data-diagram-type="dependency"')
    expect(markup).toContain('data-relation="transform"')
    expect(markup).toContain('data-relation-kind="data-transform"')
    expect(markup).toContain('data-impact-focus="direct"')
    expect(markup).toContain('lineage-edge--data-transform')
    expect(markup).toContain('直接路径')
    expect(markup).toContain('Node 类型')
  })

  it('keeps evidence source, verification, and teaching impact levels independent', () => {
    const evidenceVisualization = getVisualizationModes().find(
      (visualization) => visualization.teaching?.mode === 'evidence',
    )
    const impactVisualization = getVisualizationModes().find(
      (visualization) => visualization.teaching?.mode === 'impact',
    )

    expect(evidenceVisualization?.teaching).toBeDefined()
    expect(impactVisualization?.teaching).toBeDefined()

    const evidenceMarkup = renderToStaticMarkup(
      React.createElement(LineageGraph, {
        nodes,
        edges,
        teaching: evidenceVisualization?.teaching,
      }),
    )
    const impactMarkup = renderToStaticMarkup(
      React.createElement(LineageGraph, {
        nodes,
        edges,
        teaching: impactVisualization?.teaching,
      }),
    )

    expect(evidenceMarkup).toContain('data-verification-status="pending"')
    expect(evidenceMarkup).toContain('人工登记')
    expect(evidenceMarkup).toContain('待确认')
    expect(impactMarkup).toContain('data-focus="context"')
    expect(impactMarkup).toContain('直接下游')
    expect(impactMarkup).toContain('传递影响')
  })

  it('keeps all four node types readable in the teaching entrance', () => {
    const teaching = getVisualizationModes()[0].teaching
    if (!teaching) {
      throw new Error('Expected overview teaching configuration')
    }
    const allNodeIds = nodes.map((node) => node.id)
    const typeTeaching = {
      ...teaching,
      tableNodeIds: allNodeIds,
      overviewNodeIds: allNodeIds,
      initialNodeId: allNodeIds[0] ?? '',
    }

    const markup = renderToStaticMarkup(
      React.createElement(LineageGraph, { nodes, edges, teaching: typeTeaching }),
    )

    expect(markup).toContain('data-node-type="table"')
    expect(markup).toContain('data-node-type="metric"')
    expect(markup).toContain('▣')
    expect(markup).toContain('●')
  })
})

describe('第 07 章数据血缘', () => {
  it('拆分为 7-1 到 7-5，并统一使用银行存款余额链路', () => {
    expect(
      lineageContents.map((content) => content.sections.map((section) => section.kind)),
    ).toEqual([
      ['visualization'],
      ['visualization'],
      ['visualization'],
      ['visualization'],
      ['visualization'],
    ])
    expect(getVisualizationModes().map((visualization) => visualization.kind)).toEqual([
      'lineage',
      'lineage',
      'lineage',
      'lineage',
      'lineage',
    ])
    expect(getVisualizationModes().map((visualization) => visualization.teaching?.mode)).toEqual([
      'overview',
      'field-dependencies',
      'investigation',
      'impact',
      'evidence',
    ])
    expect(dataLineageContent.visualization).toBeUndefined()
    expect(nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining([
        'AccountBalanceSnapshot',
        'dwd_account_balance_detail',
        'dws_deposit_balance_daily',
        'ads_deposit_balance',
        '存款余额指标',
      ]),
    )
  })

  it('保留表级链路的直接、传递上游和最终影响', () => {
    expect(getUpstreamNodes(nodes, edges, BANKING_LINEAGE_NODE_IDS.dwd)).toEqual([
      BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
      BANKING_LINEAGE_NODE_IDS.account,
      BANKING_LINEAGE_NODE_IDS.customer,
      BANKING_LINEAGE_NODE_IDS.product,
      BANKING_LINEAGE_NODE_IDS.branch,
    ])
    expect(getDirectDownstreamNodes(edges, BANKING_LINEAGE_NODE_IDS.dwd)).toEqual([
      BANKING_LINEAGE_NODE_IDS.dws,
    ])
    expect(
      getDownstreamNodes(nodes, edges, BANKING_LINEAGE_NODE_IDS.dwd, { includeCrossEntity: true }),
    ).toEqual([
      BANKING_LINEAGE_NODE_IDS.dws,
      BANKING_LINEAGE_NODE_IDS.ads,
      BANKING_LINEAGE_NODE_IDS.metric,
    ])
    expect(
      getLineageImpactSummary(nodes, edges, BANKING_LINEAGE_NODE_IDS.dwd, {
        includeCrossEntity: true,
      }),
    ).toMatchObject({
      upstream: expect.arrayContaining([BANKING_LINEAGE_NODE_IDS.branch]),
      directDownstream: [BANKING_LINEAGE_NODE_IDS.dws],
      transitiveDownstream: [
        BANKING_LINEAGE_NODE_IDS.dws,
        BANKING_LINEAGE_NODE_IDS.ads,
        BANKING_LINEAGE_NODE_IDS.metric,
      ],
    })
  })

  it('能够切换银行 LineageGraph 的表级视图，并保留跨实体爆炸半径算法', () => {
    const tableView = getLineageView(nodes, edges, 'table')
    const blastRadius = getBlastRadius(nodes, edges, BANKING_LINEAGE_NODE_IDS.dwd, {
      includeCrossEntity: true,
    })

    expect(tableView.nodes).toHaveLength(8)
    expect(tableView.edges).toHaveLength(7)
    expect(tableView.nodes.every((node) => node.entityType === 'table')).toBe(true)
    expect(blastRadius.nodeIds).toEqual([
      BANKING_LINEAGE_NODE_IDS.dws,
      BANKING_LINEAGE_NODE_IDS.ads,
      BANKING_LINEAGE_NODE_IDS.metric,
    ])
    expect(blastRadius.byType.metric).toBe(1)
  })

  it('表达字段级 SUM、rename、FILTER 和 JOIN 依赖', () => {
    expect(bankingFieldDependencies.map((dependency) => dependency.operation)).toEqual([
      'SUM',
      'rename',
      'FILTER',
      'JOIN',
    ])
    expect(bankingFieldDependencies[0]).toMatchObject({
      sourceFields: ['dwd_account_balance_detail.balance'],
      targetFields: ['dws_deposit_balance_daily.deposit_balance'],
      evidenceSource: 'sql_transformation',
      verificationStatus: 'confirmed',
    })
    expect(bankingFieldDependencies[3]?.detail).toContain('Branch.branch_id')
  })

  it('把任务依赖和数据依赖放在同一课程但保持边界清楚', () => {
    expect(bankingTaskDependencyExample).toMatchObject({
      upstreamTaskId: BANKING_LINEAGE_TASK_NODE_IDS.dwd,
      downstreamTaskId: BANKING_LINEAGE_TASK_NODE_IDS.dws,
      evidenceSource: 'task_dependency',
      verificationStatus: 'confirmed',
    })
    expect(getLineageTaskNodeId(BANKING_SCHEDULER_TASK_IDS.dws)).toBe(
      BANKING_LINEAGE_TASK_NODE_IDS.dws,
    )
    expect(getLineageTableNodeId('dws_deposit_balance_daily')).toBe(BANKING_LINEAGE_NODE_IDS.dws)
  })

  it('把第 06 章 QualityEvent 适配为近到远调查入口', () => {
    expect(depositBalanceQualityEvent).toMatchObject({
      ruleId: QUALITY_RULE_IDS.reconciliation,
      status: 'fail',
      severity: 'critical',
      target: {
        table: 'dws_deposit_balance_daily',
        field: 'balance',
        partition: { column: 'business_date', value: '2026-09-30' },
      },
      schedulerContext: {
        taskId: BANKING_SCHEDULER_TASK_IDS.dws,
        outputTable: 'dws_deposit_balance_daily',
        schedulerOutputTable: 'dws_deposit_balance_daily',
      },
    })

    const first = qualityEventToLineageInvestigation(depositBalanceQualityEvent)
    const second = qualityEventToLineageInvestigation(depositBalanceQualityEvent)

    expect(second).toEqual(first)
    expect(first).toMatchObject({
      entryPoint: 'quality-event',
      eventType: 'quality_alert',
      sourceEntityId: BANKING_LINEAGE_NODE_IDS.dws,
      affectedEntityId: BANKING_LINEAGE_NODE_IDS.metric,
      evidence: { source: 'quality_event' },
      context: {
        taskId: BANKING_SCHEDULER_TASK_IDS.dws,
        runId: depositBalanceQualityEvent.schedulerContext.runId,
        businessDate: '2026-09-30',
        status: 'success',
      },
      qualityEvent: depositBalanceQualityEvent,
    })
    expect(first.rootCauseCandidates).toHaveLength(3)
    expect(first.rootCauseCandidate).toMatchObject({
      entityId: BANKING_LINEAGE_NODE_IDS.dwd,
      kind: 'value-source',
      verificationStatus: 'pending',
    })
    expect(first.summary).toContain('直接上游')
  })

  it('候选根因来自真实关系，但保持待验证状态', () => {
    expect(bankingRootCauseCandidates.map((candidate) => candidate.evidenceSource)).toEqual([
      'sql_transformation',
      'sql_transformation',
      'sql_transformation',
    ])
    expect(
      bankingRootCauseCandidates.every((candidate) => candidate.verificationStatus === 'pending'),
    ).toBe(true)
    expect(bankingRootCauseCandidates[1]?.rationale).toContain('不是已经证明的根因')
    expect(bankingEvidenceRecords.at(-1)).toMatchObject({
      evidenceSource: 'manual_metadata',
      verificationStatus: 'pending',
    })
  })

  it('调查结果区分直接下游、传递影响和最终指标消费者', () => {
    const event = qualityEventToLineageInvestigation(depositBalanceQualityEvent)
    const result = analyzeLineageInvestigation(nodes, edges, event)

    expect(result.impact.directDownstream).toEqual([BANKING_LINEAGE_NODE_IDS.ads])
    expect(result.impact.finalImpact).toEqual([
      BANKING_LINEAGE_NODE_IDS.ads,
      BANKING_LINEAGE_NODE_IDS.metric,
    ])
    expect(result.blastRadius.byType.metric).toBe(1)
    expect(result.path?.nodeIds).toEqual([
      BANKING_LINEAGE_NODE_IDS.dws,
      BANKING_LINEAGE_NODE_IDS.ads,
      BANKING_LINEAGE_NODE_IDS.metric,
    ])
    expect(result.rootCauseCandidates).toHaveLength(3)
  })

  it('使用 Banking Teaching Domain Scheduler identity 映射到银行血缘节点', () => {
    expect(getLineageTaskNodeId(BANKING_SCHEDULER_TASK_IDS.dwd)).toBe(
      BANKING_LINEAGE_TASK_NODE_IDS.dwd,
    )
    expect(getLineageTableNodeId('dws_deposit_balance_daily')).toBe(BANKING_LINEAGE_NODE_IDS.dws)
  })

  it('提供近到远调查分支，并让每条边带证据来源和确认状态', () => {
    expect(getInvestigationDecision('normal')).toBe('inspect-current-transform')
    expect(getInvestigationDecision('abnormal')).toBe('expand-upstream')
    expect(getDirectUpstreamNodes(edges, BANKING_LINEAGE_NODE_IDS.dws)).toEqual([
      BANKING_LINEAGE_NODE_IDS.dwd,
    ])
    expect(
      edges.every(
        (edge) =>
          getLineageEdgeEvidence(edge).source === 'sql_transformation' ||
          edge.target === BANKING_LINEAGE_NODE_IDS.metric,
      ),
    ).toBe(true)
    expect(edges.every((edge) => getLineageEdgeEvidenceSource(edge) === edge.evidenceSource)).toBe(
      true,
    )
    expect(edges.every((edge) => getLineageEdgeVerificationStatus(edge) === 'confirmed')).toBe(true)
    expect(
      getLineagePath(
        nodes,
        edges,
        BANKING_LINEAGE_NODE_IDS.dws,
        BANKING_LINEAGE_NODE_IDS.metric,
      )?.edges.every((edge) => edge.evidence && edge.verificationStatus),
    ).toBe(true)
  })

  it('读图单选题只高亮选中的选项，错误时不将正确答案和错误选项同时标为选中', () => {
    const question = {
      id: 'dws-direct-upstream',
      prompt: 'DWS 的直接上游是谁？',
      options: [
        { id: 'dwd', label: 'dwd_account_balance_detail' },
        { id: 'snapshot', label: 'AccountBalanceSnapshot' },
        { id: 'ads', label: 'ads_deposit_balance' },
      ],
      correctAnswer: 'dwd',
      explanation: 'DWD 紧挨着 DWS；AccountBalanceSnapshot 还隔着一层，是传递上游。',
    }

    // 未作答状态
    const initialMarkup = renderToStaticMarkup(
      React.createElement(OverviewQuestion, { question, onAnswer: () => {} }),
    )
    expect(initialMarkup).toContain('role="radiogroup"')
    expect(initialMarkup).not.toContain('is-selected')
    expect(initialMarkup).not.toContain('is-correct')
    expect(initialMarkup).not.toContain('is-incorrect')
    expect(initialMarkup).toContain('请选择一个判断。')

    // 选中错误选项：只高亮选中的错误项，正确项不应同时被高亮选中
    const wrongMarkup = renderToStaticMarkup(
      React.createElement(OverviewQuestion, { question, answer: 'snapshot', onAnswer: () => {} }),
    )
    expect(wrongMarkup).toContain('role="radiogroup"')
    // 只有 snapshot 带有 is-selected 和 is-incorrect
    expect(wrongMarkup).toContain('AccountBalanceSnapshot')
    expect(wrongMarkup).toMatch(
      /class="[^"]*lineage-teaching-choice is-selected is-incorrect[^"]*"[^>]*aria-checked="true"[^>]*>AccountBalanceSnapshot/,
    )
    // dwd 不应该有 is-selected 或 is-correct
    expect(wrongMarkup).toMatch(
      /class="lineage-teaching-choice"[^>]*aria-checked="false"[^>]*>dwd_account_balance_detail/,
    )
    // 反馈带有 is-error
    expect(wrongMarkup).toContain('lineage-teaching-feedback is-error')
    expect(wrongMarkup).toContain('还差一步，看看标出的关系。')

    // 选中正确选项：只高亮选中的正确项
    const correctMarkup = renderToStaticMarkup(
      React.createElement(OverviewQuestion, { question, answer: 'dwd', onAnswer: () => {} }),
    )
    expect(correctMarkup).toMatch(
      /class="[^"]*lineage-teaching-choice is-selected is-correct[^"]*"[^>]*aria-checked="true"[^>]*>dwd_account_balance_detail/,
    )
    expect(correctMarkup).toMatch(
      /class="lineage-teaching-choice"[^>]*aria-checked="false"[^>]*>AccountBalanceSnapshot/,
    )
    expect(correctMarkup).toContain('lineage-teaching-feedback is-success')
    expect(correctMarkup).toContain('判断正确。')
  })
})
