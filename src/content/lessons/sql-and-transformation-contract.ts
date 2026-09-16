import type { LessonContent } from '../types'
import { depositBalanceDataset, depositBalanceTaskContract } from '../../data/deposit-balance'
import type { SqlTransformationVisualization } from '../../features/sql-transformation/types'

const visualization: SqlTransformationVisualization = {
  kind: 'sql-transformation',
  focus: 'contract',
  targetDate: depositBalanceDataset.targetDate,
  dataset: depositBalanceDataset,
  taskContract: depositBalanceTaskContract,
}

export const sqlTransformationContractContent: LessonContent = {
  eyebrow: '第 04 章 · 交付加工边界',
  opening: {
    eyebrow: '同样的输入，同一个业务日期，再执行一次会得到什么？',
    title: '这段加工怎样交给下一环节？',
    intro:
      '写完 SQL 还不够。下一位接手的人至少要知道输入、输出、数据粒度、业务日期、目标分区、上游依赖，以及重复执行时应该看到什么。',
    cards: [
      { label: '输入', value: '5 张表', detail: '快照、账户、客户、产品、机构' },
      { label: '输出', value: 'ads_deposit_balance_daily', detail: '一张指标卡一行' },
      { label: '业务日期', value: '2026-09-30', detail: '目标分区 snapshot_date' },
    ],
    question: '加工契约（Task Contract）把一段 SQL 变成下一环节可以接手的数据任务说明。',
  },
  subtitle: '把输入、输出和业务日期写进加工契约，让同一分区的再次执行有明确预期。',
  quickSummary:
    '用存款余额加工链写出最小加工契约：五类输入、ADS 输出、目标数据粒度、业务日期、分区、上游依赖和重复执行预期。',
  concept: {
    term: '加工契约（Task Contract）',
    definition:
      '加工契约是数据加工对上下游作出的边界说明：输入和输出是什么，数据按什么粒度组织，哪个业务日期和分区被处理，以及相同输入再次执行应保持什么结果。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先写清楚“这次加工处理哪一天”',
      paragraphs: [
        '本次加工属于业务日期 2026-09-30，目标分区是 `snapshot_date = 2026-09-30`。`ingested_at` 只描述输入何时进入系统，不会把这条余额改成 2026-10-01 的业务数据。',
        '因此，同一业务日期再次执行时，应覆盖或替换这一天的目标结果，不能把相同余额再追加一份。这里先记录预期；运行时何时触发、输入迟到后如何安排，属于调度系统要解决的问题。',
      ],
      bullets: [
        '输入：AccountBalanceSnapshot、Account、Customer、Product、Branch。',
        '输出：ads_deposit_balance_daily。',
        '数据粒度：snapshot_date × branch × customer_scope × product_type × currency。',
        '重复执行预期：同样输入和业务日期得到同样结果，不重复累加余额。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '加工契约 · 把边界交给下一环节',
      title: '一段加工需要哪些交付信息？',
      description:
        '查看这条存款余额加工的最小契约。契约只描述输入、输出和数据语义；真正的触发、失败与迟到处理留给运行系统。',
      visualization,
    },
    {
      kind: 'narrative',
      title: '契约让重复执行变成可检查的预期',
      paragraphs: [
        '如果第一次得到 300,000，第二次运行同样的输入和 2026-09-30 业务日期，结果仍应是 300,000。看到 600,000 时，优先检查写入是否把同一分区追加了两次，而不是怀疑 SUM 自己变了。',
        '契约还要写出上游依赖已经准备完成。这样下一环节拿到的是一条有边界的加工，而不是一段只能由作者本人解释的 SQL。',
      ],
    },
    {
      kind: 'takeaway',
      title: '交付前复述一遍这条链',
      text: '给出同一批输入和业务日期，任何接手者都应该能复述输出表、一行代表什么、目标分区和重复执行预期。',
      bullets: [
        '输入准备好，才有资格生成 DWD、DWS 和 ADS。',
        '业务日期决定处理哪一个快照分区，不由到达日期替代。',
        '同一天重跑不重复累加；何时跑、失败如何恢复，交给调度系统。',
      ],
    },
  ],
}
