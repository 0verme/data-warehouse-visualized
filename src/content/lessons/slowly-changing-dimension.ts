import type { LessonContent } from '../types'

export const slowlyChangingDimensionContent: LessonContent = {
  eyebrow: '第 05 课 · 维度历史实验',
  subtitle: '会员等级会变化，但历史订单不应该被今天的状态重新改写。',
  quickSummary:
    '通过 U1001 的一次会员升级，先观察直接 UPDATE 如何让历史分析失真，再用 SCD Type 2 保存普通会员和黄金会员两个有效版本。',
  concept: {
    term: 'SCD Type 2',
    definition:
      '当维度属性变化时不覆盖旧行，而是关闭旧版本、插入新版本，并用有效时间区间表示每个版本何时生效。',
  },
  sections: [
    {
      title: '先问一个历史问题',
      paragraphs: [
        'U1001 在 2026-03-01 从普通会员升级为黄金会员。现在查询 2026-02-10 的订单 A，应该显示今天的黄金会员，还是下单当时的普通会员？如果直接 UPDATE dim_user，表里只剩黄金会员，历史答案就消失了。',
      ],
    },
    {
      title: 'Type 1 和 Type 2 是两种不同取舍',
      paragraphs: [
        'Type 1 直接覆盖属性，表更简单，但只能回答“现在是什么”。Type 2 新增版本并保留旧行，才能回答“当时是什么”。本课只沿着这个问题展开 Type 2，不把 SCD 做成类型百科。',
      ],
    },
    {
      title: '用半开区间连接订单和维度',
      paragraphs: [
        'SCD Type 2 使用 [effective_from, effective_to) 这样的半开区间：包含开始时间，不包含结束时间。因此 2026-03-01 00:00:00 已经属于黄金会员版本，旧版本在这一刻结束。',
      ],
    },
    {
      title: '历史不是所有字段都要保存',
      paragraphs: [
        '会员等级、客户所属区域、组织归属、销售负责人和风险评级，通常值得保留历史；最后登录时间、页面浏览次数、实时余额等高频变化属性，未必适合为每次变化都创建版本。',
      ],
      bullets: [
        '适合 Type 2：需要按当时状态解释历史事实的属性。',
        '谨慎使用：变化频繁、只关心当前值或本身是度量的字段。',
      ],
    },
  ],
  visualization: {
    kind: 'scd',
    initialVersion: {
      userId: 'U1001',
      city: '杭州',
      memberLevel: '普通会员',
      effectiveFrom: '2026-01-01',
      effectiveTo: '9999-12-31',
      isCurrent: true,
    },
    change: {
      effectiveFrom: '2026-03-01',
      memberLevel: '黄金会员',
    },
    orders: [
      { id: 'order-a', label: '订单 A', orderTime: '2026-02-10', amount: 128 },
      { id: 'order-b', label: '订单 B', orderTime: '2026-04-10', amount: 256 },
    ],
    timelineLabels: ['2026-01', '2026-02', '2026-03', '2026-04'],
  },
  comparison: {
    title: 'Type 1 / Type 2：先决定要不要历史',
    intro: '没有绝对更好的类型，关键是业务问题是否需要“当时的属性”。',
    columns: [
      {
        label: 'TYPE 1',
        title: '直接覆盖',
        points: ['实现简单、行数少', '适合只关心当前值的属性', '无法还原历史订单当时的状态'],
      },
      {
        label: 'TYPE 2',
        title: '新增版本',
        points: [
          '保留旧行并插入新行',
          '适合需要历史语义的属性',
          '会增加行数、ETL 复杂度和 Join 成本',
        ],
      },
    ],
  },
  code: {
    label: 'SCD Type 2 的时间连接条件',
    language: 'sql',
    code: `SELECT
  o.order_id,
  o.order_time,
  d.member_level
FROM fact_order o
JOIN dim_user d
  ON o.user_id = d.user_id
 AND o.order_time >= d.effective_from
 AND o.order_time < d.effective_to;`,
  },
  engineeringTip:
    'SCD Type 2 不是越完整越好：它会增加行数、ETL 复杂度和 Join 成本。只为真正需要历史语义的属性建立版本，并把有效区间边界、重复版本和晚到数据处理规则写进模型约定。',
  pitfalls: [
    '不要用 BETWEEN 替代半开区间而忽略边界；effective_to 是开区间，升级瞬间应命中新版本。',
    '不要把最后登录时间、页面浏览次数等高频变化指标机械地做成 Type 2 维度。',
  ],
}
