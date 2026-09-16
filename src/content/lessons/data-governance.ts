import type {
  GovernanceAsset,
  GovernanceChangeImpact,
  GovernanceField,
  GovernanceLifecycleEvent,
  GovernanceQualityCase,
  GovernanceVisualization,
  LineageEdge,
  LineageNode,
} from '../../types'
import type { LessonContent } from '../types'

const accountBalanceFields: GovernanceField[] = [
  {
    name: 'business_date',
    label: '业务日期',
    type: 'date',
    description: '这条余额快照归属的业务日，不是数据到达平台的时间。',
    sensitivity: 'public',
  },
  {
    name: 'branch_id',
    label: '机构标识',
    type: 'string',
    description: '账户所属 Branch，用于机构维度的经营分析。',
    sensitivity: 'internal',
  },
  {
    name: 'product_type',
    label: '存款产品类型',
    type: 'string',
    description: 'Account 关联的 Product 分类，例如活期、定期。分类语义发生变化时需要重新确认。',
    sensitivity: 'internal',
    semanticStatus: 'stable',
    lineageNodeId: 'field-account-product-type',
  },
  {
    name: 'deposit_balance',
    label: '存款余额',
    type: 'decimal',
    description: 'AccountBalanceSnapshot 在该业务日的余额状态，不是 Transaction 发生额。',
    sensitivity: 'internal',
  },
  {
    name: 'customer_name',
    label: 'Customer.name',
    type: 'string',
    description: '账户关联 Customer 的名称，经营分析不需要读取个体姓名。',
    sensitivity: 'sensitive',
  },
  {
    name: 'mobile',
    label: 'AccountMedium.mobile',
    type: 'string',
    description: '账户介质中的手机号，客户服务可能需要，但不应暴露完整原值。',
    sensitivity: 'restricted',
    maskingStrategy: '只保留前三位和末四位',
    maskingSample: '13812345678',
  },
  {
    name: 'account_no',
    label: 'AccountMedium.account_no',
    type: 'string',
    description: '账户介质中的账号。经营分析只需要聚合结果，不能把完整账号带入导出。',
    sensitivity: 'restricted',
    maskingStrategy: '保留前四位和后四位',
    maskingSample: '6222 1234 5678 9012',
  },
]

const dwsFieldNames = ['business_date', 'branch_id', 'product_type', 'deposit_balance']
const dwsFields: GovernanceField[] = accountBalanceFields.filter(
  (field) => dwsFieldNames.indexOf(field.name) >= 0,
)

