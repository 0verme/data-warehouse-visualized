import type { LessonContent } from '../types'
import { createBankingSchedulerVisualization } from '../../features/scheduler/banking'

export const schedulingBusinessDateContent: LessonContent = {
  eyebrow: '第 05 章 · 业务日期与运行时间',
  opening: {
    eyebrow: '凌晨两点启动的任务，处理的是哪一天？',
    title: '今天凌晨跑的，为什么是昨天的数据？',
    intro:
      '杭州分行的存款余额日批在 2026-10-01 凌晨运行，但它要生成的是 2026-09-30 的余额结果。沿着同一条时间轴，把数据属于哪一天和系统什么时候处理分开。',
    cards: [
      { label: '业务日期', value: '2026-09-30', detail: '这批日终余额属于哪一天' },
      { label: '日批触发', value: '02:00', detail: '系统按计划启动一次运行' },
      { label: '目标分区', value: 'snapshot_date', detail: '= 2026-09-30' },
    ],
    question: '任务在 10 月 1 日凌晨开始，最后应该修改哪个分区？',
  },
  subtitle: '把数据所属日期和系统墙上时间分开，判断日批最终写入哪个分区。',
  quickSummary:
    '同一批存款余额要同时记录业务日期、到达时间、触发时间、实际开始时间和完成时间；这些时间描述不同事实。',
  concept: {
    term: '业务日期（Business Date）',
    definition:
      '业务日期表示这批数据在业务上属于哪一天。日终余额的业务日期是 2026-09-30，即使输入在 10 月 1 日凌晨才到达、任务也在那时开始。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '一批数据有五个时间点',
      paragraphs: [
        '这次要加工的是 2026-09-30 的 AccountBalanceSnapshot。上游原计划在 10 月 1 日 01:30 到达，日批在 02:00 触发；实际输入到 02:20 才准备好，DWD 在 02:21 开始，最后 ADS 才会完成。',
        '“什么时候发生”与“这批数据属于哪一天”是两条不同的信息。到达晚了，不会把 9 月 30 日的余额变成 10 月 1 日的余额。',
      ],
      bullets: [
        '业务日期（Business Date）：2026-09-30，决定本次加工的数据归属。',
        '到达时间（Arrival Time）：2026-10-01 02:20，说明输入何时进入可处理范围。',
        '触发时间（Trigger Time）：2026-10-01 02:00，说明系统何时发起这次运行。',
        '实际开始时间与完成时间：说明任务真正何时工作、何时产出。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '时间语义实验 · 一条日批时间轴',
      title: '推进时间轴，找出真正修改的分区',
      description:
        '沿着 02:00 触发、02:20 输入到达、02:21 开始加工的时间线推进。观察运行记录中的业务日期始终不变，并回答结果写入哪个分区。',
      visualization: createBankingSchedulerVisualization('business-date'),
    },
    {
      kind: 'narrative',
      title: '最后修改的不是“今天”分区',
      paragraphs: [
        '这条链路的输出粒度是日期、机构、客户口径、产品和币种。输入迟到时，任务仍然要重新计算原来的业务日期，目标分区写成 `snapshot_date = 2026-09-30`。',
        '如果按到达日新增一份 2026-10-01 结果，分析人员看到的就不是 9 月 30 日的日终余额，迟到问题反而被藏进了错误日期。',
      ],
      bullets: [
        '到达时间用于判断输入何时可用，不改变余额所属日期。',
        '触发时间用于定位一次运行，不等于数据的统计日期。',
        '业务日期和目标分区要在运行记录里一起保留。',
      ],
    },
    {
      kind: 'takeaway',
      title: '先回答：这批数据到底属于哪一天？',
      text: '面对凌晨任务，先看业务日期，再看到达、触发、开始和完成时间。这个顺序能避免把墙上时间误当成数据日期。',
      bullets: [
        '本例最终修改：`snapshot_date = 2026-09-30`。',
        '02:00 是 Trigger，不代表任务已经 Start。',
        '迟到输入应该进入同一业务日期的处理链。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要用到达日期替代业务日期',
      text: '一条数据 10 月 1 日到达，只能说明它在这天进入系统；它可能描述 9 月 30 日的状态。日期字段的含义要看业务过程，而不是看文件或任务何时被看到。',
    },
  ],
}
