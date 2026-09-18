import {
  BANKING_LINEAGE_NODE_IDS,
  bankingEvidenceRecords,
  bankingFieldDependencies,
  bankingLineageEdges,
  bankingLineageNodes,
  bankingRootCauseCandidates,
  bankingTableNodeIds,
  bankingTaskDependencyExample,
} from '../../features/lineage/banking'
import type { LineageTeachingConfig } from '../../features/lineage/types'
import { depositBalanceQualityEvent } from './data-quality'

const tableNodeIds = bankingTableNodeIds

export function createLineageVisualization(teaching: LineageTeachingConfig) {
  return {
    kind: 'lineage' as const,
    nodes: bankingLineageNodes,
    edges: bankingLineageEdges,
    teaching,
  }
}

const overviewNodeIds = [
  BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
  BANKING_LINEAGE_NODE_IDS.dwd,
  BANKING_LINEAGE_NODE_IDS.dws,
  BANKING_LINEAGE_NODE_IDS.ads,
  BANKING_LINEAGE_NODE_IDS.metric,
]

export const overviewTeaching: LineageTeachingConfig = {
  mode: 'overview',
  tableNodeIds: overviewNodeIds,
  overviewNodeIds,
  initialNodeId: BANKING_LINEAGE_NODE_IDS.dwd,
  taskDependency: bankingTaskDependencyExample,
}

export const fieldTeaching: LineageTeachingConfig = {
  mode: 'field-dependencies',
  tableNodeIds,
  fieldDependencies: bankingFieldDependencies,
}

const investigationConfig = {
  anomalyNodeId: BANKING_LINEAGE_NODE_IDS.dws,
  upstreamExpansionNodeIds: [
    BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
    BANKING_LINEAGE_NODE_IDS.account,
    BANKING_LINEAGE_NODE_IDS.branch,
    BANKING_LINEAGE_NODE_IDS.product,
  ],
  transformationChecks: [
    'SUM 的输入集合和 GROUP BY 维度',
    'balance → deposit_balance 字段别名',
    'Branch.branch_id JOIN 是否丢行',
    'Product.product_type FILTER 是否变化',
    'snapshot_date 与执行参数是否一致',
  ],
  qualityEvent: depositBalanceQualityEvent,
  candidates: bankingRootCauseCandidates,
} satisfies NonNullable<LineageTeachingConfig['investigation']>

export const investigationTeaching: LineageTeachingConfig = {
  mode: 'investigation',
  tableNodeIds,
  initialNodeId: BANKING_LINEAGE_NODE_IDS.dws,
  investigation: investigationConfig,
}

export const impactTeaching: LineageTeachingConfig = {
  mode: 'impact',
  tableNodeIds,
  impact: {
    sourceNodeId: BANKING_LINEAGE_NODE_IDS.dwd,
    choiceNodeIds: [
      BANKING_LINEAGE_NODE_IDS.dws,
      BANKING_LINEAGE_NODE_IDS.ads,
      BANKING_LINEAGE_NODE_IDS.metric,
      BANKING_LINEAGE_NODE_IDS.branch,
      BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
    ],
    expectedDirectNodeIds: [BANKING_LINEAGE_NODE_IDS.dws],
    expectedTransitiveNodeIds: [
      BANKING_LINEAGE_NODE_IDS.dws,
      BANKING_LINEAGE_NODE_IDS.ads,
      BANKING_LINEAGE_NODE_IDS.metric,
    ],
    finalMetricNodeId: BANKING_LINEAGE_NODE_IDS.metric,
    affectedMetricLabel: '存款余额指标',
  },
}

export const evidenceTeaching: LineageTeachingConfig = {
  mode: 'evidence',
  tableNodeIds,
  evidenceRecords: bankingEvidenceRecords,
}
