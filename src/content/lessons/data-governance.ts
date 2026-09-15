import type {
  GovernanceAsset,
  GovernanceBusinessDefinition,
  GovernanceField,
  GovernanceLifecycleEvent,
  GovernanceMetricReference,
  GovernanceVisualization,
  LineageEvidence,
  MetricDefinition,
} from '../../types'
import {
  qualityEventToGovernanceEvidence,
  qualityEvaluationToGovernanceEvidence,
} from '../../features/governance/quality-adapter'
import { QUALITY_RULE_IDS, evaluateDataQuality } from '../../utils/data-quality'
import { dataLineageContent } from './data-lineage'
import { dataQualityVisualization } from './data-quality'
import type { LessonContent } from '../types'

const lineageVisualization = dataLineageContent.visualization

if (!lineageVisualization || lineageVisualization.kind !== 'lineage') {
  throw new Error('数据治理课程缺少血缘可视化数据')
}

const qualityIncidentEvaluation = evaluateDataQuality(dataQualityVisualization, {
  injection: 'missing-balance-snapshot',
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
const dwsBalanceQualityRule = dataQualityVisualization.rules.find(
  (rule) => rule.ruleId === QUALITY_RULE_IDS.reconciliation,
)
if (!dwsBalanceQualityRule) {
  throw new Error('数据治理课程缺少对账质量规则')
}

const dwdQualityEvidence = qualityEventToGovernanceEvidence(qualityIncident, 'DWD 账户余额完整性')
const dwsBalanceQualityEvidence = qualityEvaluationToGovernanceEvidence(
  qualityBaselineEvaluation,
  dwsBalanceQualityRule,
)

const currentFreshness = {
  lastUpdatedAt: '2026-09-30 23:59',
  expectedRefresh: '每天 06:30',
  observedDelayMinutes: 3,
  status: 'current',
} as const

const delayedFreshness = {
  lastUpdatedAt: '2026-10-01 06:00',
  expectedRefresh: '每天 06:30',
  observedDelayMinutes: 210,
  status: 'delayed',
} as const

const depositBalanceMetric: MetricDefinition = {
  name: '存款余额',
  businessProcess: '账户余额日终快照',
  subject: '存款余额',
  statusRule: '杭州分行、小微、定期、CNY',
  grain: '快照日 × 机构 × 客户口径 × 产品 × 币种',
  timeField: 'snapshot_date',
  measure: 'SUM(balance)',
  refundRule: '不涉及退款；余额按快照日取值',
  period: '截至业务日期的日终余额',
}

const depositBalanceReference: GovernanceMetricReference = {
  name: '存款余额',
  definition: depositBalanceMetric,
  sourceLessonSlug: 'sql-and-transformation',
  note: '引用第 05 章的存款余额定义；治理目录只引用口径，不重新计算余额。',
}

const dwdDefinition: GovernanceBusinessDefinition = {
  summary: '一行代表一个账户在一个快照日的余额，保留维度缺失的事实行。',
  grain: '账户 × 快照日',
  scope: '去重、关联和币种标准化后的账户日余额明细。',
  exclusions: '不代表指标卡汇总；需要业务分组时应继续使用 DWS。',
}

const dwsDefinition: GovernanceBusinessDefinition = {
  summary: '按快照日、机构、客户口径、产品和币种汇总存款余额。',
  grain: '快照日 × 机构 × 客户口径 × 产品 × 币种',
  scope: '承载存款余额主题汇总，供指标卡和经营分析复用。',
  exclusions: '不提供账户介质明细，也不用于直接识别客户。',
}

const adsDefinition: GovernanceBusinessDefinition = {
  summary: '存款余额指标卡的发布视图，一行对应一个快照日和一组固定业务条件。',
  grain: '快照日 × 指标卡',
  scope: '面向经营分析读取杭州分行、小微、定期、CNY 的余额。',
  exclusions: '不应作为原始账户明细或外部共享的直接数据源。',
}

const profileDefinition: GovernanceBusinessDefinition = {
  summary: '由账户关系和客户口径构成的辅助主题，帮助解释指标维度来源。',
  grain: '账户或客户？',
  scope: '当前定义不完整，暂时不能确认能否支撑更多客户分析。',
  exclusions: '用途、字段范围和 Owner 待补齐。',
}

const legacyDefinition: GovernanceBusinessDefinition = {
  summary: '历史存款余额发布视图的旧版本。',
  grain: '报表日',
  scope: '只用于迁移期间的结果比对。',
  exclusions: '不应再建立新的生产依赖。',
}

const balanceFields: GovernanceField[] = [
  {
    name: 'snapshot_date',
    label: '快照日期',
    type: 'date',
    description: '账户余额所属的业务日期，不由数据到达日期替代。',
    sensitivity: 'public',
  },
  {
    name: 'account_id',
    label: '账户标识',
    type: 'string',
    description: '账户的内部关联键，用于账户日去重和维度关联。',
    sensitivity: 'internal',
  },
  {
    name: 'customer_id',
    label: '客户标识',
    type: 'string',
    description: '客户维度的内部关联键，不能据此推断可以直接触达客户。',
    sensitivity: 'sensitive',
  },
  {
    name: 'branch_name',
    label: '机构名称',
    type: 'string',
    description: '机构汇总维度，可用于分行范围筛选。',
    sensitivity: 'internal',
  },
  {
    name: 'currency',
    label: '标准币种',
    type: 'string',
    description: '进入 DWD 后的标准币种编码，当前指标只接受 CNY。',
    sensitivity: 'public',
  },
  {
    name: 'balance',
    label: '账户余额',
    type: 'decimal',
    description: '账户在快照日的余额度量；复用前要确认统计日期和业务范围。',
    sensitivity: 'internal',
    semanticStatus: 'stable',
    lineageNodeId: 'field-dwd-balance',
  },
]

const dwsFields: GovernanceField[] = [
  {
    name: 'snapshot_date',
    label: '快照日期',
    type: 'date',
    description: '主题汇总的业务日期边界。',
    sensitivity: 'public',
  },
  {
    name: 'branch_name',
    label: '机构名称',
    type: 'string',
    description: '分行汇总维度。',
    sensitivity: 'internal',
  },
  {
    name: 'customer_scope',
    label: '客户口径',
    type: 'string',
    description: '客户维度映射出的分析口径。',
    sensitivity: 'internal',
    lineageNodeId: 'field-dws-account-scope',
  },
  {
    name: 'product_type',
    label: '产品类型',
    type: 'string',
    description: '产品维度映射出的产品分类。',
    sensitivity: 'internal',
  },
  {
    name: 'currency',
    label: '标准币种',
    type: 'string',
    description: '主题层使用的统一币种编码。',
    sensitivity: 'public',
  },
  {
    name: 'balance',
    label: '存款余额',
    type: 'decimal',
    description: '按指标维度汇总后的余额，必须回到指标定义核对口径。',
    sensitivity: 'internal',
    lineageNodeId: 'field-dws-balance',
  },
]

const adsFields: GovernanceField[] = [
  {
    name: 'snapshot_date',
    label: '指标日期',
    type: 'date',
    description: '指标卡对应的业务日期。',
    sensitivity: 'public',
  },
  {
    name: 'branch_name',
    label: '机构名称',
    type: 'string',
    description: '发布结果的机构范围。',
    sensitivity: 'internal',
  },
  {
    name: 'customer_scope',
    label: '客户口径',
    type: 'string',
    description: '发布结果的客户范围。',
    sensitivity: 'internal',
  },
  {
    name: 'balance',
    label: '存款余额',
    type: 'decimal',
    description: '指标卡展示的余额，必须回到第 05 章契约核对定义。',
    sensitivity: 'internal',
    lineageNodeId: 'field-ads-balance',
  },
]

const profileFields: GovernanceField[] = [
  {
    name: 'account_id',
    label: '账户标识',
    type: 'string',
    description: '账户画像的关联键，业务用途和访问范围尚未写清。',
    sensitivity: 'internal',
  },
  {
    name: 'customer_scope',
    label: '客户口径',
    type: 'string',
    description: '客户分析范围的粗粒度标签。',
    sensitivity: 'internal',
    lineageNodeId: 'field-dws-account-scope',
  },
  {
    name: 'customer_id',
    label: '客户标识',
    type: 'string',
    description: '客户关联键，扩大关联能力前必须先确认用途。',
    sensitivity: 'restricted',
  },
]

const governanceAssets: GovernanceAsset[] = [
  {
    id: 'ods-account-balance',
    technicalName: 'ODS.ACCOUNT_BALANCE_SNAPSHOT',
    businessName: '账户余额原始快照',
    description: '原始账户余额快照，保留来源差异，适合排查接入问题而非直接做指标分析。',
    assetType: 'table',
    owner: '账户数据接入组',
    steward: '存款域 Steward',
    tags: ['存款', '原始层', '账户余额'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'sensitive',
    fields: balanceFields.slice(0, 2),
    businessDefinition: {
      summary: '一行代表一条账户余额原始快照记录。',
      grain: '账户 × 快照日（原始记录）',
      scope: '用于追溯来源、重复快照和迟到输入。',
      exclusions: '不保证已去重、补齐维度或统一编码。',
    },
    definitionCompleteness: 'complete',
    lineageEvidence: {
      status: 'linked',
      nodeId: 'ods-account-balance',
      note: '已连接 ODS.ACCOUNT_BALANCE_SNAPSHOT 节点，可沿血缘追踪到可信明细。',
    },
  },
  {
    id: 'dwd-deposit-balance',
    technicalName: 'DWD.DEPOSIT_BALANCE',
    businessName: 'DWD 账户日余额',
    description: '去重、关联和币种标准化后的可信明细，是存款余额指标和下游主题的可复用来源。',
    assetType: 'table',
    owner: '存款数据组',
    steward: '存款域 Steward',
    tags: ['存款', '明细', 'DWD', '可复用'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'sensitive',
    fields: balanceFields,
    businessDefinition: dwdDefinition,
    definitionCompleteness: 'complete',
    metricDefinition: depositBalanceReference,
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dwd-deposit-balance',
      note: '已连接 DWD.DEPOSIT_BALANCE 节点；下游关系来自同一条血缘。',
    },
    qualityEvidence: dwdQualityEvidence,
  },
  {
    id: 'dws-deposit-balance',
    technicalName: 'DWS.DEPOSIT_BALANCE',
    businessName: 'DWS 存款余额主题',
    description: '按指标维度汇总存款余额，不带账户介质明细，适合经营分析从主题层开始复用。',
    assetType: 'table',
    owner: '指标平台组',
    steward: '存款域 Steward',
    tags: ['存款', '余额', '主题层', '推荐起点'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'internal',
    fields: dwsFields,
    businessDefinition: dwsDefinition,
    definitionCompleteness: 'complete',
    metricDefinition: depositBalanceReference,
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dws-deposit-balance',
      note: '已连接 DWS.DEPOSIT_BALANCE 节点，可追踪到指标结果。',
    },
    qualityEvidence: dwsBalanceQualityEvidence,
  },
  {
    id: 'ads-deposit-balance',
    technicalName: 'ADS.DEPOSIT_BALANCE',
    businessName: 'ADS 存款余额指标',
    description: '面向经营分析的发布视图，一行对应一张固定条件的存款余额指标卡。',
    assetType: 'view',
    owner: '经营分析组',
    steward: 'BI Steward',
    tags: ['存款', '余额', '经营分析', '指标'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'internal',
    fields: adsFields,
    businessDefinition: adsDefinition,
    definitionCompleteness: 'complete',
    metricDefinition: depositBalanceReference,
    lineageEvidence: {
      status: 'linked',
      nodeId: 'ads-deposit-balance',
      note: '已连接 ADS.DEPOSIT_BALANCE 节点，可同时查看指标和发布依赖。',
    },
  },
  {
    id: 'dws-account-profile',
    technicalName: 'DWS.ACCOUNT_PROFILE',
    businessName: 'DWS 账户画像辅助主题',
    description: '账户、客户和机构的辅助主题，字段用途与责任边界还需要补充。',
    assetType: 'table',
    steward: '账户域 Steward',
    tags: ['账户', '客户口径', '辅助主题'],
    lifecycle: 'active',
    freshnessMetadata: currentFreshness,
    sensitivity: 'restricted',
    fields: profileFields,
    businessDefinition: profileDefinition,
    definitionCompleteness: 'ambiguous',
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dws-account-profile',
      note: '已连接 DWS.ACCOUNT_PROFILE 节点，但辅助主题的消费边界仍需人工确认。',
    },
  },
  {
    id: 'ads-deposit-balance-v1',
    technicalName: 'ADS.DEPOSIT_BALANCE_V1',
    businessName: '旧版存款余额报表 V1',
    description: '历史存款余额发布视图，仍有少量使用方，但已经有新的 ADS.DEPOSIT_BALANCE 替代。',
    assetType: 'view',
    owner: '经营分析组',
    steward: 'BI Steward',
    tags: ['存款', 'deprecated', '迁移'],
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
        name: 'deposit_balance',
        label: '旧版存款余额',
        type: 'decimal',
        description: '历史字段，可能与当前存款余额指标口径不同。',
        sensitivity: 'internal',
      },
    ],
    businessDefinition: legacyDefinition,
    definitionCompleteness: 'partial',
    metricDefinition: depositBalanceReference,
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
    id: 'governance-balance-semantic-change',
    assetId: 'dwd-deposit-balance',
    eventType: 'field-change',
    label: 'balance 语义变化',
    description: 'balance 从“快照日余额”调整为新的业务定义，需要重新确认指标卡和下游汇总。',
    sourceEntityId: 'field-dwd-balance',
    affectedEntityId: 'metric-deposit-balance',
    fieldName: 'balance',
    newFieldName: 'available_balance',
    semanticChange: '余额改为可用余额，快照时点和业务边界需要重新评审。',
    evidence: lineageVisualization.investigationEvent?.evidence ?? governanceEventEvidence,
  },
  {
    id: 'governance-ads-deposit-balance-deprecated',
    assetId: 'ads-deposit-balance',
    eventType: 'asset-deprecated',
    label: 'ADS 存款余额指标准备下线',
    description: '发布视图进入 deprecated，停止新增依赖，并沿指标字段通知下游消费者。',
    sourceEntityId: 'field-ads-balance',
    affectedEntityId: 'metric-deposit-report',
    evidence: governanceEventEvidence,
  },
  {
    id: 'governance-account-profile-owner-missing',
    assetId: 'dws-account-profile',
    eventType: 'owner-missing',
    label: '账户辅助主题 Owner 缺失',
    description: '目录只能找到 Steward，不能把账户辅助主题交给新的使用方，先补齐责任人。',
    evidence: governanceEventEvidence,
  },
  {
    id: 'governance-legacy-deposit-balance-retiring',
    assetId: 'ads-deposit-balance-v1',
    eventType: 'asset-retiring',
    label: '旧版存款余额报表进入 retiring',
    description: 'deprecated 资产完成迁移确认后进入 retiring，停止消费并保留迁移记录。',
    evidence: governanceEventEvidence,
  },
  {
    id: 'governance-customer-id-classification-change',
    assetId: 'dwd-deposit-balance',
    eventType: 'sensitivity-change',
    label: 'customer_id 敏感等级上调',
    description: '关联能力扩大后，将 customer_id 从 internal 调整为 sensitive。',
    fieldName: 'customer_id',
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
  subtitle: '面对一条“我要存款余额数据”的申请，沿着资产定义、字段敏感等级和责任人做出使用决定。',
  quickSummary:
    '数据治理要回答三件事：资产是什么、字段能否使用、发生变更后要通知谁；每个决定都要留下证据。',
  opening: {
    eyebrow: '新同事：“我该查哪张表？找谁要权限？”',
    title: '存款余额应该从哪一层取？',
    intro: '新同事已经知道业务词，却不知道该选哪张表、哪些字段能看，以及资产变更后要通知谁。',
    cards: [
      { label: '需求', value: '存款余额', detail: '业务词，不是技术表名' },
      { label: '风险', value: '同名 ≠ 同义', detail: '定义、Owner、生命周期都可能不同' },
      { label: '目标', value: '可复盘决定', detail: '留下依据、影响和剩余风险' },
    ],
    question: '搜索“余额”后，比较候选资产：名字最像的那张，不一定最适合当前分析。',
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
        '目录里故意放入多个“余额”候选：DWS.DEPOSIT_BALANCE 适合经营分析，ADS.DEPOSIT_BALANCE 更接近指标消费，旧版 V1 已经 deprecated，而 DWS.ACCOUNT_PROFILE 虽然相关，却缺 Owner 且粒度含糊。搜索结果要让这些治理差异直接可见。',
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
        '同一个 customer_id，分析师做经营分析时可以使用内部关联键；营销人员做用户触达时需要审批；外部协作者在外部共享场景则被拒绝。策略输出必须告诉学习者依据，而不是只说“无权限”。',
        'allow、masked、approval-required、deny 分别对应直接使用、脱敏后使用、审批后使用和拒绝；申请时要把业务用途写清楚。',
      ],
    },
    {
      kind: 'narrative',
      title: '变更治理要沿现有血缘找影响',
      paragraphs: [
        'balance 的语义变化和 ADS 存款余额指标的下线事件，沿节点和边找到直接下游、传递影响、消费者和通知顺序。发布视图下线时，责任人可以据此安排迁移和通知。',
        '质量检查结果也要进入资产判断：DWD.DEPOSIT_BALANCE 展示缺余额事件、目标字段、分区、失败样本和阻断决定；DWS.DEPOSIT_BALANCE 保留一次通过结果作为对照。资产目录根据这些证据提示风险，不把缺少检查的资产当作通过。',
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
