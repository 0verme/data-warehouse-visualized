import type { LessonContent, LessonVisualizationSection } from '../types'
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
import { qualityEventAdapter } from '../../features/lineage/quality-adapter'
import type { LineageTeachingConfig } from '../../features/lineage/types'
import { depositBalanceQualityEvent } from './data-quality'

const qualityLineageInvestigation = qualityEventAdapter.toInvestigationEvent(
  depositBalanceQualityEvent,
)

const tableNodeIds = bankingTableNodeIds

function createLineageVisualization(teaching: LineageTeachingConfig) {
  return {
    kind: 'lineage' as const,
    nodes: bankingLineageNodes,
    edges: bankingLineageEdges,
    investigationEvent: qualityLineageInvestigation,
    investigationEvents: [qualityLineageInvestigation],
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

const overviewTeaching: LineageTeachingConfig = {
  mode: 'overview',
  tableNodeIds: overviewNodeIds,
  overviewNodeIds,
  initialNodeId: BANKING_LINEAGE_NODE_IDS.dwd,
  taskDependency: bankingTaskDependencyExample,
}

const fieldTeaching: LineageTeachingConfig = {
  mode: 'field-dependencies',
  tableNodeIds,
  fieldDependencies: bankingFieldDependencies,
}

const investigationConfig = {
  anomalyNodeId: BANKING_LINEAGE_NODE_IDS.dws,
  directUpstreamNodeIds: [BANKING_LINEAGE_NODE_IDS.dwd],
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
  evidenceRecordIds: bankingEvidenceRecords.map((record) => record.id),
} satisfies NonNullable<LineageTeachingConfig['investigation']>

const investigationTeaching: LineageTeachingConfig = {
  mode: 'investigation',
  tableNodeIds,
  initialNodeId: BANKING_LINEAGE_NODE_IDS.dws,
  investigation: investigationConfig,
}

const impactTeaching: LineageTeachingConfig = {
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

const evidenceTeaching: LineageTeachingConfig = {
  mode: 'evidence',
  tableNodeIds,
  evidenceRecords: bankingEvidenceRecords,
}

const lineageSections: LessonVisualizationSection[] = [
  {
    kind: 'visualization',
    eyebrow: '8-1 · 表级血缘',
    title: '这份数据到底从哪里来？',
    description:
      '先读一条统一的银行存款余额链路：AccountBalanceSnapshot 等输入经过 dwd_account_balance_detail，汇总到 dws_deposit_balance_daily，再发布到 ads_deposit_balance，最后被存款余额指标消费。点击对象，比较直接上游、传递上游和下游影响。',
    visualization: createLineageVisualization(overviewTeaching),
  },
  {
    kind: 'visualization',
    eyebrow: '8-2 · 字段级血缘',
    title: '只知道上游表，为什么还不够？',
    description:
      '沿 dwd_account_balance_detail → dws_deposit_balance_daily 下钻。余额值、字段重命名、产品过滤和机构 JOIN 都可能影响结果，但它们在链路中的作用不同；选择一个关系，沿字段路径查看证据。',
    visualization: createLineageVisualization(fieldTeaching),
  },
  {
    kind: 'visualization',
    eyebrow: '8-3 · 质量事件调查',
    title: '质量告警以后，哪些上游值得先查？',
    description: `第 07 章留下的质量事件在 ${depositBalanceQualityEvent.target.table}.${depositBalanceQualityEvent.target.field} 上发现 delta = ${depositBalanceQualityEvent.observedValue}，因此 Release BLOCKED。先检查 DWD 这个直接上游：如果 DWD 正常，停在当前转换；如果 DWD 已异常，再向 AccountBalanceSnapshot、Account、Branch、Product 展开。`,
    visualization: createLineageVisualization(investigationTeaching),
  },
  {
    kind: 'visualization',
    eyebrow: '8-4 · 变更影响范围',
    title: '如果这里出问题，会影响哪些下游？',
    description:
      '先预测直接下游，再逐层展开 Blast Radius。dws_deposit_balance_daily 是第一轮验证对象，ads_deposit_balance 和存款余额指标是传递影响；最终数字的消费者也属于变更评审范围。',
    visualization: createLineageVisualization(impactTeaching),
  },
  {
    kind: 'visualization',
    eyebrow: '8-5 · 证据与边界',
    title: '图上的这条箭头，凭什么相信？',
    description:
      '回看 SQL、任务配置、指标定义和人工登记四类关系证据。来源回答“证据从哪里来”，确认状态回答“现在能不能相信”；pending 的关系可以帮助调查，但不能替代独立验证。',
    visualization: createLineageVisualization(evidenceTeaching),
  },
]

export const dataLineageContent: LessonContent = {
  eyebrow: '第 08 课 · 数据血缘',
  subtitle: '沿统一的银行存款余额链路，定位质量异常、评估变更影响，并为每条关系找到可核对的证据。',
  quickSummary:
    '数据血缘描述数据对象之间的来源、加工和消费关系。它能安排调查顺序和变更影响范围，但血缘关系本身不等于业务根因证明。',
  concept: {
    term: '数据血缘',
    definition:
      '描述数据对象之间来源、加工和消费关系的依赖信息。表级关系帮助定位链路，字段级关系帮助解释转换，证据状态帮助区分已确认和待验证的关系。',
  },
  sections: lineageSections,
  visualization: createLineageVisualization(overviewTeaching),
  code: {
    label: '一个需要血缘的问题',
    language: 'sql',
    code: `-- 修改余额字段前，先确认直接下游和最终指标消费者
SELECT source_field, target_field, operation, evidence_source, verification_status
FROM lineage_field_dependencies
WHERE source_field = 'dwd_account_balance_detail.balance';`,
  },
  engineeringTip:
    '生产排错时，先把 Quality Event 的业务日期、目标分区、任务运行实例和发布决定固定下来，再沿近到远的血缘路径安排检查。',
  pitfalls: [
    '直接上游和传递上游是相对当前对象而言的；换一个对象，调查范围也会改变。',
    'Task dependency 说明任务先后，data lineage 说明数据来源；两者不能互相替代。',
    'Root-cause candidate 只是基于血缘关系的复核优先级，仍需要数据 Diff、执行参数、SQL 版本、任务日志或业务变更记录证明。',
    '关系的 evidence source 与 verification status 是两个字段；人工登记的关系必须保留待确认状态。',
  ],
}

export { qualityLineageInvestigation }
