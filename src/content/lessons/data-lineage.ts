import type { LessonContent } from '../types'
import type { LineageEdge, LineageEvidence, LineageNode } from '../../types'
import { qualityEventAdapter } from '../../features/lineage/quality-adapter'
import { bindLineageProductionChain } from '../../features/lineage/production'
import { QUALITY_RULE_IDS, evaluateDataQuality } from '../../utils/data-quality'
import { dataQualityVisualization } from './data-quality'
import { schedulerVisualization } from './scheduling-system'
import { sqlTransformationVisualization } from './sql-and-transformation'

const sqlTransformation: LineageEvidence = {
  source: 'sql_transformation',
  detail: 'SQL 转换：SELECT / CASE 重新映射 order_status 后写入下游对象。',
}

const taskDependency: LineageEvidence = {
  source: 'task_dependency',
  detail: '任务依赖：下游任务等待上游任务成功后才消费结果。',
}

const metricDefinition: LineageEvidence = {
  source: 'metric_definition',
  detail: '指标定义：指标口径引用该对象中的 order_status 语义。',
}

const lineageNodes: LineageNode[] = [
  {
    id: 'ods-order',
    label: 'ODS.ORDER',
    layer: 'ODS',
    role: '原始订单来源',
    x: 90,
    y: 90,
    entityType: 'table',
  },
  {
    id: 'dwd-order-detail',
    label: 'DWD.ORDER_DETAIL',
    layer: 'DWD',
    role: '统一订单明细',
    x: 380,
    y: 90,
    entityType: 'table',
  },
  {
    id: 'dws-sales',
    label: 'DWS.SALES',
    layer: 'DWS',
    role: '销售主题汇总',
    x: 205,
    y: 245,
    entityType: 'table',
  },
  {
    id: 'dws-user',
    label: 'DWS.USER',
    layer: 'DWS',
    role: '用户主题汇总',
    x: 555,
    y: 245,
    entityType: 'table',
  },
  {
    id: 'ads-report',
    label: 'ADS.REPORT',
    layer: 'ADS',
    role: '经营分析报表',
    x: 380,
    y: 385,
    entityType: 'table',
  },
  {
    id: 'field-ods-order-status',
    label: 'ODS.ORDER.order_status',
    layer: 'ODS',
    role: '原始状态字段',
    x: 90,
    y: 90,
    entityType: 'field',
  },
  {
    id: 'field-dwd-order-status',
    label: 'DWD.ORDER_DETAIL.order_status',
    layer: 'DWD',
    role: '统一后的状态字段',
    x: 380,
    y: 90,
    entityType: 'field',
  },
  {
    id: 'field-dws-sales-status',
    label: 'DWS.SALES.status_group',
    layer: 'DWS',
    role: '销售状态分组',
    x: 205,
    y: 245,
    entityType: 'field',
  },
  {
    id: 'field-dws-user-status',
    label: 'DWS.USER.status_group',
    layer: 'DWS',
    role: '用户状态分组',
    x: 555,
    y: 245,
    entityType: 'field',
  },
  {
    id: 'field-ads-report-status',
    label: 'ADS.REPORT.status_summary',
    layer: 'ADS',
    role: '报表状态摘要',
    x: 380,
    y: 385,
    entityType: 'field',
  },
  {
    id: 'task-load-order',
    label: 'task.load_order',
    layer: 'TASK',
    role: '载入订单数据',
    x: 90,
    y: 90,
    entityType: 'task',
  },
  {
    id: 'task-build-order-detail',
    label: 'task.build_order_detail',
    layer: 'TASK',
    role: '生成统一明细',
    x: 380,
    y: 90,
    entityType: 'task',
  },
  {
    id: 'task-build-sales',
    label: 'task.build_sales',
    layer: 'TASK',
    role: '生成销售主题',
    x: 205,
    y: 245,
    entityType: 'task',
  },
  {
    id: 'task-build-user',
    label: 'task.build_user',
    layer: 'TASK',
    role: '生成用户主题',
    x: 555,
    y: 245,
    entityType: 'task',
  },
  {
    id: 'task-publish-report',
    label: 'task.publish_report',
    layer: 'TASK',
    role: '发布经营报表',
    x: 380,
    y: 385,
    entityType: 'task',
  },
  {
    id: 'metric-sales-status-rate',
    label: 'metric.sales_status_rate',
    layer: 'METRIC',
    role: '销售状态转化率',
    x: 205,
    y: 245,
    entityType: 'metric',
  },
  {
    id: 'metric-user-status-rate',
    label: 'metric.user_status_rate',
    layer: 'METRIC',
    role: '用户状态留存率',
    x: 555,
    y: 245,
    entityType: 'metric',
  },
  {
    id: 'metric-report-status',
    label: 'metric.report_status_summary',
    layer: 'METRIC',
    role: '报表状态摘要指标',
    x: 380,
    y: 385,
    entityType: 'metric',
  },
]