const governanceAssets: GovernanceAsset[] = [
  {
    id: 'dwd-account-balance-detail',
    technicalName: 'dwd_account_balance_detail',
    businessName: '账户余额明细',
    description:
      'AccountBalanceSnapshot 的账户级明细，保留 Account、Branch、Product 和账户介质字段，适合核对单个账户。',
    assetType: 'table',
    owner: '账户数据组',
    tags: ['存款余额', '账户明细', 'AccountBalanceSnapshot'],
    lifecycle: 'active',
    freshnessMetadata: {
      lastUpdatedAt: '昨天 06:20',
      expectedRefresh: '每天 06:30',
      observedDelayMinutes: 0,
      status: 'current',
    },
    qualityStatus: 'pass',
    qualityNote: '第 06 章已经提供通过状态；本节只消费这个结果。',
    sensitivity: 'restricted',
    fields: accountBalanceFields,
    businessDefinition: {
      summary: '一行代表一个 Account 在某个 business_date 的余额快照。',
      grain: 'Account × business_date',
      scope: '包含账户、机构、产品和账户介质字段，适合明细核对。',
      exclusions: '不代表一笔 Transaction，也不直接回答机构汇总问题。',
    },
    definitionCompleteness: 'complete',
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dwd-account-balance-detail',
      note: '第 07 章已经登记 Account.product_type 到该明细资产的影响关系。',
    },
  },
  {
    id: 'dws-deposit-balance-daily',
    technicalName: 'dws_deposit_balance_daily',
    businessName: '机构存款余额日汇总',
    description:
      '按 Branch、Product 和 business_date 汇总的存款余额，正好服务普通经营分析人员的机构视角。',
    assetType: 'table',
    owner: '存款指标组',
    tags: ['存款余额', '机构分析', '产品分析', '日汇总'],
    lifecycle: 'active',
    freshnessMetadata: {
      lastUpdatedAt: '昨天 06:35',
      expectedRefresh: '每天 06:40',
      observedDelayMinutes: 0,
      status: 'current',
    },
    qualityStatus: 'pass',
    qualityNote: '第 06 章已经确认昨天业务日的 Quality；本节不重新运行检查。',
    sensitivity: 'internal',
    fields: dwsFields,
    businessDefinition: {
      summary: '一行代表一个 Branch、Product 在一个 business_date 的存款余额汇总。',
      grain: 'Branch × Product × business_date',
      scope: '服务机构和产品维度的经营分析，不暴露账户级联系方式。',
      exclusions: '不用于单个账户核对，也不包含 Customer.name、mobile 或 account_no。',
    },
    definitionCompleteness: 'complete',
    lineageEvidence: {
      status: 'linked',
      nodeId: 'dws-deposit-balance-daily',
      note: '第 07 章已经登记该日汇总受 Account.product_type 变化影响。',
    },
  },
  {
    id: 'ads-deposit-balance',
    technicalName: 'ads_deposit_balance',
    businessName: '存款余额经营分析结果',
    description: '为固定经营分析页面准备的结果资产，查询更直接，但使用范围依赖该页面的分析口径。',
    assetType: 'view',
    owner: '经营分析组',
    tags: ['存款余额', '应用结果', '经营分析'],
    lifecycle: 'active',
    freshnessMetadata: {
      lastUpdatedAt: '昨天 07:05',
      expectedRefresh: '每天 07:10',
      observedDelayMinutes: 0,
      status: 'current',
    },
    qualityStatus: 'pass',
    qualityNote: '第 06 章已确认发布结果状态；仍需核对它是否回答当前问题。',
    sensitivity: 'internal',
    fields: dwsFields,
    businessDefinition: {
      summary: '一行代表经营分析页面所需的机构、产品和业务日余额结果。',
      grain: 'Branch × Product × business_date',
      scope: '适合该页面的固定查询和展示。',
      exclusions: '不等于所有存款余额问题的通用明细来源，复用前要核对页面范围。',
    },
    definitionCompleteness: 'complete',
    lineageEvidence: {
      status: 'linked',
      nodeId: 'ads-deposit-balance',
      note: '第 07 章已经登记该应用结果受日汇总语义变化影响。',
    },
  },
  {
    id: 'ads-deposit-balance-old',
    technicalName: 'ads_deposit_balance_old',
    businessName: '旧版存款余额应用资产',
    description: '仍能搜索和查询的历史结果资产，但已经 deprecated，并有明确的替代资产。',
    assetType: 'view',
    owner: '经营分析组',
    tags: ['存款余额', 'deprecated', '迁移'],
    lifecycle: 'deprecated',
    replacementAssetId: 'ads-deposit-balance',
    freshnessMetadata: {
      lastUpdatedAt: '7 天前',
      expectedRefresh: '已停止更新',
      observedDelayMinutes: 10080,
      status: 'delayed',
    },
    qualityStatus: 'pass',
    qualityNote: '即使历史检查曾通过，也不能抵消 deprecated 状态。',
    sensitivity: 'internal',
    fields: dwsFields,
    businessDefinition: {
      summary: '历史页面使用的机构存款余额结果。',
      grain: 'Branch × business_date',
      scope: '只用于迁移期间的结果比对。',
      exclusions: '不应建立新的生产依赖。',
    },
    definitionCompleteness: 'complete',
    lineageEvidence: {
      status: 'partial',
      note: '第 07 章影响结果只保留迁移提示，不能把旧资产当作新的默认来源。',
    },
  },
]

