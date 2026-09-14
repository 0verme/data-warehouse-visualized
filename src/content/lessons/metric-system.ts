import type { LessonContent } from '../types'

export const metricSystemContent: LessonContent = {
  eyebrow: '第 06 课 · 指标口径实验',
  subtitle: '不要先背公式：先改变口径，看见哪些订单被纳入，以及结果数字为什么跟着变化。',
  opening: {
    eyebrow: '先制造一个冲突',
    title: '昨天 GMV 到底是多少？',
    intro: '同一批订单，三个团队给出了三个答案。先别急着判断谁错了。',
    cards: [
      { label: '运营', value: '380 元', detail: '按下单时间 · 不扣退款' },
      { label: '财务', value: '260 元', detail: '按支付时间 · 扣除退款' },
      { label: '数据团队', value: '300 元', detail: '按支付时间 · 不扣退款' },
    ],
    question: '到底谁算错了？继续实验，你会发现三个人可能都没算错，只是“GMV”的定义不一样。',
  },
  quickSummary:
    '这节课用 4 笔订单拆开一个指标：状态、退款、时间字段和数据粒度。每次切换口径，参与计算的订单行和最终结果都会一起更新。',
  concept: {
    term: '一个名字，不足以定义一个指标',
    definition:
      'GMV 并不存在跨所有公司的唯一标准定义。组织需要做的不是寻找“宇宙唯一正确答案”，而是明确当前使用哪一种定义，并让报表、SQL 和讨论保持一致。',
  },
  sections: [
    {
      title: '先看一小批订单，而不是先背“指标公式”',
      paragraphs: [
        '本实验固定统计日期为 2026-09-13。O001、O002 是当天支付的订单；O003 在当天深夜下单，却在次日零点后支付；O004 仍然待支付。它们刚好把状态、退款和跨日时间的边界放在同一张小表里。',
      ],
      bullets: [
        'O002 有 40 元退款：订单金额和净收入不再相同。',
        'O003 的下单日和支付日不同：选择哪个时间字段会改变结果。',
        'O004 没有支付时间：待支付订单不能凭空变成支付 GMV。',
      ],
    },
    {
      title: '用四个开关改变“什么算进去”',
      paragraphs: [
        '实验中的状态、退款、时间和粒度四组控制项，分别对应一条指标定义里的业务规则。不要只盯着顶部数字，观察订单表里的“当前贡献”和排除原因，数字就是这样被算出来的。',
      ],
    },
    {
      title: '时间口径是业务语义，不只是一个字段名',
      paragraphs: [
        '按下单时间，O003 属于 9 月 13 日；按支付时间，它属于 9 月 14 日。跨日订单、补支付和退款都会让“昨天”变得不再简单，所以指标必须写清楚采用哪个时间字段。',
      ],
    },
    {
      title: '把第 3 章的粒度带进指标计算',
      paragraphs: [
        '订单明细里可能有 O001 的商品 A 和商品 B 两行。如果每一行都重复保存 100 元的 order_amount，再直接 SUM，就会得到 200 元。指标不仅要定义算什么，还必须知道数据处于什么粒度。',
      ],
    },
  ],
  visualization: {
    kind: 'metric-definition',
    targetDate: '2026-09-13',
    orders: [
      {
        id: 'O001',
        orderTime: '2026-09-13 09:10',
        payTime: '2026-09-13 09:12',
        status: 'PAID',
        orderAmount: 100,
        refundAmount: 0,
      },
      {
        id: 'O002',
        orderTime: '2026-09-13 10:20',
        payTime: '2026-09-13 10:25',
        status: 'PAID',
        orderAmount: 200,
        refundAmount: 40,
      },
      {
        id: 'O003',
        orderTime: '2026-09-13 23:58',
        payTime: '2026-09-14 00:03',
        status: 'PAID',
        orderAmount: 80,
        refundAmount: 0,
      },
      {
        id: 'O004',
        orderTime: '2026-09-13 16:00',
        payTime: null,
        status: 'PENDING',
        orderAmount: 60,
        refundAmount: 0,
      },
    ],
    detailRows: [
      { orderId: 'O001', product: '商品 A', orderAmount: 100 },
      { orderId: 'O001', product: '商品 B', orderAmount: 100 },
      { orderId: 'O002', product: '商品 C', orderAmount: 200 },
      { orderId: 'O003', product: '商品 D', orderAmount: 80 },
      { orderId: 'O004', product: '商品 E', orderAmount: 60 },
    ],
  },
  comparison: {
    title: '把“支付 GMV”说完整',
    intro:
      'GMV 可以有下单 GMV、支付 GMV、成交 GMV、含退款 GMV 或净 GMV 等不同口径。指标体系的目标是统一组织内部的定义，不是把某一种定义宣布成行业唯一标准。',
    columns: [
      {
        label: '本实验的完整定义',
        title: '支付 GMV',
        points: [
          '业务过程：订单支付',
          '统计对象：支付成功订单',
          '粒度：订单',
          '时间口径：支付时间，统计周期为自然日',
          '度量：订单金额，扣除退款金额',
        ],
      },
      {
        label: '指标体系解决的问题',
        title: '同名指标可被复现',
        points: [
          '统一名称、口径、负责人和时间语义',
          '统一过滤条件与业务规则',
          '减少每张报表各算一套的重复开发',
          '让讨论从“谁对谁错”变成“当前采用哪种定义”',
        ],
      },
    ],
  },
  code: {
    label: '把实验定义写成伪 SQL',
    language: 'sql',
    code: `SELECT
  DATE(pay_time) AS dt,
  SUM(order_amount - refund_amount) AS pay_gmv
FROM orders
WHERE pay_status = 'PAID'
GROUP BY DATE(pay_time);`,
  },
  engineeringTip:
    '指标 = 度量 + 粒度 + 时间口径 + 过滤条件 + 业务规则。指标体系的价值，是让这五件事有明确的名称、负责人和可复用的计算逻辑。',
  pitfalls: [
    '不要把 GMV 的某一种定义写成所有公司的唯一标准；先确认业务过程和组织约定。',
    '不要只检查最终数字；还要检查参与计算的订单集合、时间字段和数据粒度。',
  ],
}
