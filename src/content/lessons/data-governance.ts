import type {
  GovernanceAsset,
  GovernanceBusinessDefinition,
  GovernanceField,
  GovernanceLifecycleEvent,
  GovernanceMetricReference,
  GovernanceVisualization,
  LineageEvidence,
} from '../../types'
import {
  qualityEventToGovernanceEvidence,
  qualityEvaluationToGovernanceEvidence,
} from '../../features/governance/quality-adapter'
import { QUALITY_RULE_IDS, evaluateDataQuality } from '../../utils/data-quality'
import { getMetricDefinition } from '../../utils/metrics'
import { dataLineageContent } from './data-lineage'
import { dataQualityVisualization } from './data-quality'
import type { LessonContent } from '../types'

const lineageVisualization = dataLineageContent.visualization

if (!lineageVisualization || lineageVisualization.kind !== 'lineage') {
  throw new Error('数据治理课程缺少血缘可视化数据')
}

const qualityIncidentEvaluation = evaluateDataQuality(dataQualityVisualization, {
  injection: 'missing-order-item',
  action: 'block',
})
const qualityIncident = qualityIncidentEvaluation.events.find(
  (event) => event.ruleId === QUALITY_RULE_IDS.completeness,
)
if (!qualityIncident) {
  throw new Error('数据治理课程缺少完整性质量事件')
}

const qualityBaselineEvaluation = evaluateDataQuality(dataQualityVisualization, {
  injection: 'none',
  action: 'block',
})
const dwsSalesQualityRule = dataQualityVisualization.rules.find(
  (rule) => rule.ruleId === QUALITY_RULE_IDS.reconciliation,
)
if (!dwsSalesQualityRule) {
  throw new Error('数据治理课程缺少对账质量规则')
}

const dwdQualityEvidence = qualityEventToGovernanceEvidence(qualityIncident, 'DWD 明细完整性')
const dwsSalesQualityEvidence = qualityEvaluationToGovernanceEvidence(
  qualityBaselineEvaluation,
  dwsSalesQualityRule,
)

const currentFreshness = {
  lastUpdatedAt: '2026-09-14 10:00',
  expectedRefresh: '每 15 分钟',
  observedDelayMinutes: 3,
  status: 'current',
} as const

const delayedFreshness = {
  lastUpdatedAt: '2026-09-14 06:00',
  expectedRefresh: '每天 06:30',
  observedDelayMinutes: 210,
  status: 'delayed',
} as const

const payGmvDefinition = getMetricDefinition({
  statusRule: 'paid',
  refundRule: 'net',
  timeField: 'payTime',
  grainMode: 'correct',
})

const payGmvReference: GovernanceMetricReference = {
  name: '支付 GMV',
  definition: payGmvDefinition,
  sourceLessonSlug: 'metric-system',
  note: '引用支付 GMV 定义；治理目录只引用口径，不重新计算订单。',
}

const dwdDefinition: GovernanceBusinessDefinition = {
  summary: '一行代表一笔订单，统一订单状态、用户标识和金额字段。',
  grain: '订单',
  scope: '支付、退款和经营分析所需的订单明细。',
  exclusions: '不代表商品明细；需要商品粒度时应继续使用明细字段。',
}

const salesDefinition: GovernanceBusinessDefinition = {
  summary: '按统计日和区域汇总支付成功订单，服务销售趋势和 GMV 复核。',
  grain: '统计日 × 区域',
  scope: '只承载聚合后的销售主题，不提供用户联系方式。',
  exclusions: '不用于用户触达或逐用户导出。',
}

const reportDefinition: GovernanceBusinessDefinition = {
  summary: '经营分析报表的发布视图，展示销售趋势和有限的用户关联信息。',
  grain: '报表日 × 区域',
  scope: '面向经营分析阅读，不是原始明细的替代品。',
  exclusions: '不应作为外部共享或用户触达的直接数据源。',
}

const userDefinition: GovernanceBusinessDefinition = {
  summary: '用户销售相关数据。',
  grain: '不明确：用户或订单？',
  scope: '描述不完整，暂时无法确认是否允许按用户查看。',
  exclusions: '用途和最小字段范围待 Owner 补齐。',
}