const bankingLineageNodes: LineageNode[] = [
  {
    id: 'field-account-product-type',
    label: 'Account.product_type',
    layer: 'SOURCE',
    role: 'Product 分类字段',
    x: 80,
    y: 130,
    entityType: 'field',
  },
  {
    id: 'dwd-account-balance-detail',
    label: 'dwd_account_balance_detail',
    layer: 'DWD',
    role: '账户余额明细',
    x: 300,
    y: 130,
    entityType: 'table',
  },
  {
    id: 'dws-deposit-balance-daily',
    label: 'dws_deposit_balance_daily',
    layer: 'DWS',
    role: '机构 × 产品日汇总',
    x: 520,
    y: 130,
    entityType: 'table',
  },
  {
    id: 'ads-deposit-balance',
    label: 'ads_deposit_balance',
    layer: 'ADS',
    role: '经营分析结果',
    x: 740,
    y: 130,
    entityType: 'table',
  },
  {
    id: 'metric-deposit-product-mix',
    label: '存款产品结构分析',
    layer: 'METRIC',
    role: '下游消费者',
    x: 960,
    y: 130,
    entityType: 'metric',
  },
]

const bankingLineageEdges: LineageEdge[] = [
  {
    source: 'field-account-product-type',
    target: 'dwd-account-balance-detail',
    relation: 'transform',
    confidence: 'confirmed',
    evidence: {
      source: 'manual_metadata',
      detail: '第 07 章已确认字段进入账户余额明细。',
    },
  },
  {
    source: 'dwd-account-balance-detail',
    target: 'dws-deposit-balance-daily',
    relation: 'transform',
    confidence: 'confirmed',
    evidence: {
      source: 'manual_metadata',
      detail: '第 07 章已确认账户明细参与机构产品日汇总。',
    },
  },
  {
    source: 'dws-deposit-balance-daily',
    target: 'ads-deposit-balance',
    relation: 'derives',
    confidence: 'confirmed',
    evidence: {
      source: 'manual_metadata',
      detail: '第 07 章已确认日汇总进入应用结果。',
    },
  },
  {
    source: 'ads-deposit-balance',
    target: 'metric-deposit-product-mix',
    relation: 'consumes',
    confidence: 'confirmed',
    evidence: {
      source: 'manual_metadata',
      detail: '第 07 章已确认应用结果服务存款产品结构分析。',
    },
  },
]

const productTypeChangeImpact: GovernanceChangeImpact = {
  evidenceLabel: '第 07 章已经完成的影响分析结果',
  changedField: 'Account.product_type',
  path: [
    'Account.product_type',
    'dwd_account_balance_detail',
    'dws_deposit_balance_daily',
    'ads_deposit_balance',
    '存款产品结构分析',
  ],
  responsibilities: [
    {
      id: 'responsibility-source-product-type',
      kind: 'source',
      label: 'Account.product_type',
      assetId: 'dwd-account-balance-detail',
      owner: '账户数据组',
      action: '确认新的产品分类语义与生效时间。',
    },
    {
      id: 'responsibility-dwd-product-type',
      kind: 'asset',
      label: 'dwd_account_balance_detail',
      assetId: 'dwd-account-balance-detail',
      owner: '账户数据组',
      action: '确认明细加工是否需要调整，并重新核对字段定义。',
    },
    {
      id: 'responsibility-dws-product-type',
      kind: 'asset',
      label: 'dws_deposit_balance_daily',
      assetId: 'dws-deposit-balance-daily',
      owner: '存款指标组',
      action: '确认机构 × 产品汇总逻辑是否需要调整。',
    },
    {
      id: 'responsibility-ads-product-type',
      kind: 'asset',
      label: 'ads_deposit_balance',
      assetId: 'ads-deposit-balance',
      owner: '经营分析组',
      action: '确认应用结果和展示逻辑是否需要调整。',
    },
    {
      id: 'responsibility-consumer-product-type',
      kind: 'consumer',
      label: '存款产品结构分析',
      owner: '经营分析使用方',
      action: '确认分析结论是否需要重新解释或迁移。',
    },
  ],
}

const productTypeChangeEvent: GovernanceLifecycleEvent = {
  id: 'governance-account-product-type-change',
  assetId: 'dwd-account-balance-detail',
  eventType: 'field-change',
  label: 'Account.product_type 语义变化',
  description: '产品分类规则发生调整；第 07 章已经给出受影响资产，本节只分配处理责任。',
  sourceEntityId: 'field-account-product-type',
  fieldName: 'product_type',
  semanticChange: '活期、定期的分类边界需要重新确认。',
  evidence: {
    source: 'manual_metadata',
    detail: '消费第 07 章已完成的字段影响分析。',
  },
}

