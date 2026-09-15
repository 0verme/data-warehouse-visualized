import type { LessonContent } from '../types'

export const warehouseLayersContent: LessonContent = {
  eyebrow: '第 02 课 · 沿着一条数据走',
  subtitle: '为什么不直接用一张大宽表？看业务规则一变，分层如何避免几十张报表跟着全改。',
  quickSummary:
    '一条订单明细从接入到报表，会经历保存原貌、清洗统一、公共加工和应用组织这几个不同阶段。',
  concept: {
    term: '数据仓库分层',
    definition:
      '按数据所处的加工阶段和服务职责组织数据。ODS、DWD、DWS、ADS 是常见方式，但不是所有企业的唯一标准。',
  },
  sections: [
    {
      title: '每一层都回答一个问题',
      paragraphs: [
        'ODS 负责原样接住来源数据，保留原始上下文；DWD 负责清洗脏数据、统一字段标准并明确明细粒度；DWS 围绕主题沉淀可复用的统计结果；ADS 则直接面向具体的报表或产品应用。',
      ],
      bullets: [
        '数据从哪里来？——ODS',
        '这条明细是否可信、统一？——DWD',
        '哪些公共逻辑可以复用？——DWS',
        '这个应用现在需要什么？——ADS',
      ],
    },
    {
      title: '分层是在隔离变化',
      paragraphs: [
        '来源系统字段变化时，不应该让每一张报表都跟着修改；公共指标口径变化时，也不应该让所有应用各自重写一遍。清晰的层次让依赖关系更容易观察、测试和回溯。',
      ],
    },
  ],
  visualization: {
    kind: 'pipeline',
    stages: [
      {
        id: 'ods',
        layer: 'ODS',
        title: '原始接入层',
        description: '保留来源数据的主要上下文，建立可回溯的落点。',
        work: '接入与保存',
        output: 'ods_order_event',
      },
      {
        id: 'dwd',
        layer: 'DWD',
        title: '明细标准层',
        description: '清洗、标准化字段，明确一行数据代表什么。',
        work: '清洗与统一',
        output: 'dwd_order_detail',
      },
      {
        id: 'dws',
        layer: 'DWS',
        title: '公共汇总层',
        description: '围绕主题沉淀公共加工结果，减少重复计算。',
        work: '聚合与复用',
        output: 'dws_sales_daily',
      },
      {
        id: 'ads',
        layer: 'ADS',
        title: '应用服务层',
        description: '面向报表、指标或一个具体分析场景组织数据。',
        work: '服务应用',
        output: 'ads_sales_report',
      },
    ],
  },
  code: {
    label: '一段加工关系',
    language: 'sql',
    code: `INSERT INTO dws_sales_daily
SELECT
  paid_date,
  product_category,
  SUM(paid_amount) AS sales_amount
FROM dwd_order_detail
GROUP BY paid_date, product_category;`,
  },
  engineeringTip:
    'ODS / DWD / DWS / ADS 是常见分层方式，而不是行业强制标准。实际项目会根据团队、数据形态、实时性和工具链调整层次。',
  pitfalls: [
    '分层不是越多越好；每增加一层都应有清晰的职责和复用价值。',
    '不要把 ADS 当作永久稳定的公共层，它通常更贴近具体应用和展示需求。',
  ],
}
