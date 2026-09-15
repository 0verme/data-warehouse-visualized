export type ModelingPerspectiveId = 'traditional-dw' | 'medallion' | 'dbt-ae'

export type ModelingPerspectiveComparisonId =
  | 'raw-retention'
  | 'cleaning-standardization'
  | 'detail-grain'
  | 'intermediate-reuse'
  | 'aggregation'
  | 'business-semantics'
  | 'consumer-product'
  | 'historical-trace'
  | 'quality-responsibility'
  | 'collaboration'

export type ModelingOrderRow = Readonly<Record<string, string | number>>

export interface ModelingOrderCase {
  id: string
  label: string
  source: string
  grain: string
  columns: readonly string[]
  rows: readonly ModelingOrderRow[]
  orderCount: number
  itemCount: number
  totalAmount: number
}

export interface ModelingPerspectiveStage {
  id: string
  label: string
  title: string
  responsibility: string
  output: string
  grain: string
  owner: string
  quality: string
  consumer: string
}

export interface ModelingPerspectiveDefinition {
  id: ModelingPerspectiveId
  label: string
  shortLabel: string
  detail: string
  summary: string
  transformationOwner: string
  qualityResponsibility: string
  consumerBoundary: string
  historyApproach: string
  collaborationApproach: string
  boundaryNote: string
  stages: readonly ModelingPerspectiveStage[]
}

export interface ModelingPerspectiveView extends ModelingPerspectiveDefinition {
  caseId: string
}

export interface ModelingPerspectiveComparisonRow {
  id: ModelingPerspectiveComparisonId
  label: string
  values: Readonly<Record<ModelingPerspectiveId, string>>
}

export const MODELING_ORDER_CASE: ModelingOrderCase = {
  id: 'order-case-1001-1002',
  label: '电商订单明细案例',
  source: 'order_raw',
  grain: '一行 = 一个订单中的一个商品',
  columns: ['order_id', 'user_id', 'product_id', 'shop_id', 'quantity', 'unit_price', 'amount'],
  rows: [
    {
      order_id: '1001',
      user_id: 'U01',
      product_id: 'P01',
      shop_id: 'S01',
      quantity: 1,
      unit_price: 100,
      amount: 100,
    },
    {
      order_id: '1001',
      user_id: 'U01',
      product_id: 'P02',
      shop_id: 'S01',
      quantity: 2,
      unit_price: 100,
      amount: 200,
    },
    {
      order_id: '1002',
      user_id: 'U02',
      product_id: 'P03',
      shop_id: 'S02',
      quantity: 1,
      unit_price: 180,
      amount: 180,
    },
  ],
  orderCount: 2,
  itemCount: 3,
  totalAmount: 480,
}

export const MODELING_PERSPECTIVE_IDS: readonly ModelingPerspectiveId[] = [
  'traditional-dw',
  'medallion',
  'dbt-ae',
]