const baseVisualization = {
  assets: governanceAssets,
  lineageNodes: bankingLineageNodes,
  lineageEdges: bankingLineageEdges,
  events: [productTypeChangeEvent],
} satisfies Omit<GovernanceVisualization, 'kind' | 'focus'>

export const governanceVisualizations = {
  assetSelection: {
    kind: 'governance',
    focus: 'asset-selection',
    ...baseVisualization,
  },
  evidenceCheck: {
    kind: 'governance',
    focus: 'evidence-check',
    ...baseVisualization,
    qualityCases: [
      {
        id: 'quality-case-a',
        label: '资产 A',
        assetId: 'dws-deposit-balance-daily',
        semanticMatch: true,
        grainMatch: true,
        qualityStatus: 'pass',
        freshnessLabel: '昨天',
        freshnessStatus: 'current',
        evidence: ['第 06 章 Quality status：PASS', '检查目标覆盖昨天业务日分区'],
      },
      {
        id: 'quality-case-b',
        label: '资产 B',
        assetId: 'dws-deposit-balance-daily',
        semanticMatch: true,
        grainMatch: true,
        qualityStatus: 'pass',
        freshnessLabel: '7 天前',
        freshnessStatus: 'delayed',
        evidence: ['第 06 章 Quality status：PASS', 'Freshness 已超过当前业务日需求'],
      },
      {
        id: 'quality-case-c',
        label: '资产 C',
        assetId: 'dws-deposit-balance-daily',
        semanticMatch: true,
        grainMatch: true,
        qualityStatus: 'unknown',
        freshnessLabel: '昨天',
        freshnessStatus: 'current',
        evidence: ['Freshness 显示昨天', '没有可确认的 Quality status'],
      },
    ] satisfies GovernanceQualityCase[],
  },
  fieldAccess: {
    kind: 'governance',
    focus: 'field-access',
    ...baseVisualization,
  },
  lifecycle: {
    kind: 'governance',
    focus: 'lifecycle',
    ...baseVisualization,
  },
  changeResponsibility: {
    kind: 'governance',
    focus: 'change-responsibility',
    ...baseVisualization,
    changeImpact: productTypeChangeImpact,
  },
} satisfies Record<string, GovernanceVisualization>

export const governanceVisualization = governanceVisualizations.assetSelection
export const governanceEvidenceVisualization = governanceVisualizations.evidenceCheck
export const governanceFieldAccessVisualization = governanceVisualizations.fieldAccess
export const governanceLifecycleVisualization = governanceVisualizations.lifecycle
export const governanceChangeResponsibilityVisualization =
  governanceVisualizations.changeResponsibility

const sharedOpeningCards = [
  { label: '角色', value: '经营分析人员', detail: '按机构和产品查看业务日余额' },
  { label: '资产', value: '存款余额', detail: '业务词还不是技术资产' },
  { label: '判断', value: '能不能用', detail: '每一步都要有证据' },
]

