import type { LessonContent } from '../types'

export const slowlyChangingDimensionContent: LessonContent = {
  eyebrow: '第 02 章 · 维度历史',
  subtitle: '客户等级和所属机构会变化，但分析历史贷款时，应该还能还原当时的客户状态。',
  quickSummary:
    '用 Customer C001 从普通客户、杭州支行变为 VIP、上海支行的例子，比较覆盖更新与拉链表如何影响 2025-10-10 的 LoanNote N001。',
  concept: {
    term: '拉链表（SCD Type 2 / Slowly Changing Dimension Type 2）',
    definition:
      '拉链表在维度属性变化时关闭旧版本、插入新版本，并用有效时间区间保存每个版本何时生效，从而可以按历史时间点还原属性。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '客户升级以后，2025 年的贷款算哪个等级？',
      paragraphs: [
        'Customer C001 在 2025 年是普通客户，所属机构是杭州支行。2026 年 4 月 1 日，客户等级变为 VIP，所属机构变为上海支行。现在分析 2025-10-10 的 LoanNote N001，业务需要知道客户当时是什么状态。',
        '如果维度表只保留今天的值，查询历史贷款时只能读到 VIP 和上海支行。问题不是客户资料不能更新，而是当前属性和历史分析所需的属性有不同的时间语义。',
      ],
      bullets: [
        'customer_id = C001：稳定的客户业务 identity。',
        'customer_sk = 101 / 205：某一个客户历史版本的代理键。',
        '历史 LoanNote N001：2025-10-10，放款本金 ¥300,000。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '历史版本实验 · 时间点还原',
      title: '同一个 customer_id，保留两个时间版本',
      description:
        '先写入客户等级和机构变更，再在覆盖更新与拉链表之间切换；拖动时间线到 N001 的放款日，查看两种策略命中的 Customer 状态。',
      visualization: {
        kind: 'banking-customer-history',
        initialVersion: {
          customerSk: 101,
          customerId: 'C001',
          level: '普通',
          branch: '杭州支行',
          effectiveFrom: '2025-01-01',
          effectiveTo: '9999-12-31',
          isCurrent: true,
        },
        change: {
          customerSk: 205,
          effectiveFrom: '2026-04-01',
          level: 'VIP',
          branch: '上海支行',
        },
        loanNote: {
          noteId: 'N001',
          customerId: 'C001',
          disbursedDate: '2025-10-10',
          disbursedPrincipal: 300000,
        },
        timeline: [
          {
            date: '2025-01-01',
            label: '初始版本',
            detail: '普通 · 杭州支行生效',
            kind: 'start',
          },
          {
            date: '2025-10-10',
            label: 'LoanNote N001',
            detail: '历史贷款放款 ¥300,000',
            kind: 'loan-note',
          },
          {
            date: '2026-04-01',
            label: '属性变更',
            detail: '等级和所属机构发生变化',
            kind: 'change',
          },
          {
            date: '2026-09-15',
            label: '今天',
            detail: 'VIP · 上海支行',
            kind: 'now',
          },
        ],
      },
    },
    {
      kind: 'compare',
      title: '覆盖更新还是拉链表：看查询是否需要“当时”',
      intro: '两种策略都可能合理，关键是历史分析是否需要保留属性变化前的版本。',
      columns: [
        {
          label: '覆盖更新（SCD Type 1）',
          title: '只保存当前属性',
          points: [
            '实现简单，维度只保留一行',
            '适合只关心今天值的属性',
            '2025 年的 N001 会读到 VIP、上海支行',
          ],
        },
        {
          label: '拉链表（SCD Type 2）',
          title: '按有效区间保存历史',
          points: [
            '关闭旧行并插入新版本',
            '适合需要还原历史语义的属性',
            'N001 可以命中普通、杭州支行的旧版本',
          ],
        },
      ],
    },
    {
      kind: 'narrative',
      title: '两个 key，各自回答不同问题',
      paragraphs: [
        'customer_id 说明“是哪位客户”，是跨时间稳定的业务键；customer_sk 说明“这个客户的哪一个属性版本”。历史查询先用 customer_id 找到版本集合，再用 LoanNote 的 disbursedDate 判断落在哪个有效区间。',
        '本例的两个版本可以写成：101 / C001 / 普通 / 杭州支行 / 2025-01-01 到 2026-03-31，以及 205 / C001 / VIP / 上海支行 / 2026-04-01 到 9999-12-31。变更日属于新版本，旧版本的结束时间不包含变更日。',
      ],
    },
    {
      kind: 'takeaway',
      title: '维度历史要由业务问题决定',
      text: '当问题带着“当时”两个字时，当前唯一行往往不够。拉链表把属性变化变成有边界的版本，让历史 LoanNote 可以恢复当时的客户状态。',
      bullets: [
        '覆盖更新：适合只看当前值，历史属性会被新值替代。',
        '拉链表：使用 [start_date, end_date) 保存不重叠的历史版本。',
        'customer_id 保持业务 identity，customer_sk 标识具体历史版本。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '只为真正需要追溯的属性保留版本',
      text: '拉链表会增加维度行数、写入逻辑和时间 Join 成本。生产中应先确认客户等级、机构归属等属性是否影响历史解释，再决定是否版本化，不要把所有字段都机械复制成历史行。',
    },
    {
      kind: 'pitfall',
      title: '有效区间的边界必须统一',
      text: '使用 [start_date, end_date) 半开区间：2026-04-01 这一天命中新版本，2026-03-31 仍命中旧版本，避免同一笔历史贷款同时 Join 到两行。',
    },
  ],
}
