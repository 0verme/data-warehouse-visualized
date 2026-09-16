import type { LessonContent } from '../types'
import type { BankingMetricDerivationVisualization } from '../../types'
import { depositAccountSnapshots } from './deposit-data'

export const depositMetricDerivationVisualization: BankingMetricDerivationVisualization = {
  kind: 'banking-metric-derivations' as const,
  snapshots: depositAccountSnapshots,
  defaultFilter: {
    snapshotDate: '2026-09-30',
    customerScope: 'all' as const,
    productScope: 'all' as const,
    branch: 'all' as const,
    currency: 'CNY' as const,
  },
}

export const depositMetricDerivationsContent: LessonContent = {
  eyebrow: '第 03 章 · 指标派生',
  subtitle:
    '基础度量保持不变，客户、产品、机构、币种和日期范围一换，就会得到一族不同但可解释的指标。',
  quickSummary:
    '通过一个轻量口径组合器切换客户口径、产品口径、币种、机构和日期，观察指标名称、统计集合和余额结果同步变化。',
  concept: {
    term: '基础度量 + 口径条件',
    definition:
      '指标派生不是凭空增加一组名字，而是在同一个基础度量上明确加入不同的维度和范围约束，形成一族可复述、可复算的业务指标。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '一个余额，为什么能有这么多叫法？',
      paragraphs: [
        '“存款余额”可以回答全行还有多少，也可以回答杭州分行的小微口径客户有多少定期余额。两个指标都从 Account 的余额状态出发，但参与统计的账户集合不同，所以名称和结果都应该不同。',
        '组合器只提供五个教学选择：客户口径、产品口径、币种、机构和日期。每次只改变范围条件，不增加与当前问题无关的银行业务条件。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '指标派生实验 · 口径组合器',
      title: '条件一变，指标定义和统计集合一起变',
      description:
        '切换一个或多个条件，观察指标名称、结果和参与的账户快照。小微口径在本实验中视为上游已经提供的业务分类标签，不展开它的认定规则。',
      visualization: depositMetricDerivationVisualization,
    },
    {
      kind: 'narrative',
      title: '不同指标共享基础度量，但不共享统计集合',
      paragraphs: [
        '选择杭州分行、小微口径、人民币、定期和 2026-09-30 后，结果只保留符合这些条件的账户快照。把任意一个条件删掉，指标名称也应随之变宽，统计集合和结果会跟着变化。',
        '这种派生关系让指标可以被解释：基础度量是 balance，筛选条件是客户、产品、机构、币种和快照日。它仍然是一张业务定义卡，不需要在本节输出最终 SQL。',
      ],
    },
    {
      kind: 'takeaway',
      title: '一份可以交给数据工程师的最小定义',
      text: '杭州分行小微口径人民币定期存款余额：统计时间 2026-09-30；度量 balance；客户口径 小微；产品口径 定期；机构范围 杭州分行；币种 CNY；单位 元。',
      bullets: [
        '基础度量：存款余额 / balance。',
        '范围条件：客户、产品、机构、币种、日期。',
        '底层 Grain：Account × snapshot_date。',
        '输出是可复述、可复算的定义，不是 SQL 文本。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '把定义交给第 04 章加工',
      text: '第 03 章把统计对象、时间、度量和过滤条件说清楚；第 04 章再决定怎样从分层数据中去重、关联、聚合并产出这个数字。加工逻辑必须回到这里确认口径，而不是重新猜一遍业务含义。',
    },
  ],
}
