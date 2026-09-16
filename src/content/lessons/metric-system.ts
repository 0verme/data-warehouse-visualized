import type { LessonContent } from '../types'
import type { BankingMetricScopeVisualization } from '../../types'
import { depositAccountSnapshots } from './deposit-data'

export const depositBalanceScopeVisualization: BankingMetricScopeVisualization = {
  kind: 'banking-metric-scope' as const,
  targetDate: '2026-09-30',
  snapshots: depositAccountSnapshots,
  scenarios: [
    {
      id: 'operations',
      label: 'A',
      title: '全行业务口径',
      description: '人民币、全行、全部客户，包含活期、定期、协定和保证金。',
      filter: {
        snapshotDate: '2026-09-30',
        customerScope: 'all' as const,
        productScope: 'all' as const,
        branch: 'all' as const,
        currency: 'CNY' as const,
      },
    },
    {
      id: 'finance',
      label: 'B',
      title: '财务口径',
      description: '其他范围不变，但不把保证金纳入存款余额。',
      filter: {
        snapshotDate: '2026-09-30',
        customerScope: 'all' as const,
        productScope: 'all' as const,
        branch: 'all' as const,
        currency: 'CNY' as const,
        excludedProducts: ['margin'],
      },
    },
    {
      id: 'analytics',
      label: 'C',
      title: '数据团队口径',
      description: '在财务口径基础上，再排除协定存款，统计集合继续缩小。',
      filter: {
        snapshotDate: '2026-09-30',
        customerScope: 'all' as const,
        productScope: 'all' as const,
        branch: 'all' as const,
        currency: 'CNY' as const,
        excludedProducts: ['margin', 'negotiated'],
      },
    },
  ],
}

export const metricSystemContent: LessonContent = {
  eyebrow: '第 03 章 · 指标口径',
  subtitle: '同一个“存款余额”出现不同数字时，先检查统计集合和时间语义，再判断是不是数据错了。',
  opening: {
    eyebrow: '同一个问题，三个答案',
    title: '截至 2026-09-30，全行存款余额是多少？',
    intro:
      '行长只问了一句“全行存款余额是多少”，运营、财务和数据团队却各自报出一个数字。下面的金额是确定性的教学数据，不代表真实银行经营数据。',
    cards: [
      { label: '运营', value: '1028 亿', detail: '全行 · 全部存款产品' },
      { label: '财务', value: '1011 亿', detail: '不含保证金' },
      { label: '数据团队', value: '987 亿', detail: '不含保证金和协定存款' },
    ],
    question: '三个数字都可能按各自约定统计出来；如果统计集合没有写清楚，它们仍然不能直接比较。',
  },
  quickSummary:
    '从 1028 亿、1011 亿和 987 亿三个确定性结果出发，逐步拆出产品范围、统计日期和统计对象，建立“数字不同不一定是数据错误”的口径意识。',
  concept: {
    term: '指标口径',
    definition:
      '指标口径是对统计对象、时间范围、度量和过滤条件的共同约定。同一个名称没有写完整这些条件时，不能假定它指向同一个数字。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '三个数字先不要急着判错',
      paragraphs: [
        '三组结果都使用 2026-09-30 的账户余额快照，差异来自统计集合：第一组把四类教学产品都算入，第二组排除保证金，第三组再排除协定存款。它们不是在争论 SUM 函数怎么写，而是在回答略有不同的问题。',
        '这一节故意只展示少量条件。实际核对报表时，还要确认客户范围、机构范围、币种和统计日期是否一致。',
      ],
      bullets: [
        '活期、定期、协定、保证金可以形成不同的产品范围。',
        '全部客户、个人、对公和小微口径可以形成不同的客户范围。',
        '全行、某个分行、CNY 或其他币种也会改变参与统计的账户集合。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '口径对比实验 · 先看统计集合',
      title: '同一份账户快照，逐步缩小统计范围',
      description:
        '选择 A、B 或 C，查看当前口径、参与的账户快照和结果金额。实验只做业务集合对照，先不谈实现方式。',
      visualization: depositBalanceScopeVisualization,
    },
    {
      kind: 'takeaway',
      title: '数字不同，不一定是数据错误',
      text: '当两个团队报出的“存款余额”不一样，先把统计日期、客户、产品、机构和币种范围放在一起对照。计算顺利完成，只能说明流程跑完了，不能说明两个团队算的是同一个指标。',
      bullets: [
        '先问统计集合是否相同，再追查数据加工问题。',
        '“存款余额”单独出现时，仍然缺少可复算条件。',
        '下一节把这些条件整理成一张轻量的指标定义卡。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把组织约定说成行业唯一答案',
      text: '本节的 1028 亿、1011 亿和 987 亿只是确定性的教学数据。业务团队可以采用不同产品范围，但必须把采用的范围写出来，并保持报表和讨论使用同一份定义。',
    },
  ],
}