const legacyDefinition: GovernanceBusinessDefinition = {
  summary: '历史销售报表的旧版本。',
  grain: '报表日',
  scope: '只用于迁移期间的结果比对。',
  exclusions: '不应再建立新的生产依赖。',
}

const orderFields: GovernanceField[] = [
  {
    name: 'order_id',
    label: '订单标识',
    type: 'string',
    description: '订单的稳定业务标识，用于订单级去重和关联。',
    sensitivity: 'internal',
  },
  {
    name: 'user_id',
    label: '用户标识',
    type: 'string',
    description: '用于关联用户主题的内部标识，不代表可以直接触达用户。',
    sensitivity: 'internal',
  },
  {
    name: 'user_phone',
    label: '用户手机号（教学字段）',
    type: 'string',
    description: '教学用联系方式字段，展示时必须使用脱敏值。',
    sensitivity: 'restricted',
    maskingStrategy: '仅保留区号和末两位',
  },
  {
    name: 'user_email',
    label: '用户邮箱（教学字段）',
    type: 'string',
    description: '教学用联系方式字段，经营分析不需要读取原值。',
    sensitivity: 'sensitive',
    maskingStrategy: '保留首字符和域名，其余替换为 *',
  },
  {
    name: 'region',
    label: '区域',
    type: 'string',
    description: '订单发生区域，可用于区域汇总。',
    sensitivity: 'public',
  },
  {
    name: 'order_amount',
    label: '订单金额',
    type: 'decimal',
    description: '订单级金额；复用指标时要先确认退款口径。',
    sensitivity: 'internal',
  },
  {
    name: 'order_status',
    label: '订单状态',
    type: 'string',
    description: '当前统一的订单状态映射，语义变更需要通知下游。',
    sensitivity: 'internal',
    semanticStatus: 'stable',
    lineageNodeId: 'field-dwd-order-status',
  },
]

const salesFields: GovernanceField[] = [
  {
    name: 'stat_date',
    label: '统计日期',
    type: 'date',
    description: '支付 GMV 使用的自然日统计边界。',
    sensitivity: 'public',
  },
  {
    name: 'region',
    label: '区域',
    type: 'string',
    description: '区域汇总维度。',
    sensitivity: 'internal',
  },
  {
    name: 'order_count',
    label: '订单数',
    type: 'integer',
    description: '按订单粒度去重后的支付成功订单数。',
    sensitivity: 'internal',
  },
  {
    name: 'pay_gmv',
    label: '支付 GMV',
    type: 'decimal',
    description: '引用支付 GMV 口径的聚合结果。',
    sensitivity: 'internal',
  },
  {
    name: 'status_group',
    label: '销售状态分组',
    type: 'string',
    description: '由 order_status 映射得到的销售状态分组。',
    sensitivity: 'internal',
    lineageNodeId: 'field-dws-sales-status',
  },
]

const reportFields: GovernanceField[] = [
  {
    name: 'report_date',
    label: '报表日期',
    type: 'date',
    description: '经营报表的自然日分区。',
    sensitivity: 'public',
  },
  {
    name: 'region',
    label: '区域',
    type: 'string',
    description: '经营分析使用的区域维度。',
    sensitivity: 'internal',
  },
  {
    name: 'pay_gmv',
    label: '支付 GMV',
    type: 'decimal',
    description: '报表展示的销售指标，必须回到指标定义核对口径。',
    sensitivity: 'internal',
  },
  {
    name: 'top_user_id',
    label: '高价值用户标识（教学字段）',
    type: 'string',
    description: '教学用关联标识，不应从报表直接导出给外部接收方。',
    sensitivity: 'sensitive',
    maskingStrategy: '只展示不可逆的教学别名',
  },
  {
    name: 'status_summary',
    label: '报表状态摘要',
    type: 'string',
    description: '由销售和用户主题状态分组派生的摘要。',
    sensitivity: 'internal',
    lineageNodeId: 'field-ads-report-status',
  },
]

