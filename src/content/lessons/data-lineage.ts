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
  detail: 'SQL 转换：清洗账户余额、聚合指标维度并写入下游对象。',
}

const taskDependency: LineageEvidence = {
  source: 'task_dependency',
  detail: '任务依赖：下游任务等待上游任务成功后才消费结果。',
}

const metricDefinition: LineageEvidence = {
  source: 'metric_definition',
  detail: '指标定义：存款余额指标引用该对象的快照日余额语义。',
}

const lineageNodes: LineageNode[] = [
  {
    id: 'ods-account-balance',
    label: 'ODS.ACCOUNT_BALANCE_SNAPSHOT',
    layer: 'ODS',
    role: '账户余额原始来源',
    x: 90,
    y: 90,
    entityType: 'table',
  },
  {
    id: 'dwd-deposit-balance',
    label: 'DWD.DEPOSIT_BALANCE',
    layer: 'DWD',
    role: '可信账户日明细',
    x: 380,
    y: 90,
    entityType: 'table',
  },
  {
    id: 'dws-deposit-balance',
    label: 'DWS.DEPOSIT_BALANCE',
    layer: 'DWS',
    role: '存款余额主题汇总',
    x: 205,
    y: 245,
    entityType: 'table',
  },
  {
    id: 'dws-account-profile',
    label: 'DWS.ACCOUNT_PROFILE',
    layer: 'DWS',
    role: '账户维度辅助主题',
    x: 555,
    y: 245,
    entityType: 'table',
  },
  {
    id: 'ads-deposit-balance',
    label: 'ADS.DEPOSIT_BALANCE',
    layer: 'ADS',
    role: '存款余额指标结果',
    x: 380,
    y: 385,
    entityType: 'table',
  },
  {
    id: 'field-ods-balance',
    label: 'ODS.ACCOUNT_BALANCE_SNAPSHOT.balance',
    layer: 'ODS',
    role: '原始余额字段',
    x: 90,
    y: 90,
    entityType: 'field',
  },
  {
    id: 'field-dwd-balance',
    label: 'DWD.DEPOSIT_BALANCE.balance',
    layer: 'DWD',
    role: '账户日余额字段',
    x: 380,
    y: 90,
    entityType: 'field',
  },
  {
    id: 'field-dws-balance',
    label: 'DWS.DEPOSIT_BALANCE.balance',
    layer: 'DWS',
    role: '维度分组余额',
    x: 205,
    y: 245,
    entityType: 'field',
  },
  {
    id: 'field-dws-account-scope',
    label: 'DWS.ACCOUNT_PROFILE.customer_scope',
    layer: 'DWS',
    role: '客户口径辅助字段',
    x: 555,
    y: 245,
    entityType: 'field',
  },
  {
    id: 'field-ads-balance',
    label: 'ADS.DEPOSIT_BALANCE.balance',
    layer: 'ADS',
    role: '指标结果余额',
    x: 380,
    y: 385,
    entityType: 'field',
  },
  {
    id: 'task-load-balance',
    label: 'task.load_account_balance',
    layer: 'TASK',
    role: '载入账户余额',
    x: 90,
    y: 90,
    entityType: 'task',
  },
  {
    id: 'task-build-deposit-detail',
    label: 'task.build_deposit_detail',
    layer: 'TASK',
    role: '生成账户日明细',
    x: 380,
    y: 90,
    entityType: 'task',
  },
  {
    id: 'task-build-deposit-topic',
    label: 'task.build_deposit_topic',
    layer: 'TASK',
    role: '生成存款余额主题',
    x: 205,
    y: 245,
    entityType: 'task',
  },
  {
    id: 'task-build-account-profile',
    label: 'task.build_account_profile',
    layer: 'TASK',
    role: '生成账户画像辅助主题',
    x: 555,
    y: 245,
    entityType: 'task',
  },
  {
    id: 'task-publish-deposit-balance',
    label: 'task.publish_deposit_balance',
    layer: 'TASK',
    role: '发布存款余额指标',
    x: 380,
    y: 385,
    entityType: 'task',
  },
  {
    id: 'metric-deposit-balance',
    label: 'metric.deposit_balance',
    layer: 'METRIC',
    role: '存款余额指标',
    x: 205,
    y: 245,
    entityType: 'metric',
  },
  {
    id: 'metric-account-coverage',
    label: 'metric.account_coverage',
    layer: 'METRIC',
    role: '账户关联覆盖率',
    x: 555,
    y: 245,
    entityType: 'metric',
  },
  {
    id: 'metric-deposit-report',
    label: 'metric.deposit_report',
    layer: 'METRIC',
    role: '存款余额报告指标',
    x: 380,
    y: 385,
    entityType: 'metric',
  },
]

