import type { LessonContent } from '../types'
import { createDataQualityVisualization } from '../../utils/data-quality'
import { qualitySchedulerRun, qualityTeachingModel } from './data-quality'

export const dataQualityRulesVisualization = createDataQualityVisualization(
  qualitySchedulerRun,
  'rules',
  qualityTeachingModel,
)

export const dataQualityRulesContent: LessonContent = {
  eyebrow: '第 06 章 · 6-2 记录自身的质量',
  opening: {
    eyebrow: '一张表到底应该检查什么？',
    title: '一张表到底应该检查什么？',
    intro:
      '打开 AccountBalanceSnapshot，先别急着勾选“完整性”或“有效性”。如果一行代表的对象没有说清楚，规则也就没有落脚点。',
    cards: [
      { label: '表', value: 'AccountBalanceSnapshot', detail: '账户余额日终状态' },
      { label: 'Grain', value: 'Account × snapshot_date', detail: '一行代表什么' },
      { label: '关系', value: 'branch_id → Branch', detail: '机构引用必须可追溯' },
      { label: '规则', value: '0 duplicate', detail: '关键身份重复零容忍' },
    ],
    question: '这张表的一行到底代表什么？',
  },
  subtitle: '从 Grain 出发，再检查字段是否有意义、对象关系是否成立。',
  quickSummary:
    'Account × snapshot_date 是规则设计的第一锚点；关键字段、字段语义和对象关系共同决定记录自身是否合理。',
  concept: {
    term: 'Grain / 粒度',
    definition:
      'Grain 说明一行数据代表的业务单位。本例中，一行是一个 Account 在一个 snapshot_date 的余额状态。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先把一行读懂，再谈校验',
      paragraphs: [
        'AccountBalanceSnapshot 的一行不是一笔存入交易，也不是一个客户的全部历史余额。它表示某个账户在某个快照日的状态，身份由 Account × snapshot_date 组成；账户的 Customer、Product 和 Branch 关系决定了这条余额能按什么口径分析。',
        '一旦这个含义明确，重复身份、关键字段缺失、非法 currency 和找不到 Branch 的记录就有了具体判断依据。',
      ],
      bullets: [
        '记录身份：同一个 Account × snapshot_date 不能重复。',
        '关键字段：account_id、snapshot_date、balance 不能无意义缺失。',
        '字段语义：currency 需要是已经登记的币种代码。',
        '对象关系：branch_id 必须能在 Branch 中找到。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'RULE REASONING LAB · 从 Grain 推出规则',
      title: '这条记录哪里不对？',
      description:
        '切换四个确定性故障，观察同一条存款余额数据如何分别暴露身份、字段、语义和引用关系问题。',
      visualization: dataQualityRulesVisualization,
    },
    {
      kind: 'narrative',
      title: 'Grain 是第一锚点，但不是唯一来源',
      paragraphs: [
        'Grain 能告诉我们“重复什么算重复”，却不能单独告诉我们哪些 currency 合法，也不能代替 Branch 参考数据。规则还要来自字段定义、对象关系和数据集预期。',
        '因此，质量检查不是把几种抽象维度排成清单，而是把业务含义落到可观察的行和字段上。',
      ],
      bullets: [
        '知道一行代表什么，才能判断记录身份。',
        '知道字段表达什么，才能判断值是否有意义。',
        '知道对象怎样关联，才能发现孤立引用。',
      ],
    },
    {
      kind: 'takeaway',
      title: '记录级判断要回答四个具体问题',
      text: '同一个账户同一天为什么出现两次？这条余额记录还完整吗？currency 还能解释吗？这个机构真的存在吗？',
      bullets: [
        '每条规则都绑定表、分区和适用字段。',
        '关键身份重复的阈值固定为 0。',
        '阈值调整是在改规则，不是在修复数据。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要只检查“有没有值”',
      text: 'currency = ??? 也可能非空，但它不能表达一个合法币种。字段质量既包括缺失，也包括业务语义。',
    },
  ],
}