const lineageEdges: LineageEdge[] = [
  // Existing table-level graph. Keep this order to preserve the original BFS timeline.
  {
    source: 'ods-order',
    target: 'dwd-order-detail',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-order-detail',
    target: 'dws-sales',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-order-detail',
    target: 'dws-user',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'inferred',
  },
  {
    source: 'dws-sales',
    target: 'ads-report',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'dws-user',
    target: 'ads-report',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  // Cross-entity path used by the field-change investigation.
  {
    source: 'field-dwd-order-status',
    target: 'task-build-order-detail',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-order-detail',
    target: 'dwd-order-detail',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-order-detail',
    target: 'task-build-sales',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-order-detail',
    target: 'task-build-user',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-sales',
    target: 'dws-sales',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-user',
    target: 'dws-user',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dws-sales',
    target: 'metric-sales-status-rate',
    relation: 'consumes',
    evidence: metricDefinition,
    confidence: 'confirmed',
  },
  {
    source: 'dws-user',
    target: 'metric-user-status-rate',
    relation: 'consumes',
    evidence: metricDefinition,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-sales',
    target: 'field-dws-sales-status',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-user',
    target: 'field-dws-user-status',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-dws-sales-status',
    target: 'task-publish-report',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'inferred',
  },
  {
    source: 'field-dws-user-status',
    target: 'task-publish-report',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'inferred',
  },
  {
    source: 'task-publish-report',
    target: 'ads-report',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'task-publish-report',
    target: 'field-ads-report-status',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-ads-report-status',
    target: 'metric-report-status',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'confirmed',
  },
  {
    source: 'metric-sales-status-rate',
    target: 'metric-report-status',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'metric-user-status-rate',
    target: 'metric-report-status',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  // Same-entity paths make each view independently explorable.
  {
    source: 'field-ods-order-status',
    target: 'field-dwd-order-status',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-dwd-order-status',
    target: 'field-dws-sales-status',
    relation: 'derives',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-dwd-order-status',
    target: 'field-dws-user-status',
    relation: 'derives',
    evidence: sqlTransformation,
    confidence: 'inferred',
  },
  {
    source: 'field-dws-sales-status',
    target: 'field-ads-report-status',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'field-dws-user-status',
    target: 'field-ads-report-status',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'task-load-order',
    target: 'task-build-order-detail',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-order-detail',
    target: 'task-build-sales',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-order-detail',
    target: 'task-build-user',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-sales',
    target: 'task-publish-report',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'inferred',
  },
  {
    source: 'task-build-user',
    target: 'task-publish-report',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'inferred',
  },
]

const qualityEvaluation = evaluateDataQuality(dataQualityVisualization, {
  injection: 'missing-order-item',
  action: 'block',
})
const qualityEvent = qualityEvaluation.events.find(
  (event) => event.ruleId === QUALITY_RULE_IDS.completeness,
)
if (!qualityEvent) {
  throw new Error('第 08 课需要第 07 课的完整性 Quality Event 作为调查入口')
}

const qualityLineageInvestigation = qualityEventAdapter.toInvestigationEvent(qualityEvent)
const lineageProductionGraph = bindLineageProductionChain({
  baseNodes: lineageNodes,
  baseEdges: lineageEdges,
  transformation: sqlTransformationVisualization,
  scheduler: schedulerVisualization,
})

export const dataLineageContent: LessonContent = {
  eyebrow: '第 10 课 · 追踪一条数据生产链路',
  subtitle:
    '从真实 Quality Event 或 order_status 字段变更出发，定位生产任务、下游表和指标的影响范围。',
  quickSummary:
    '数据血缘把表、字段、任务和指标放进同一张可解释的依赖图；质量异常可以直接进入调查，先预测影响，再沿证据路径验证变更。',
  concept: {
    term: '数据血缘',
    definition:
      '描述数据对象之间来源、加工和消费关系的依赖信息。它提供排错和变更评审的共享上下文，但不等于业务因果。',
  },
  sections: [
    {
      title: '先把依赖关系画出来',
      paragraphs: [
        '在最小订单链路里，ODS.ORDER 是来源，DWD.ORDER_DETAIL 统一订单明细；它又被销售主题和用户主题复用，最终共同支撑报表。表级视图保留了原来的学习入口。',
        '第 07 课的真实 Quality Event（缺少 I1002-2 的完整性失败）现在可以从调查选择器直接进入这条链路：质量规则、目标字段、分区和 Scheduler run 不会在适配时丢失。',
        '同一条链路还可以换成字段、任务或指标视角：字段回答“哪一列被加工”，任务回答“谁负责生产”，指标回答“哪个口径在消费”。',
      ],
      bullets: [
        '表级：理解数据资产之间的生产方向',
        '字段级：追踪 order_status 的语义变化',
        '任务级：定位依赖顺序与验证入口',
        '指标级：确认下游口径是否需要复核',
        'Scheduler contract 当前只声明销售主题任务；用户主题分支保留但明确标记为 manual metadata，不冒充第二套 DAG。',
      ],
    },
    {
      title: '变更前先问影响范围',
      paragraphs: [
        '选择真实 Quality Event、字段语义变化、schema / field change 或 task failure 事件后，先观察直接下游，再运行影响分析，让传播路径逐步点亮。直接下游适合安排修改顺序，传递下游和最终爆炸半径适合安排验证与通知范围。',
      ],
      bullets: [
        '上游：帮助定位来源和排查问题',
        '直接下游：帮助安排修改与验证顺序',
        '传递下游：展示依赖链上逐层传播的对象',
        '最终影响：按 table / field / task / metric 汇总爆炸半径',
      ],
    },
    {
      title: '每条箭头都要能解释',
      paragraphs: [
        '点击调查路径中的边，可以看到它来自 Quality Event、SQL transformation、task dependency、metric definition 或 manual metadata，以及 confirmed / inferred / manual 的教学置信度。证据越弱，越应该回到质量样本、任务配置和字段语义进行确认。',
      ],
    },
  ],
  visualization: {
    kind: 'lineage',
    nodes: lineageProductionGraph.nodes,
    edges: lineageProductionGraph.edges,
    investigationEvent: lineageProductionGraph.investigationEvents[0],
    investigationEvents: [
      ...lineageProductionGraph.investigationEvents,
      qualityLineageInvestigation,
    ],
  },
  code: {
    label: '一个需要血缘的问题',
    language: 'sql',
    code: `-- order_status 的含义发生变化，先找直接下游和最终影响
SELECT target_entity, relation, evidence_source
FROM lineage_edges
WHERE source_entity = 'DWD.ORDER_DETAIL.order_status';`,
  },
  engineeringTip:
    '本课消费第 05 章的 SQL task contract、第 06 章的 Scheduler task identity / dependsOn，并通过薄 adapter 直接消费第 07 章真实 QualityEvent；Lineage 不复制 QualityRule、QualityEvidence、QualityInvestigationContext 或质量结果模型。',
  pitfalls: [
    '上游和下游是相对当前节点而言的；换一个选中对象，统计结果也会变化。',
    '直接下游不等于最终影响，传递链路中的表、任务和指标都需要分别验证。',
    '图上的依赖不等于业务因果关系，仍需要结合任务、字段语义和业务规则判断。',
  ],
}