export const dataGovernanceContent: LessonContent = {
  eyebrow: '第 08 章 · 选对资产',
  subtitle: '搜索到相关资产以后，先读懂它的一行含义，再决定它是否回答当前问题。',
  quickSummary: '名称相似的资产可能有不同 Grain、范围和排除项；当前需求决定哪一份更合适。',
  opening: {
    eyebrow: '经营分析人员今天要看昨天的机构存款余额',
    title: '搜到三张“存款余额”，我到底该用哪张？',
    intro: '搜索框给了你四个结果。它们都能返回数字，但数字回答的问题并不相同。',
    cards: sharedOpeningCards,
    question: '名字最像的，未必是当前问题真正需要的资产。',
  },
  concept: {
    term: '搜索到了 ≠ 适合使用',
    definition:
      '用业务定义、已有 Grain、范围和排除项对照当前需求。Grain 在第 02 章已经学过，本节只消费它来判断一行是否回答当前问题。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '“存款余额”只是搜索词，不是答案',
      paragraphs: [
        '经营分析人员需要按机构查看某业务日的余额。账户明细、机构产品日汇总和应用结果都可能被搜到，不能只看技术名里的 DWD、DWS 或 ADS。',
        '先问一行代表什么：账户明细回答单个 Account 的核对问题，日汇总回答 Branch × Product 的经营分析问题，应用结果还要继续核对它服务的页面范围。',
      ],
      bullets: [
        '业务名称帮助发现候选。',
        '技术名称帮助定位资产。',
        '定义、Grain、范围和排除项决定能否回答当前问题。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '08-1 · 资产发现',
      title: '对比候选定义，再做一次选择',
      description: '输入“存款余额”，打开候选资产的定义卡，选择真正匹配机构经营分析的那一份。',
      visualization: governanceVisualization,
    },
    {
      kind: 'takeaway',
      title: '当前场景选择 dws_deposit_balance_daily',
      text: '它的一行是 Branch × Product × business_date，正好回答机构和产品维度的昨天余额。这个结论只对当前问题成立。',
      bullets: [
        'DWD 不低级，只是更适合账户明细核对。',
        'ADS 不天然更高级，还要核对它服务的应用范围。',
      ],
    },
    {
      kind: 'pitfall',
      title: '别把层级当成推荐理由',
      text: 'DWS、DWD、ADS 是技术位置。资产是否正确，取决于它是否真正回答当前问题。',
    },
  ],
}