export const MODELING_PERSPECTIVES: readonly ModelingPerspectiveDefinition[] = [
  {
    id: 'traditional-dw',
    label: '传统数仓',
    shortLabel: 'ODS → DWD → DWS → ADS',
    detail: '以数仓层级和下游服务边界组织加工。',
    summary: '把来源接入、明细标准化、主题复用和应用服务拆成层级职责。',
    transformationOwner: '数仓 / 数据开发团队按层负责；平台与调度提供运行边界。',
    qualityResponsibility:
      '各层承担不同发布检查：DWD 看粒度与标准化，DWS / ADS 还要对账并守住业务口径。',
    consumerBoundary: 'ADS 通常是报表或应用的消费边界；ODS、DWD、DWS 通过约定供下游复用。',
    historyApproach:
      '原始追溯通常依赖 ODS 保留、分区和维度历史设计；层名本身不会自动提供 time travel。',
    collaborationApproach: '按层或主题发布 ETL / SQL，由集中调度和表依赖串起交付。',
    boundaryNote: 'DWS 常沉淀主题公共汇总，但“公共汇总”只是职责，不是所有体系中 Gold 的同义词。',
    stages: [
      {
        id: 'ods',
        label: 'ODS',
        title: '接住来源与上下文',
        responsibility: '把订单来源落下来，尽量保留来源字段、接入批次和可回溯上下文。',
        output: 'ods_order_item',
        grain: '来源记录 / 接入批次（随源系统定义）',
        owner: '接入与数仓平台团队',
        quality: '检查到达、分区和来源追踪；业务规则通常后置。',
        consumer: '供 DWD 读取，不直接作为稳定 BI 接口。',
      },
      {
        id: 'dwd',
        label: 'DWD',
        title: '对齐明细粒度',
        responsibility: '清洗类型、命名和重复记录，明确一行订单明细与可度量金额。',
        output: 'dwd_order_item',
        grain: '一行 = 一个订单中的一个商品',
        owner: '数仓建模 / ETL 团队',
        quality: '负责主键、粒度、关联完整性和标准化字段。',
        consumer: '供主题加工、指标和受控的明细分析复用。',
      },
      {
        id: 'dws',
        label: 'DWS',
        title: '沉淀主题公共逻辑',
        responsibility: '把订单明细加工成可跨报表复用的主题结果，例如用户日或店铺日。',
        output: 'dws_shop_day / dws_user_day',
        grain: '一行 = 一个主题实体在一天的汇总',
        owner: '主题数仓 / 数据开发团队',
        quality: '负责公共指标对账、汇总一致性和跨下游复用的稳定性。',
        consumer: '供多个 ADS、BI 或指标服务使用，但不等于最终展示。',
      },
      {
        id: 'ads',
        label: 'ADS',
        title: '组织消费数据产品',
        responsibility: '把业务语义落实到日报、看板或应用需要的字段与粒度。',
        output: 'ads_sales_report',
        grain: '一行 = 报表要求的日期 × 店铺 × 商品分类',
        owner: '应用 / 报表 owner 与数据团队协作',
        quality: '负责消费契约、交付时效、展示字段和最终口径验收。',
        consumer: '面向 BI、报表或应用；消费者通常不再自行拼接底层层级。',
      },
    ],
  },
  {
    id: 'medallion',
    label: 'Medallion Architecture',
    shortLabel: 'Bronze → Silver → Gold',
    detail: '以数据逐步变得可用的成熟度组织加工。',
    summary: '用 Bronze、Silver、Gold 表达从原始保留到可消费数据产品的演进。',
    transformationOwner: '领域数据产品团队可端到端负责；平台团队更多负责存储、运行和共享能力。',
    qualityResponsibility:
      '每层都要有可观察的质量信号；Gold 的产品 owner 对语义、SLA 和消费者体验负责。',
    consumerBoundary:
      'Gold 是常见的业务消费边界，但可以同时产出明细、宽表或聚合，不由颜色决定粒度。',
    historyApproach:
      'Bronze 往往强调原始追加保留；是否有快照、版本和长期历史，仍取决于表格式、保留策略与设计。',
    collaborationApproach: '按领域数据产品协作，平台提供运行底座，团队通过数据契约和发布流程交付。',
    boundaryNote:
      'Gold 可以是明细数据产品，也可以是聚合；它不是 DWS 的英文版，颜色不会替你声明 Grain。',
    stages: [
      {
        id: 'bronze',
        label: 'Bronze',
        title: '保留原始到达事实',
        responsibility: '保留订单原貌与 ingestion metadata，让后续模型仍能回到来源上下文。',
        output: 'bronze_orders',
        grain: '一行 = 一条到达的原始记录 / 事件',
        owner: '摄取与平台团队',
        quality: '关注到达、解析、schema 漂移和重复信号；不把所有业务规则前置。',
        consumer: '主要供 Silver 与技术探索使用，不是默认业务报表接口。',
      },
      {
        id: 'silver',
        label: 'Silver',
        title: '清洗并形成可复用明细',
        responsibility: '去重、类型统一、身份与业务键对齐，形成稳定的订单明细记录。',
        output: 'silver_order_items',
        grain: '一行 = 一个订单中的一个商品',
        owner: '领域数据工程 / 数据产品团队',
        quality: '负责记录级校验、明细粒度、标准化和跨来源一致性。',
        consumer: '供 Gold 和后续变换复用；是否开放直查由产品边界决定。',
      },
      {
        id: 'gold',
        label: 'Gold',
        title: '发布面向业务的数据产品',
        responsibility: '把业务语义封装成消费者可用的结果，可同时发布明细、宽表和聚合。',
        output: 'gold_order_items / gold_sales_daily',
        grain: '由数据产品定义：可以是明细、宽表或聚合',
        owner: '领域数据产品 owner',
        quality: '负责语义测试、SLA、消费者契约和产品级对账。',
        consumer: '面向 BI、指标、ML 或应用；Gold 不限定唯一消费方式。',
      },
    ],
  },
  {
    id: 'dbt-ae',
    label: 'dbt / Analytics Engineering',
    shortLabel: 'Sources / Raw → Staging → Intermediate → Marts',
    detail: '以模型代码、依赖和业务语义协作组织加工。',
    summary: '把上游引用、轻量标准化、可复用中间模型和业务 Marts 放进可协作的模型图。',
    transformationOwner:
      'Analytics Engineer / 领域团队拥有 SQL 模型；平台负责 warehouse 与执行环境。',
    qualityResponsibility:
      'Source freshness、模型 tests、contracts 和业务语义检查分布在 owner 负责的模型边界上。',
    consumerBoundary:
      'Marts 是常见的消费模型边界；Sources / Staging / Intermediate 通常不是最终业务接口。',
    historyApproach:
      '历史是否存在取决于 incremental、snapshot 或上游表的设计；Marts 这个名字不自动带来历史。',
    collaborationApproach: '模型代码进入 Git，以 PR、代码评审、CI、文档和依赖图协作发布。',
    boundaryNote:
      'Sources / Raw 更像上游关系的声明与读取入口；dbt 不因为声明 source 就拥有原始落地。',
    stages: [
      {
        id: 'sources-raw',
        label: 'Sources / Raw',
        title: '引用上游，而非假装拥有原始层',
        responsibility: '声明并读取上游订单关系，保留 source freshness、列信息和来源边界。',
        output: 'source: ecommerce.orders',
        grain: '由上游关系定义；本层不重新声明业务 Grain',
        owner: '业务源系统 / ingestion owner',
        quality: '可声明 freshness、schema 和到达检查，但源数据修复仍由上游负责。',
        consumer: '作为 staging 的输入；不是 dbt 默认发布给业务用户的产品。',
      },
      {
        id: 'staging',
        label: 'Staging',
        title: '一源一模型地标准化',
        responsibility: '重命名、类型转换、轻量清洗，建立可读且接近来源的模型接口。',
        output: 'stg_orders / stg_order_items',
        grain: '通常保持来源一行，除非模型明确记录了变化',
        owner: '负责该 source 的 Analytics Engineer',
        quality: '负责 not-null、unique、relationships 等模型边界测试。',
        consumer: '主要供 Intermediate 与 Marts 使用，避免每个消费者重复清洗。',
      },
      {
        id: 'intermediate',
        label: 'Intermediate',
        title: '复用业务变换逻辑',
        responsibility: '组合订单、用户和商品逻辑，形成可复用的明细或中间关系。',
        output: 'int_order_items / int_customer_orders',
        grain: '由中间模型声明，可保持明细也可形成过程性关系',
        owner: '领域 Analytics Engineering 团队',
        quality: '负责可复用逻辑的测试、依赖稳定性和模型 contract。',
        consumer: '通常只服务 Marts；不以直接面向业务消费为目标。',
      },
      {
        id: 'marts',
        label: 'Marts',
        title: '把语义交给业务消费者',
        responsibility: '发布事实、维度、指标或报表模型，把业务命名和口径固化为产品。',
        output: 'fct_order_items / dim_customer / mart_sales_daily',
        grain: '由消费问题定义；一个 Mart 家族可以包含多种 Grain',
        owner: '领域数据产品 / Analytics Engineer owner',
        quality: '负责业务指标测试、文档、exposure、SLA 与消费者验收。',
        consumer: '面向 BI、metrics、ML 或 reverse ETL 等明确消费边界。',
      },
    ],
  },
]

