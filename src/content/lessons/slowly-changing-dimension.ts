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
      kind: 'narrative',
      title: '先问一个历史问题',
      paragraphs: [
        'U1001 在 2026-03-01 从普通会员升级为黄金会员。现在查询 2026-02-10 的订单 A，应该显示今天的黄金会员，还是下单当时的普通会员？',
        '如果直接 UPDATE dim_user，表里只剩黄金会员，历史答案就消失了。这节课用一条时间线，让你亲手把时间拨回升级前。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '时间旅行实验 · 用订单时间命中版本',
      title: '把时间拨回去，看看当时的会员状态',
      description:
        '先执行一次会员升级，再用时间点按钮或滑块查看订单 A、升级节点和订单 B。切换 Type 1 / Type 2，比较同一个时间点为什么会得到不同答案。',
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
    },
    {
      kind: 'compare',
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
    {
      kind: 'sql',
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
    {
      kind: 'engineering-note',
      title: '版本不是越多越好',
      text: 'SCD Type 2 会增加行数、ETL 复杂度和 Join 成本。只为真正需要历史语义的属性建立版本，并把有效区间边界、重复版本和晚到数据处理规则写进模型约定。',
    },
    {
      kind: 'takeaway',
      title: '把历史语义写进数据模型',
      text: 'Type 2 的关键不是多一行数据，而是让事实发生的时间可以决定它应该看到哪一个维度版本。',
      bullets: [
        '关闭旧版本，再插入新版本。',
        '使用 [effective_from, effective_to) 半开区间。',
        '只对真正需要历史解释的属性做版本化。',
      ],
    },
    {
      kind: 'pitfall',
      title: '边界时刻必须只命中一个版本',
      text: '不要用 BETWEEN 替代半开区间而忽略边界；effective_to 是开区间，升级瞬间应命中新版本，否则同一个订单可能同时 JOIN 到两行。',
    },
  ],
}
