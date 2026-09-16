import type { LessonContent } from '../types'
import { depositBalanceDataset, depositBalanceTaskContract } from '../../data/deposit-balance'
import type { SqlTransformationVisualization } from '../../features/sql-transformation/types'

const visualization: SqlTransformationVisualization = {
  kind: 'sql-transformation',
  focus: 'cleaning',
  targetDate: depositBalanceDataset.targetDate,
  dataset: depositBalanceDataset,
  taskContract: depositBalanceTaskContract,
}

export const sqlTransformationCleaningContent: LessonContent = {
  eyebrow: '第 04 章 · 可信明细',
  opening: {
    eyebrow: '原始快照多一行，指标就可能多算一笔余额',
    title: '原始输入怎样变成可信明细？',
    intro:
      '进入稳定加工层前，只处理三件会直接改变结果的事：给重复快照找保留依据、保留缺失维度的余额、统一表达相同含义的币种编码。',
    cards: [
      { label: '重复快照', value: '5 → 4 行', detail: '按 account_id + snapshot_date 取最新' },
      { label: '缺失关联', value: '2 条保留', detail: 'Customer / Product 缺失不静默丢数' },
      { label: '编码标准化', value: 'RMB → CNY', detail: 'A002 的余额数值不被换算' },
    ],
    question: '清洗的目标不是把异常藏起来，而是让进入 DWD 的每一行都有可解释的来源。',
  },
  subtitle: '用三种小而关键的处理，把原始账户余额快照整理成可核对的 DWD 明细。',
  quickSummary:
    '观察 A001 的重复快照、A003 与 A004 的缺失维度关联，以及 A002 的币种编码差异；每个处理都在前后表快照中留下证据。',
  concept: {
    term: '可信明细',
    definition:
      '可信明细保留稳定的数据粒度和金额来源：重复记录有保留依据，缺失关联不会静默丢失，字段编码在进入后续聚合前已经统一。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '去重不是“随便留一条”',
      paragraphs: [
        'A001 在同一个快照日出现两条余额：98,000 和 100,000。它们不是两笔余额，不能直接相加。`updated_at` 给出了一个业务上可解释的选择依据：保留更新时间更晚的 100,000。',
        '去重规则写不出依据时，结果就无法复核。`ROW_NUMBER()` 只是表达这个选择的工具，真正需要先确定的是业务键和保留规则。',
      ],
      bullets: [
        '业务键：account_id + snapshot_date。',
        '保留依据：updated_at DESC。',
        '变化证据：重复前 5 行，去重后 4 行；A001 只留一条。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'DWD 明细 · 清洗前后对照',
      title: '三类异常各自留下什么证据？',
      description:
        '切换原始输入和 DWD 明细，查看行数、余额合计与异常标记。A003、A004 的余额仍在，只是缺失维度显示为 NULL。',
      visualization,
    },
    {
      kind: 'narrative',
      title: 'LEFT JOIN 的价值是保住事实行',
      paragraphs: [
        'A003 的账户关系指向不存在的 Customer C404，A004 指向不存在的 Product P404。如果为了写法简短直接使用 INNER JOIN，余额记录会在关联时消失，最终只看到“少了两行”，却不知道少的是谁。',
        'DWD 保留这两行，并把缺失的属性留为 NULL。后续是否纳入某张指标卡，可以根据指标条件决定；这和在加工中把事实行删掉是两件事。',
      ],
    },
    {
      kind: 'takeaway',
      title: '稳定层至少要回答三句话',
      text: '这行为什么留下？这行关联到了哪些维度？金额或编码在处理前后发生了什么？能回答这三句，DWD 才有资格被后面的 Join 和聚合复用。',
      bullets: [
        '去重有业务键和更新时间依据。',
        '缺失维度被看见，不用 INNER JOIN 静默丢余额。',
        'RMB 与 CNY 统一为 CNY，但不做未经定义的汇率换算。',
      ],
    },
  ],
}
