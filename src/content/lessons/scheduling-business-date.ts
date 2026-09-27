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
        '`current_date` 通常描述数据库执行环境按其时区解释的当前日期；`schedule_date` 标识本任务约定的调度实例日期；`biz_date` 才是本次计算的数据业务日期。三者的映射由任务契约决定，不能从凌晨时刻或字段名字自动推导。',
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
      eyebrow: '时间语义实验 · 日期字段与运行时间',
      title: '切换运行场景，核对日期字段与目标分区',
      description:
        '先切换夜间日批、当日微批、迟到 Retry、次日 Rerun 或跨日 Backfill，观察 Wall Clock、current_date、schedule_date、biz_date 与 snapshot_date。再推进原有时间轴，查看触发、输入到达、实际开始和完成时间。',
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
      title: '先分清：现在是哪天、实例属于哪轮、数据属于哪天',
      text: 'Wall Clock 是执行环境的实际时间；schedule_date 和 biz_date 的对应关系由任务契约明示。时间推进到次日，不代表逻辑实例或数据归属必须跟着变。',
      bullets: [
        '本例存款日批最终修改：`snapshot_date = 2026-09-30`。',
        'Retry 可沿用原实例日期；Rerun / Backfill 的实例日期与目标业务日期按任务约定记录。',
        'SQL `current_date` 受数据库引擎和 session 时区语义影响，不是业务日期的替代品。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要用运行日或到达日替代业务日期',
      text: '一条数据 10 月 1 日到达，只能说明它在这天进入系统；它可能描述 9 月 30 日的状态。用 `current_date` 填分区也可能把旧业务数据标到新日期。先确认业务日期字段、调度实例参数、时区和目标分区映射，不要把某个团队的 T-1 规则当作行业标准。',
    },
  ],
}
