import type { LessonContent } from '../types'
import { depositBalanceDataset, depositBalanceTaskContract } from '../../data/deposit-balance'
import type { SqlTransformationVisualization } from '../../features/sql-transformation/types'

const visualization: SqlTransformationVisualization = {
  kind: 'sql-transformation',
  focus: 'join',
  targetDate: depositBalanceDataset.targetDate,
  dataset: depositBalanceDataset,
  taskContract: depositBalanceTaskContract,
}

export const sqlTransformationJoinContent: LessonContent = {
  eyebrow: '第 05 章 · Join 与数据粒度',
  opening: {
    eyebrow: 'SQL 没报错，A001 的余额为什么从 100,000 变成 300,000？',
    title: 'Join 为什么会让金额变大？',
    intro:
      '两张表都有 account_id，不代表它们可以直接横向拼接。先数左右两边每个 Key 有几行，再看 Join 后一行还代表什么。',
    cards: [
      { label: '左表', value: '1 行', detail: 'A001 × 2026-09-30' },
      { label: '右表', value: '3 行', detail: 'A001 的账户介质' },
      { label: '错误结果', value: '3 倍', detail: '100,000 被复制成 300,000' },
    ],
    question: '最正确的 Join，有时是不 Join；先确认这张辅助表是否真的属于当前指标的统计粒度。',
  },
  subtitle: '用一个账户的三条账户介质记录，观察一对多 Join 如何复制余额而不触发 SQL 报错。',
  quickSummary:
    '先看 DWD 的账户日明细，再对照 AccountMedium 的账户介质明细；用行数、匹配关系和金额合计定位 Join 放大。',
  concept: {
    term: 'Join 放大',
    definition:
      '当左表一行在右表匹配到多行时，左表字段会被复制到每个匹配结果。若度量没有回到目标数据粒度就直接求和，金额会随匹配行数一起放大。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先看两张表各自的一行',
      paragraphs: [
        'DWD 中 A001 的一行代表“账户 A001 在 2026-09-30 的余额”。AccountMedium 中的三行分别代表一个账户介质：CARD、CARD、PASSBOOK。两张表都出现 account_id，但一行代表的事情不同。',
        '直接 Join 后，A001 的余额字段被复制到三行。数据库只完成了关系运算，并不知道 balance 不应该按账户介质重复计算。',
      ],
      bullets: [
        '左表：1 行 = 账户 × 快照日，balance = 100,000。',
        '右表：1 行 = 账户 × 账户介质，A001 有 3 行。',
        'Join 后：1 × 3 = 3 行；直接 SUM(balance) 就会得到 300,000。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'Join 对照 · 先看匹配关系再看金额',
      title: '一对多匹配怎样改变结果？',
      description:
        '点击“错误 Join”查看余额复制后的表；再切换“保持账户日粒度”，理解当前指标为什么不需要把账户介质接进来。',
      visualization,
    },
    {
      kind: 'narrative',
      title: '三个判断比 JOIN 关键字更重要',
      paragraphs: [
        '面对一条关联条件，先问：这张表真的需要 Join 吗？如果需要，它和当前数据粒度是什么关系？Join 以后，一行还代表原来的那件事吗？',
        '如果只是想知道账户是否有介质，可以先把 AccountMedium 聚合成账户级标记，或使用 EXISTS。让右表先回到账户粒度，余额才不会被介质数量带着走。',
      ],
    },
    {
      kind: 'takeaway',
      title: 'Join 前后都要做一次对账',
      text: '记录左表行数、右表行数、每个 Key 的最大匹配数和 Join 后金额。SQL 执行成功只是语法通过，不能替代粒度和金额检查。',
      bullets: [
        'A001：1 行 × 3 个账户介质 = 3 行。',
        '目标口径余额：300,000；错误直接 Join 后按行求和：500,000。',
        '账户介质是教学辅助对象，不是存款余额指标的统计维度。',
      ],
    },
  ],
}