export const MODELING_PERSPECTIVE_COMPARISON: readonly ModelingPerspectiveComparisonRow[] = [
  {
    id: 'raw-retention',
    label: '原始数据保留',
    values: {
      'traditional-dw': 'ODS 常保留来源形态与批次；保留周期、可查询性由数仓策略决定。',
      medallion: 'Bronze 通常强调原始 / 追加记录与 ingestion metadata；仍要定义 retention。',
      'dbt-ae': 'Sources / Raw 多是对上游关系的声明与读取入口；原始落地由 ingestion owner 负责。',
    },
  },
  {
    id: 'cleaning-standardization',
    label: '清洗与标准化',
    values: {
      'traditional-dw': 'DWD 集中处理字段、类型、重复和明细粒度。',
      medallion: 'Silver 把跨来源清洗和 conformed detail 变成可复用输入。',
      'dbt-ae': 'Staging 做接近来源的标准化；更深的业务组合通常后移。',
    },
  },
  {
    id: 'detail-grain',
    label: '明细数据 / Grain',
    values: {
      'traditional-dw': 'DWD 常明确事实明细 Grain，例如一行一个订单商品。',
      medallion: 'Silver 常承载明细，但 Gold 也可以发布明细，颜色不决定 Grain。',
      'dbt-ae': 'Grain 写在每个模型的 contract / 文档里，Staging、Intermediate、Marts 都可能不同。',
    },
  },
  {
    id: 'intermediate-reuse',
    label: '中间复用',
    values: {
      'traditional-dw': 'DWS 以主题公共结果减少多个 ADS 的重复加工。',
      medallion: 'Silver 或 Gold 之间可以有共享变换；三种颜色不规定唯一中间层。',
      'dbt-ae': 'Intermediate 明确承载可组合、通常不直接消费的模型逻辑。',
    },
  },
  {
    id: 'aggregation',
    label: '聚合与业务语义',
    values: {
      'traditional-dw': 'DWS 常做主题汇总，ADS 再贴近报表语义和展示粒度。',
      medallion: 'Gold 可以是聚合，也可以是带完整语义的明细 / 宽表。',
      'dbt-ae': '聚合位置取决于模型设计；Marts 负责把指标语义交给消费者。',
    },
  },
  {
    id: 'business-semantics',
    label: '业务语义落点',
    values: {
      'traditional-dw': '从 DWS 的主题口径到 ADS 的应用口径逐层收敛。',
      medallion: '通常在 Gold 数据产品中收敛，但 Gold 不是固定的表类型。',
      'dbt-ae': '在模型 SQL、文档、tests、metrics / exposures 等协作资产中显式表达。',
    },
  },
  {
    id: 'consumer-product',
    label: '面向消费的数据产品',
    values: {
      'traditional-dw': 'ADS 是常见的报表 / 应用边界，服务具体消费需求。',
      medallion: 'Gold 是常见消费边界，可能服务 BI、ML 或应用。',
      'dbt-ae': 'Marts 是常见消费模型家族，强调可发现、可测试和可协作。',
    },
  },
  {
    id: 'historical-trace',
    label: '历史追溯',
    values: {
      'traditional-dw': '依赖 ODS 留存、分区、SCD 或快照设计；层名不等于 time travel。',
      medallion: 'Bronze 留存有助于回放；版本、快照与 Gold 历史仍需单独设计。',
      'dbt-ae': '通过 incremental / snapshot 或上游历史模型实现；Marts 名称本身不保证历史。',
    },
  },
  {
    id: 'quality-responsibility',
    label: '数据质量责任',
    values: {
      'traditional-dw': '按层设发布门，DWD 守粒度与标准化，DWS / ADS 守口径与交付。',
      medallion: '各层发出质量信号，Gold owner 对数据产品语义和 SLA 负责。',
      'dbt-ae': '质量跟随 source、model、contract 和业务 owner，测试进入代码协作流程。',
    },
  },
  {
    id: 'collaboration',
    label: '开发协作方式',
    values: {
      'traditional-dw': '以层 / 主题任务、表依赖和集中调度组织发布。',
      medallion: '以领域数据产品、平台能力和契约协作，层色是共享沟通语言。',
      'dbt-ae': '以 Git 中的模型代码、PR、CI、文档和依赖图协作。',
    },
  },
]

export function getModelingPerspective(id: ModelingPerspectiveId): ModelingPerspectiveDefinition {
  const perspective = MODELING_PERSPECTIVES.find((item) => item.id === id)

  if (!perspective) {
    throw new RangeError(`Unknown modeling perspective: ${id}`)
  }

  return perspective
}

export function buildModelingPerspectiveView(id: ModelingPerspectiveId): ModelingPerspectiveView {
  const perspective = getModelingPerspective(id)

  return {
    ...perspective,
    caseId: MODELING_ORDER_CASE.id,
    stages: perspective.stages.map((stage) => ({ ...stage })),
  }
}

export function getModelingPerspectiveComparison(): ModelingPerspectiveComparisonRow[] {
  return MODELING_PERSPECTIVE_COMPARISON.map((row) => ({
    ...row,
    values: { ...row.values },
  }))
}