const userFields: GovernanceField[] = [
  {
    name: 'user_id',
    label: '用户标识（教学字段）',
    type: 'string',
    description: '用户主题的关联标识，业务用途和访问范围尚未写清。',
    sensitivity: 'internal',
  },
  {
    name: 'user_phone',
    label: '用户手机号（教学字段）',
    type: 'string',
    description: '联系方式字段，必须先确认触达目的和脱敏方式。',
    sensitivity: 'restricted',
    maskingStrategy: '仅保留末两位',
  },
  {
    name: 'user_email',
    label: '用户邮箱（教学字段）',
    type: 'string',
    description: '联系方式字段，不能因为“用户主题”名称就默认可见。',
    sensitivity: 'sensitive',
    maskingStrategy: '保留域名的教学脱敏值',
  },
  {
    name: 'region',
    label: '区域',
    type: 'string',
    description: '用户所在区域的粗粒度标签。',
    sensitivity: 'internal',
  },
  {
    name: 'status_group',
    label: '用户状态分组',
    type: 'string',
    description: '从订单状态映射得到的用户状态摘要。',
    sensitivity: 'internal',
    lineageNodeId: 'field-dws-user-status',
  },
]

const governanceAssets: GovernanceAsset[] = [
  {
    id: 'ods-order',
    technicalName: 'ODS.ORDER',
    businessName: '订单原始接入表',
    description: '原始订单事件落地表，保留接入字段，适合排查来源而非直接做经营分析。',
    assetType: 'table',
    owner: '接入平台组',
    steward: '订单域 Steward',
    tags: ['订单', '原始层', '接入'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'sensitive',
    fields: orderFields.slice(0, 5),
    businessDefinition: {
      summary: '一行代表一次订单事件的原始落地记录。',
      grain: '订单事件',
      scope: '用于追溯来源和接入异常。',
      exclusions: '不保证状态已统一，也不保证适合指标计算。',
    },
    definitionCompleteness: 'complete',
    lineageEvidence: {
      status: 'linked',
      nodeId: 'ods-order',
      note: '已连接 ODS.ORDER 节点，可沿血缘追踪到统一明细。',
    },
  },
  {
    id: 'dwd-order-detail',
    technicalName: 'DWD.ORDER_DETAIL',
    businessName: 'DWD 订单明细',
    description: '订单域的统一明细层，定义清晰，是销售指标和下游主题的可复用来源。',
    assetType: 'table',
    owner: '订单数据组',
    steward: '订单域 Steward',
    tags: ['订单', '销售', '明细', '可复用'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'sensitive',
    fields: orderFields,
    businessDefinition: dwdDefinition,
    definitionCompleteness: 'complete',
    metricDefinition: payGmvReference,
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dwd-order-detail',
      note: '已连接 DWD.ORDER_DETAIL 节点；下游关系来自同一条血缘。',
    },
    qualityEvidence: dwdQualityEvidence,
  },
  {
    id: 'dws-sales',
    technicalName: 'DWS.SALES',
    businessName: 'DWS 销售主题',
    description: '按日期和区域汇总销售指标，定义清楚且没有联系方式字段，适合经营分析起点。',
    assetType: 'table',
    owner: '指标平台组',
    steward: '销售域 Steward',
    tags: ['销售', 'GMV', '主题层', '推荐起点'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'internal',
    fields: salesFields,
    businessDefinition: salesDefinition,
    definitionCompleteness: 'complete',
    metricDefinition: payGmvReference,
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dws-sales',
      note: '已连接 DWS.SALES 节点，可追踪到报表和销售状态指标。',
    },
    qualityEvidence: dwsSalesQualityEvidence,
  },
  {
    id: 'ads-report',
    technicalName: 'ADS.REPORT',
    businessName: 'ADS 销售经营报表',
    description: '面向经营分析的发布视图，名字最容易被搜索到，但仍带有需要谨慎处理的关联字段。',
    assetType: 'view',
    owner: '经营分析组',
    steward: 'BI Steward',
    tags: ['销售', '经营分析', '报表'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'sensitive',
    fields: reportFields,
    businessDefinition: reportDefinition,
    definitionCompleteness: 'complete',
    metricDefinition: payGmvReference,
    lineageEvidence: {
      status: 'linked',
      nodeId: 'ads-report',
      note: '已连接 ADS.REPORT 节点，可同时查看报表关系和指标关系。',
    },
  },
  {
    id: 'dws-user',
    technicalName: 'DWS.USER',
    businessName: 'DWS 用户销售主题',
    description: '用户销售数据',
    assetType: 'table',
    steward: '用户域 Steward',
    tags: ['用户', '销售', '联系方式'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'restricted',
    fields: userFields,
    businessDefinition: userDefinition,
    definitionCompleteness: 'ambiguous',
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dws-user',
      note: '已连接 DWS.USER 节点，用户主题的下游影响仍可被追踪。',
    },
  },
  {
    id: 'ads-sales-report-v1',
    technicalName: 'ADS.SALES_REPORT_V1',
    businessName: '旧版销售报表 V1',
    description: '历史销售报表，仍有少量使用方，但已经有新的 ADS.REPORT 替代。',
    assetType: 'view',
    owner: '经营分析组',
    steward: 'BI Steward',
    tags: ['销售', 'deprecated', '迁移'],
    lifecycle: 'deprecated',
    freshnessMetadata: delayedFreshness,
    sensitivity: 'internal',
    fields: [
      {
        name: 'report_date',
        label: '报表日期',
        type: 'date',
        description: '旧版报表的统计日期。',
        sensitivity: 'public',
      },
      {
        name: 'gmv',
        label: '旧版 GMV',
        type: 'decimal',
        description: '历史字段，可能与当前支付 GMV 口径不同。',
        sensitivity: 'internal',
      },
    ],
    businessDefinition: legacyDefinition,
    definitionCompleteness: 'partial',
    metricDefinition: payGmvReference,
    lineageEvidence: {
      status: 'unavailable',
      note: '当前血缘目录没有旧版视图的可确认节点，只保留人工迁移说明。',
    },
  },
]

const governanceEventEvidence: LineageEvidence = {
  source: 'manual_metadata',
  detail: '该治理事件的影响对象，沿已登记的血缘关系计算。',
}

const governanceEvents: GovernanceLifecycleEvent[] = [
  {
    id: 'governance-order-status-semantic-change',
    assetId: 'dwd-order-detail',
    eventType: 'field-change',
    label: 'order_status 语义变化',
    description: '状态映射从“支付成功”改成新的业务分组，字段名暂时也准备改为 order_state。',
    sourceEntityId: 'field-dwd-order-status',
    affectedEntityId: 'metric-sales-status-rate',
    fieldName: 'order_status',
    newFieldName: 'order_state',
    semanticChange: '新增待审核状态，原有 PAID 分组边界需要重新确认。',
    evidence: lineageVisualization.investigationEvent?.evidence ?? governanceEventEvidence,
  },
  {
    id: 'governance-ads-report-deprecated',
    assetId: 'ads-report',
    eventType: 'asset-deprecated',
    label: 'ADS.REPORT 准备下线',
    description: '发布视图进入 deprecated，停止新增依赖，并沿报表状态字段通知下游指标消费者。',
    sourceEntityId: 'field-ads-report-status',
    affectedEntityId: 'metric-report-status',
    evidence: governanceEventEvidence,
  },
  {
    id: 'governance-user-owner-missing',
    assetId: 'dws-user',
    eventType: 'owner-missing',
    label: 'DWS.USER Owner 缺失',
    description: '目录只能找到 Steward，不能把用户主题交给新的使用方，先补齐责任人。',
    evidence: governanceEventEvidence,
  },
  {
    id: 'governance-legacy-retiring',
    assetId: 'ads-sales-report-v1',
    eventType: 'asset-retiring',
    label: '旧版报表进入 retiring',
    description: 'deprecated 资产完成迁移确认后进入 retiring，停止消费并保留迁移记录。',
    evidence: governanceEventEvidence,
  },
  {
    id: 'governance-user-id-classification-change',
    assetId: 'dwd-order-detail',
    eventType: 'sensitivity-change',
    label: 'user_id 敏感等级上调',
    description: '关联能力扩大后，将教学字段 user_id 从 internal 调整为 sensitive。',
    fieldName: 'user_id',
    newSensitivity: 'sensitive',
    evidence: governanceEventEvidence,
  },
]

export const governanceVisualization: GovernanceVisualization = {
  kind: 'governance',
  assets: governanceAssets,
  lineageNodes: lineageVisualization.nodes,
  lineageEdges: lineageVisualization.edges,
  events: governanceEvents,
}

export const dataGovernanceContent: LessonContent = {
  eyebrow: '第 09 课 · 数据资产如何被安全复用',
  subtitle: '面对一条“我要用户销售数据”的申请，沿着资产定义、字段敏感等级和责任人做出使用决定。',
  quickSummary:
    '数据治理要回答三件事：资产是什么、字段能否使用、发生变更后要通知谁；每个决定都要留下证据。',
  opening: {
    eyebrow: '新员工入职：“我该查哪张表？找谁要权限？”',
    title: '用户销售数据应该从哪张表取？',
    intro: '新同事已经知道业务词，却不知道该选哪张表、哪些字段能看，以及资产变更后要通知谁。',
    cards: [
      { label: '需求', value: '用户销售数据', detail: '业务词，不是技术表名' },
      { label: '风险', value: '同名 ≠ 同义', detail: '定义、Owner、生命周期都可能不同' },
      { label: '目标', value: '可复盘决定', detail: '留下依据、影响和剩余风险' },
    ],
    question: '搜索“销售”后，比较候选资产：名字最像的那张，不一定最适合当前分析。',
  },
  concept: {
    term: '可执行的数据治理',
    definition:
      '治理把业务定义、责任人、字段敏感等级、生命周期、新鲜度和血缘影响组合成一个可以被解释的使用决定；它不等于真实 IAM，也不把未知质量伪装成通过。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '业务词找到候选表，技术名不能代替定义',
      paragraphs: [
        '目录里故意放入多个“销售”候选：DWS.SALES 适合经营分析，ADS.REPORT 更接近报表消费，旧版 V1 已经 deprecated，而 DWS.USER 虽然名字相关，却缺 Owner 且粒度含糊。搜索结果要让这些治理差异直接可见。',
      ],
      bullets: [
        '业务名和 tag 帮助新同事发现候选资产。',
        'definition completeness、Owner 和 lifecycle 影响推荐程度。',
        'sensitivity 只是资产入口；最终还要下钻到字段。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'Governance Decision Workbench',
      title: '找到表后，留下可复盘的治理记录',
      description:
        '在目录中搜索资产，打开定义、质量和血缘证据，切换角色与用途，再处理生命周期事件并安排通知。',
      visualization: governanceVisualization,
    },
    {
      kind: 'narrative',
      title: '字段能找到，不等于字段应该直接可见',
      paragraphs: [
        '同一个 user_email，分析师做经营分析时可以得到脱敏结果；营销人员做用户触达时需要审批；外部协作者在外部共享场景则被拒绝。策略输出必须告诉学习者依据，而不是只说“无权限”。',
        'allow、masked、approval-required、deny 分别对应直接使用、脱敏后使用、审批后使用和拒绝；申请时要把业务用途写清楚。',
      ],
    },
    {
      kind: 'narrative',
      title: '变更治理要沿现有血缘找影响',
      paragraphs: [
        'order_status 的语义变化和 ADS.REPORT 的下线事件，沿节点和边找到直接下游、传递影响、消费者和通知顺序。报表下线时，责任人可以据此安排迁移和通知。',
        '质量检查结果也要进入资产判断：DWD.ORDER_DETAIL 展示缺明细事件、目标字段、分区、失败样本和阻断决定；DWS.SALES 保留一次通过结果作为对照。资产目录根据这些证据提示风险，不把缺少检查的资产当作通过。',
      ],
    },
    {
      kind: 'takeaway',
      title: '治理的闭环是发现、证据、决定、影响和责任',
      text: '一张表是否值得复用，取决于它能否被找到、被理解、被安全使用，并在变更时找到真正需要处理的人。',
      bullets: [
        '推荐判断要能解释：定义、Owner、生命周期、敏感等级、血缘和 freshness metadata 分别贡献了什么。',
        '访问判断要落到字段、角色和用途，不能把岗位名称当成万能权限。',
        '变更通知要沿生产链路的血缘证据生成，并由责任人确认接收范围。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '质量证据如何参与治理决定',
      text: '质量状态、检查规则、目标分区、失败样本、发布决定和剩余风险都会影响资产推荐。未被质量规则覆盖的资产仍显示 unknown，不能把未知状态当成 pass。',
    },
    {
      kind: 'pitfall',
      title: '不要把治理做成评分卡或 IAM 仿制品',
      text: 'recommended、usable-with-caution、not-recommended 是根据定义、责任、敏感等级、血缘和质量证据给出的解释性结论，不能代替组织正式的权限审批。',
    },
  ],
}