export const governanceEvidenceContent: LessonContent = {
  eyebrow: '第 08 章 · 使用前核对证据',
  subtitle: '语义匹配以后，再看 Quality status 和 Freshness 是否满足昨天业务日的需求。',
  quickSummary:
    '当前是否适合使用，要同时看定义、Grain、Quality 和 Freshness，结论必须带证据和原因。',
  opening: {
    eyebrow: '今天需要查看昨天业务日的数据',
    title: '找对了资产，今天这份数据真的能用吗？',
    intro: '三份候选的定义都能回答机构存款余额，但它们的质量状态和更新时间不同。',
    cards: [
      { label: '语义', value: '匹配', detail: '都能回答同一个分析问题' },
      { label: '证据', value: 'Quality + Freshness', detail: '两项都要看' },
      { label: '输出', value: '结论 + 依据', detail: '不要编造分数' },
    ],
    question: 'PASS 但停在 7 天前的数据，仍然不适合回答昨天的业务问题。',
  },
  concept: {
    term: '使用判断需要证据',
    definition:
      'Quality status 和 Freshness 是第 06 章已经提供的判断输入。本节不重新运行检查，只把它们与当前业务日期放在一起比较。',
  },
  sections: [
    {
      kind: 'narrative',
      title: 'PASS 只说明质量检查的结果',
      paragraphs: [
        '资产 A 的 Quality 是 PASS，Freshness 是昨天；资产 B 的 Quality 也是 PASS，但只更新到 7 天前；资产 C 更新到昨天，却没有可确认的 Quality status。',
        '这三份证据不能压成一个数字。当前是否适合使用，要说明哪一项满足、哪一项阻断，以及阻断的原因。',
      ],
      bullets: [
        'Quality PASS 不会自动保证数据满足今天的时间要求。',
        'Freshness 新也不会把 UNKNOWN 变成 PASS。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '08-2 · 证据对比',
      title: '把“能不能用”说成一组证据',
      description: '依次查看三份候选，观察结论如何随 Quality status 和 Freshness 改变。',
      visualization: governanceEvidenceVisualization,
    },
    {
      kind: 'takeaway',
      title: '结论要能被复核',
      text: '资产 A 可以使用，因为定义和 Grain 匹配、Quality 已确认、Freshness 满足昨天业务日。B 因为过期暂不建议使用，C 因为 Quality UNKNOWN 暂不建议使用。',
      bullets: ['治理判断消费前置证据。', '证据不足时，明确说“不建议使用”，不要给出精确可信度。'],
    },
    {
      kind: 'pitfall',
      title: '本节不重新讲质量检查',
      text: '完整性、唯一性、一致性和及时性如何检查属于第 06 章。本节只读取 Quality status 和 Freshness，判断当前业务目的是否有足够证据。',
    },
  ],
}

export const governanceFieldAccessContent: LessonContent = {
  eyebrow: '第 08 章 · 字段级使用',
  subtitle: '资产可以使用，不代表其中的每个字段都应该直接暴露。',
  quickSummary: '同一个经营分析人员换一个用途，必要字段和字段处理方式也可能改变。',
  opening: {
    eyebrow: '同一位使用者，今天有两个业务用途',
    title: '这张表能用，里面的字段都能直接用吗？',
    intro: '按机构和产品分析余额只需要四个字段。账户明细里还有 Customer 和 AccountMedium 的信息。',
    cards: [
      { label: '真正需要', value: '4 个字段', detail: '业务日期、机构、产品、余额' },
      { label: '额外字段', value: 'Customer / AccountMedium', detail: '不因存在就默认可见' },
      { label: '使用输入', value: '角色 + 用途', detail: '同一使用者也要重新判断' },
    ],
    question: '表可以用，字段仍然要按当前目的缩小范围。',
  },
  concept: {
    term: '最小必要数据',
    definition:
      '访问判断可以细到字段：能直接使用的字段直接读，需要保留业务价值的敏感字段先处理，当前用途不需要的字段不直接使用。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先勾选业务真正需要的字段',
      paragraphs: [
        '经营分析人员按 Branch 和 Product 汇总余额，只需要 business_date、branch_id、product_type 和 deposit_balance。customer_name、mobile、account_no 不是这个分析的必要输入。',
        '切换到客户服务用途后，Customer.name 可能变得必要；手机号仍然只展示脱敏值。角色和用途共同决定字段使用范围，不能用一个岗位名称代替判断。',
      ],
      bullets: [
        '公共和内部分析字段可以直接使用。',
        '敏感字段至少要说明为什么需要，以及是否要处理。',
        '页面只保留三类结果：直接使用、处理后使用、当前不能直接使用。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '08-3 · 字段选择',
      title: '勾选字段，再切换业务用途',
      description: '选择最小字段集合，查看同一个经营分析人员在两个用途下得到的字段级使用结果。',
      visualization: governanceFieldAccessVisualization,
    },
    {
      kind: 'takeaway',
      title: '字段不是整张资产的附属信息',
      text: 'Account.account_no 可以在保留首尾的情况下用于核对，customer_name 在经营分析中当前不能直接使用，business_date 和 deposit_balance 则可直接使用。',
      bullets: ['“能用”要落到具体字段。', '脱敏是处理后使用，不等于把原值全部给出。'],
    },
    {
      kind: 'pitfall',
      title: '字段判断要回到当前用途',
      text: '这里用角色和用途练习字段判断，不把一个岗位名称当成所有字段都能读取的理由。',
    },
  ],
}

export const governanceLifecycleContent: LessonContent = {
  eyebrow: '第 08 章 · 生命周期判断',
  subtitle: '能搜索、能查询、有数据，不代表资产仍然适合建立新的依赖。',
  quickSummary: '看到 deprecated 后，停止把旧资产当默认来源，找到替代资产并完成迁移判断。',
  opening: {
    eyebrow: '目录里还留着一张旧结果表',
    title: '旧表还能查到，为什么不应该继续用了？',
    intro:
      '旧资产没有消失，所以搜索和查询都还成功。但它已经 deprecated，历史可访问性不能代替当前推荐。',
    cards: [
      { label: '搜索结果', value: '仍然存在', detail: '能搜索、能查询、有历史数据' },
      { label: '生命周期', value: 'deprecated', detail: '不应建立新的生产依赖' },
      { label: '下一步', value: '迁移', detail: '找到替代资产并核对范围' },
    ],
    question: '可访问不等于仍然推荐继续使用。',
  },
  concept: {
    term: 'deprecated',
    definition:
      'deprecated 表示资产仍可能可读，但已经不再推荐作为新的默认来源。真实系统还可能有 retiring 等过渡状态，本节不展开完整状态机。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '状态会改变“现在该不该继续用”',
      paragraphs: [
        '旧版存款余额应用资产仍有数据，甚至能让查询顺利返回结果。问题在于它的生命周期已经告诉你：这份资产正在退出推荐范围。',
        '迁移时要找到 replacement，比较一行含义和字段范围，再把新的查询依赖切换过去。不能因为旧资产暂时还能查，就继续把它当作默认来源。',
      ],
      bullets: [
        'active：当前可进入使用判断。',
        'deprecated：停止建立新的依赖，寻找替代资产。',
        'retiring 只作为真实系统中的扩展说明。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '08-4 · 生命周期',
      title: '看到 deprecated，切换到替代资产',
      description: '搜索旧版资产，查看状态和替代关系，再切换到当前推荐的应用结果。',
      visualization: governanceLifecycleVisualization,
    },
    {
      kind: 'takeaway',
      title: '迁移是生命周期判断的实际动作',
      text: '旧资产不是因为查询失败才需要迁移。deprecated 状态已经改变了推荐结论，替代资产才是新依赖的落点。',
      bullets: ['先看状态，再看替代关系。', '不要把完整生命周期状态机变成本节的记忆清单。'],
    },
    {
      kind: 'pitfall',
      title: '不要把 08-4 和 08-5 混在一起',
      text: '本节处理旧资产迁移。字段语义变化后的责任分配属于下一节，两者的学习目标不同。',
    },
  ],
}

export const governanceChangeResponsibilityContent: LessonContent = {
  eyebrow: '第 08 章 · 变化后的责任',
  subtitle: '第 07 章已经告诉我们谁会受影响；现在要把影响结果交给对应 Owner 处理。',
  quickSummary: '读取已有影响分析，展开受影响资产，映射 Owner，形成一份可以执行的变更责任清单。',
  opening: {
    eyebrow: 'Account.product_type 的分类语义发生了调整',
    title: '字段变了以后，谁需要处理？',
    intro:
      '影响路径已经由第 07 章整理好。治理判断不再重新跑血缘，而是把路径上的处理动作交给正确的人。',
    cards: [
      { label: '变化', value: 'Account.product_type', detail: '产品分类语义调整' },
      { label: '影响', value: 'DWD → DWS → ADS', detail: '下游分析结果也可能变化' },
      { label: '输出', value: '责任清单', detail: '字段、资产、Owner、动作' },
    ],
    question: '影响范围已经知道以后，真正缺的是：每个受影响对象由谁处理？',
  },
  concept: {
    term: '变更责任清单',
    definition:
      '把前置影响分析中的字段、受影响资产、下游消费者和各自 Owner 对齐，并写出每个 Owner 需要确认的动作。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '第 07 章的影响结果在这里变成动作',
      paragraphs: [
        'Account.product_type 从活期、定期的分类规则开始变化。第 07 章已经确认它会沿 dwd_account_balance_detail、dws_deposit_balance_daily 和 ads_deposit_balance 影响存款产品结构分析。',
        '第 08 章不重复计算这条路径。现在要回答的是：源字段谁确认新语义，日汇总谁确认加工逻辑，应用结果和消费者谁确认展示与分析结论。',
      ],
      bullets: ['先读取已有影响结果。', '再展开受影响资产。', '最后把每个动作交给对应 Owner。'],
    },
    {
      kind: 'visualization',
      eyebrow: '08-5 · 责任清单',
      title: '沿已有影响结果找到处理人',
      description: '展开 Account.product_type 的影响路径，查看每个资产 Owner 需要确认的具体动作。',
      visualization: governanceChangeResponsibilityVisualization,
    },
    {
      kind: 'takeaway',
      title: '影响分析告诉你范围，Owner 决定下一步动作',
      text: '字段变化不会自动变成一张工单。治理课程做到这里：列出受影响对象、对应 Owner 和确认动作，剩下的组织流程由真实系统承接。',
      bullets: [
        '源资产 Owner 确认语义和生效时间。',
        '受影响资产 Owner 确认加工逻辑。',
        '消费者确认分析结果和展示是否需要调整。',
      ],
    },
    {
      kind: 'pitfall',
      title: '责任清单要写到具体动作',
      text: '本节消费第 07 章的影响结果，列出每个 Owner 需要确认的动作；实际组织流程由真实工作环境承接。',
    },
  ],
}