const lineageEdges: LineageEdge[] = [
  {
    source: 'ods-account-balance',
    target: 'dwd-deposit-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-deposit-balance',
    target: 'dws-deposit-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-deposit-balance',
    target: 'dws-account-profile',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'inferred',
  },
  {
    source: 'dws-deposit-balance',
    target: 'ads-deposit-balance',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'dws-account-profile',
    target: 'ads-deposit-balance',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'field-dwd-balance',
    target: 'task-build-deposit-detail',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-deposit-detail',
    target: 'dwd-deposit-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-deposit-balance',
    target: 'task-build-deposit-topic',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'dwd-deposit-balance',
    target: 'task-build-account-profile',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-deposit-topic',
    target: 'dws-deposit-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-account-profile',
    target: 'dws-account-profile',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'dws-deposit-balance',
    target: 'metric-deposit-balance',
    relation: 'consumes',
    evidence: metricDefinition,
    confidence: 'confirmed',
  },
  {
    source: 'dws-account-profile',
    target: 'metric-account-coverage',
    relation: 'consumes',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'task-build-deposit-topic',
    target: 'field-dws-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-account-profile',
    target: 'field-dws-account-scope',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-dws-balance',
    target: 'task-publish-deposit-balance',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'inferred',
  },
  {
    source: 'field-dws-account-scope',
    target: 'task-publish-deposit-balance',
    relation: 'consumes',
    evidence: taskDependency,
    confidence: 'inferred',
  },
  {
    source: 'task-publish-deposit-balance',
    target: 'ads-deposit-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'task-publish-deposit-balance',
    target: 'field-ads-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-ads-balance',
    target: 'metric-deposit-report',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'confirmed',
  },
  {
    source: 'metric-deposit-balance',
    target: 'metric-deposit-report',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'metric-account-coverage',
    target: 'metric-deposit-report',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'field-ods-balance',
    target: 'field-dwd-balance',
    relation: 'transform',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-dwd-balance',
    target: 'field-dws-balance',
    relation: 'derives',
    evidence: sqlTransformation,
    confidence: 'confirmed',
  },
  {
    source: 'field-dwd-balance',
    target: 'field-dws-account-scope',
    relation: 'derives',
    evidence: sqlTransformation,
    confidence: 'inferred',
  },
  {
    source: 'field-dws-balance',
    target: 'field-ads-balance',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'field-dws-account-scope',
    target: 'field-ads-balance',
    relation: 'derives',
    evidence: metricDefinition,
    confidence: 'inferred',
  },
  {
    source: 'task-load-balance',
    target: 'task-build-deposit-detail',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-deposit-detail',
    target: 'task-build-deposit-topic',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-deposit-detail',
    target: 'task-build-account-profile',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'confirmed',
  },
  {
    source: 'task-build-deposit-topic',
    target: 'task-publish-deposit-balance',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'inferred',
  },
  {
    source: 'task-build-account-profile',
    target: 'task-publish-deposit-balance',
    relation: 'depends_on',
    evidence: taskDependency,
    confidence: 'inferred',
  },
]

const qualityEvaluation = evaluateDataQuality(dataQualityVisualization, {
  injection: 'missing-branch-reference',
  action: 'block',
})
const qualityEvent = qualityEvaluation.events.find(
  (event) => event.ruleId === QUALITY_RULE_IDS.branchReference,
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
  eyebrow: '第 08 课 · 追踪一条数据生产链路',
  subtitle:
    '改一个上游字段，下游会有多少个主题和指标受牵连？沿着存款余额血缘图找出直接下游、传递影响和最终范围。',
  quickSummary:
    '数据血缘把表、字段、任务和指标放进同一张依赖图；质量异常进入调查后，沿证据路径确认上游来源和下游影响。',
  concept: {
    term: '数据血缘',
    definition:
      '描述数据对象之间来源、加工和消费关系的依赖信息。它提供排错和变更评审的共享上下文，但不等于业务因果。',
  },
  sections: [
    {
      title: '数据从哪里来，最后被谁使用？',
      paragraphs: [
        '在存款余额链路里，ODS.ACCOUNT_BALANCE_SNAPSHOT 是来源，DWD.DEPOSIT_BALANCE 统一账户日明细；它又被存款余额主题和账户辅助主题复用，最终共同支撑指标结果。表级视图先把生产方向讲清楚。',
        '质量异常（缺少 A002 的完整性失败）可以从调查入口直接进入这条链路：质量规则、目标字段、分区和运行实例会一起显示。',
        '同一条链路还可以换成字段、任务或指标视角：字段回答“哪一列被加工”，任务回答“谁负责生产”，指标回答“哪个口径在消费”。',
      ],
      bullets: [
        '表级：理解数据资产之间的生产方向',
        '字段级：追踪 balance 的语义变化',
        '任务级：定位依赖顺序与验证入口',
        '指标级：确认存款余额口径是否需要复核',
        '账户辅助主题的依赖仍需人工确认，不能把它当成完整 DAG。',
      ],
    },
    {
      title: '改一个上游字段，下游会牵连多少指标？',
      paragraphs: [
        '从质量异常、字段语义变化、schema / field change 或 task failure 进入调查，查看直接下游，再运行影响分析，让传播路径逐步点亮。直接下游适合安排修改顺序，传递下游和最终影响范围适合安排验证与通知。',
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
    code: `-- balance 的含义发生变化，先找直接下游和最终影响
SELECT target_entity, relation, evidence_source
FROM lineage_edges
WHERE source_entity = 'DWD.DEPOSIT_BALANCE.balance';`,
  },
  engineeringTip:
    '数据血缘是线上变更和故障排查的导航地图：沿字段、任务和指标的依赖关系，确定需要验证和通知的范围。',
  pitfalls: [
    '上游和下游是相对当前节点而言的；换一个选中对象，统计结果也会变化。',
    '直接下游不等于最终影响，传递链路中的表、任务和指标都需要分别验证。',
    '图上的依赖不等于业务因果关系，仍需要结合任务、字段语义和业务规则判断。',
  ],
}
