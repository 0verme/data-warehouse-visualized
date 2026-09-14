import type { LessonContent } from '../types'

export const dataModelingContent: LessonContent = {
  eyebrow: '第 03 课 · 建模先从一行数据开始',
  subtitle: '建模不是先画一张漂亮的 ER 图，而是先把业务过程和一行数据的含义说清楚。',
  quickSummary:
    '面对一份混合了订单、用户、商品和店铺字段的原始数据，先定义 Grain（粒度），再判断哪些字段描述事实、哪些字段提供分析角度。',
  concept: {
    term: 'Grain（粒度）',
    definition:
      '粒度是对“事实表中的一行代表什么”的明确声明。它决定事实字段如何计算、维度如何关联，以及一张表能回答什么问题。',
  },
  sections: [
    {
      title: '先看原始订单数据，再问一行代表什么',
      paragraphs: [
        '下面的记录把订单、用户、商品和店铺信息放在了一起。它看起来很方便，但 order_amount 是整笔订单金额还是商品行金额，单看字段名并不能确定。建模的第一步，就是把这个业务含义问清楚。',
      ],
      bullets: [
        '如果一行代表一个订单，商品字段就无法完整展开。',
        '如果一行代表一个订单商品，订单属性和用户属性可能会重复出现。',
        '如果一行已经是用户日汇总，就不能再把它当作订单明细使用。',
      ],
    },
    {
      title: '四步把业务问题翻译成数据结构',
      paragraphs: [
        '不要先在星型模型和雪花模型之间做选择。先沿着业务问题走完四步：选择业务过程、声明粒度、确定维度、确定事实。结构是这些判断的结果，而不是起点。',
      ],
    },
    {
      title: '一个可落地的商品销售例子',
      paragraphs: [
        '本章后续课程都沿用“商品销售”这个业务过程。我们把粒度声明为“一行代表一个订单中的一个商品明细”，用用户、商品、店铺和日期观察它，用数量、单价和销售金额度量它。',
      ],
      bullets: [
        '业务过程：商品销售',
        '粒度：一个订单中的一个商品明细',
        '维度：用户、商品、店铺、日期',
        '事实：数量、单价、销售金额',
      ],
    },
    {
      title: '下一步：把事实和维度组织起来',
      paragraphs: [
        '粒度明确后，事实表和维度表才有清晰的边界。下一课会把这组判断组织成星型模型，并观察粒度错误如何让同一笔金额被重复计算。',
      ],
    },
  ],
  visualization: {
    kind: 'modeling-intro',
    rawTable: {
      columns: [
        'order_id',
        'user_id',
        'user_name',
        'product_id',
        'product_name',
        'shop_id',
        'shop_name',
        'quantity',
        'unit_price',
        'order_amount',
        'order_time',
      ],
      rows: [
        {
          order_id: '1001',
          user_id: 'U1001',
          user_name: '林夏',
          product_id: 'P2001',
          product_name: '保温杯',
          shop_id: 'S01',
          shop_name: '日常好物',
          quantity: 1,
          unit_price: 100,
          order_amount: 300,
          order_time: '2026-09-13 10:20',
        },
        {
          order_id: '1001',
          user_id: 'U1001',
          user_name: '林夏',
          product_id: 'P2002',
          product_name: '帆布袋',
          shop_id: 'S01',
          shop_name: '日常好物',
          quantity: 2,
          unit_price: 100,
          order_amount: 300,
          order_time: '2026-09-13 10:20',
        },
        {
          order_id: '1002',
          user_id: 'U1002',
          user_name: '周野',
          product_id: 'P2003',
          product_name: '跑鞋',
          shop_id: 'S02',
          shop_name: '城市运动',
          quantity: 1,
          unit_price: 180,
          order_amount: 180,
          order_time: '2026-09-13 11:05',
        },
      ],
    },
    steps: [
      {
        id: 'process',
        title: '选择业务过程',
        description: '先说清楚要记录哪一类正在发生的业务。',
        example: '商品销售',
      },
      {
        id: 'grain',
        title: '声明粒度',
        description: '用一句话定义事实表中的一行代表什么。',
        example: '一个订单中的一个商品明细',
      },
      {
        id: 'dimensions',
        title: '确定维度',
        description: '找出分析这件事时需要从哪些角度观察。',
        example: '用户 · 商品 · 店铺 · 日期',
      },
      {
        id: 'facts',
        title: '确定事实',
        description: '选择与粒度一致、可以度量或聚合的数值。',
        example: '数量 · 单价 · 销售金额',
      },
    ],
  },
  code: {
    label: '先写下粒度声明',
    language: 'text',
    code: `业务过程：商品销售
事实表：fact_order_item
粒度：一行代表一个订单中的一个商品明细
维度：用户、商品、店铺、日期
事实：quantity、unit_price、sales_amount`,
  },
  engineeringTip:
    '粒度声明应该出现在表设计、模型文档和评审中，而不是只存在于建模者的脑中。后续任何字段都要回答：它是否和这一行的业务含义一致？',
  pitfalls: [
    '不要把字段数量多、表拆得多误认为建模完成；没有粒度声明，表仍然没有边界。',
    '同一个 order_amount 可能表示订单总额，也可能表示明细金额，必须结合业务定义和粒度确认。',
  ],
}
