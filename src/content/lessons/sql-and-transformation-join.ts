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
  eyebrow: '第 04 章 · Join 与数据粒度',
  opening: {
    eyebrow: 'SQL 没报错，A001 的余额为什么从 100,000 变成 300,000？',
    title: 'Join 为什么会让金额变大？',
    intro:
      '两张表都有 account_id，不代表它们可以直接横向拼接。先数左右两边每个 key 有几行，再看 Join 后一行还代表什么。',
    cards: [
      { label: '左表', value: '1 行', detail: 'A001 × 2026-09-30' },
      { label: '右表', value: '3 行', detail: 'A001 的账户介质' },
      { label: '错误结果', value: '3 倍', detail: '100,000 被复制成 300,000' },
    ],
    question: '有时最好的 Join 是不 Join：先确认这张辅助表是否真的属于当前指标的统计粒度。',
  },
  subtitle:
    '先用一个账户的三条账户介质记录看清一对多，再用 2 × 2 例子看 JOIN key 两边都不唯一时会发生什么。',
  quickSummary:
    '先看 DWD 与 AccountMedium 的匹配关系，再用一个 2 × 2 分步实验，把 Join 放大拆成行数变化、key 唯一性和目标 Grain 三个问题。',
  concept: {
    term: 'Join 放大',
    definition:
      '当 JOIN key 在一侧或两侧并不唯一时，同一行会被复制到多次匹配结果中。若没有回到目标数据粒度就直接求和，金额会随匹配行数一起放大。',
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
        '左表：1 行 = 账户 × 快照日，A001 的 balance = 100,000。',
        '右表：1 行 = 账户 × 账户介质，A001 有 3 行。',
        'Join 后：A001 的 1 行 × 3 行介质 = 3 行；直接 SUM(balance) 会得到 300,000，但 A001 只应计一次 100,000。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '1:N 对照 · 先看匹配关系再看金额',
      title: '一对多匹配怎样改变结果？',
      description:
        '点击“错误 Join”查看余额复制后的表；再切换“保持账户日粒度”，理解当前指标为什么不需要把账户介质接进来。',
      visualization,
    },
    {
      kind: 'visualization',
      eyebrow: 'M:N 分步实验 · 两边 key 都不唯一',
      title: '把 2 × 2 = 4 一步步走完',
      description:
        '一对多已经会复制度量；如果 JOIN key 两边都不唯一，结果还会继续放大。下面用一组最小的 2 × 2 数据，把匹配、放大、根因和修复拆成 6 步。',
      visualization: { kind: 'join-fanout' },
    },
    {
      kind: 'narrative',
      title: '修复方式取决于目标 Grain',
      paragraphs: [
        '刚才先聚合右表，是因为这个例子的目标 Grain 是账户级一行。换一个目标 Grain，答案会变。',
        '先明确目标 Grain，再从三种做法里选：补充正确的 JOIN key、先把右表聚合到 key 粒度、或者根本不 Join。',
      ],
    },
    {
      kind: 'takeaway',
      title: 'Join 前后固定问这三个问题',
      text: 'SQL 没有报错，只说明语法通过；金额是否可信，要靠下面三个问题自己检查。',
      bullets: [
        'Join 前：两边一个 key 各有几行？',
        'Join 后：一行还代表原来的 Grain 吗？',
        '求和前：度量有没有因为匹配被复制？',
      ],
    },
  ],
}
