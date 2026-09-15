import type { LessonContent } from '../types'
import type { BankingMetricTimeVisualization } from '../../types'

export const depositMetricTimeVisualization: BankingMetricTimeVisualization = {
  kind: 'banking-metric-time' as const,
  asOfDate: '2026-09-30',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  snapshots: [
    { accountId: 'A101', snapshotDate: '2026-09-30', balance: 720 },
    { accountId: 'A102', snapshotDate: '2026-09-30', balance: 480 },
  ],
  transactions: [
    {
      transactionId: 'T001',
      accountId: 'A101',
      eventDate: '2026-09-03',
      type: 'deposit' as const,
      amount: 240,
    },
    {
      transactionId: 'T002',
      accountId: 'A102',
      eventDate: '2026-09-12',
      type: 'withdrawal' as const,
      amount: 100,
    },
    {
      transactionId: 'T003',
      accountId: 'A101',
      eventDate: '2026-09-18',
      type: 'deposit' as const,
      amount: 180,
    },
    {
      transactionId: 'T004',
      accountId: 'A102',
      eventDate: '2026-09-27',
      type: 'deposit' as const,
      amount: 260,
    },
  ],
}

export const depositMetricTimeContent: LessonContent = {
  eyebrow: '第 04 章 · 时间语义',
  subtitle:
    '“截至某天”描述一个时间点的状态，“一段时间”描述期间内发生的事件；两个问题不能共用同一条时间条件。',
  quickSummary:
    '用 2026-09-30 的账户余额快照和 9 月账户交易对照状态型、事件型两种时间语义，理解为什么存款余额与累计存入金额需要不同的输入事实。',
  concept: {
    term: '时间语义',
    definition:
      '时间语义说明一个数字对应时间点的状态，还是一段时间内发生的事件。日期写在 SQL 里，不代表业务含义已经写清楚。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '“截至 9 月 30 日”问的是状态',
      paragraphs: [
        '2026-09-30 的账户余额快照里，A101 是 720 元，A102 是 480 元。把这两行相加，回答的是“9 月 30 日这个时间点，账户状态合计还有多少钱”。',
        '这对应第 03 章见过的 Periodic Snapshot Fact：一行代表一个账户在固定周期末的状态，即使当天没有新交易，也可以有一行快照。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '时间语义实验 · 点还是区间',
      title: '在同一条时间轴上切换两个问题',
      description:
        '选择“截至某天”或“一段时间”，查看统计边界、输入行含义、纳入的记录和结果。取款事件会保留在表里，但不会被当成“累计存入金额”。',
      visualization: depositMetricTimeVisualization,
    },
    {
      kind: 'narrative',
      title: '“9 月累计存入金额”问的是事件',
      paragraphs: [
        '2026-09-01 到 2026-09-30 之间，T001、T003、T004 三笔存入交易合计 680 元。这个数字描述期间内发生了什么，不等于 9 月 30 日仍然留在账户里的余额；期间里还可能发生取款、转账或其他交易。',
        '因此，存款余额使用 snapshot_date 表达状态归属，累计存入金额使用交易事件的日期区间。两者的统计对象、输入 Grain 和可回答问题都不同。',
      ],
      bullets: [
        '存款余额 → 某个时间点是什么状态。',
        '累计存入金额 → 一段时间内发生了多少存入事件。',
      ],
    },
    {
      kind: 'takeaway',
      title: '日期条件要和业务问题一起写',
      text: '看到“截至某天”，优先寻找状态快照和 snapshot_date；看到“一段时间内发生了多少”，优先寻找事件事实和 event_date。先辨认问题，才能选择正确的输入。',
      bullets: [
        '时点语义：状态快照 + 单个 snapshot_date。',
        '期间语义：交易事件 + 起止日期。',
        '同一个“存款”词，不会自动把两种时间语义变成同一个指标。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把余额快照跨天直接相加',
      text: '多天的余额是多个时间点的状态。把 9 月 1 日到 9 月 30 日的余额快照直接 SUM，并不会得到“9 月累计存入金额”；这需要回到 Transaction Fact。',
    },
  ],
}
