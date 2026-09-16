import type { LessonContent } from '../types'
import { createBankingSchedulerVisualization } from '../../features/scheduler/banking'

export const schedulingRerunContent: LessonContent = {
  eyebrow: '第 05 章 · 重跑范围与幂等',
  opening: {
    eyebrow: '“再跑一次”有三种完全不同的意思',
    title: '同样是“再跑一次”，到底有什么不同？',
    intro:
      '杭州分行 2026-09-30 的余额结果需要重新执行时，先判断这是 Retry、Rerun 还是 Backfill，再决定日期范围和 DAG 起点。最后用重复写入反例检查重跑是否安全。',
    cards: [
      { label: 'Retry', value: '同一 Run', detail: '失败任务增加一次 Attempt' },
      { label: 'Rerun', value: '一天', detail: '重新计算一个已有业务日期' },
      { label: 'Backfill', value: '一段历史', detail: '批量补跑多个业务日期' },
    ],
    question: '9 月 30 日结果错了，应该重试一次、重跑一天，还是补跑一段日期？',
  },
  subtitle: '用运行历史和日期选择器区分 Retry、Rerun、Backfill，并判断局部或整链重跑范围。',
  quickSummary:
    'Retry 处理一次失败的任务实例；Rerun 重算一个业务日期；Backfill 批量补跑历史日期。范围确定后，还要保证相同分区重复执行不会叠加结果。',
  concept: {
    term: '幂等（Idempotency）',
    definition:
      '对同一个业务日期和目标分区，用相同输入重复执行时，结果应保持同一份业务结果，而不是因为写入动作重复就多出一份余额。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先确定“跑哪一天”',
      paragraphs: [
        'Retry 不会改变业务日期：DWD 的 Attempt 1 失败后，Attempt 2 仍处理 2026-09-30。Rerun 是对已经存在的 2026-09-30 重新发起一次运行；Backfill 则把 2026-09-25 到 2026-09-30 这段历史日期逐日补齐。',
        '迟到的余额快照属于 9 月 30 日时，应回到这个业务日期的目标分区重算，而不是在 10 月 1 日追加一份看似最新的余额。',
      ],
      bullets: [
        'Retry：同一任务实例的下一次 Attempt。',
        'Rerun：已有业务日期的一次重新执行。',
        'Backfill：一段历史业务日期的批量补跑。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '运行历史实验 · 日期与范围选择',
      title: '选择“再跑一次”的含义',
      description:
        '切换 Retry、Rerun、Backfill，观察运行实例、业务日期和日期范围如何变化；再选择从 DWS 或 ADS 开始，比较哪些上游结果可以复用。',
      visualization: createBankingSchedulerVisualization('rerun'),
    },
    {
      kind: 'narrative',
      title: '再决定从 DAG 的哪个位置开始',
      paragraphs: [
        '如果 DWD 的明细结果仍然正确，只是 DWS 逻辑修正，可以从 DWS 开始并继续到 ADS，复用已经成功的 DWD。若 AccountBalanceSnapshot 本身发生修正，就要让修正重新经过 DWD、DWS 和 ADS。',
        '因此重跑范围有两个维度：要计算哪些业务日期，以及从 DAG 的哪个位置开始。不能只看到“重跑”两个字就默认整条链路都要重做。',
      ],
      bullets: [
        'DWD 正确、DWS 逻辑错误：复用 DWD，重新执行 DWS → ADS。',
        '输入快照修正：重新执行 DWD → DWS → ADS。',
        '是否复用上游，要看上游结果是否仍然代表当前输入和规则。',
      ],
    },
    {
      kind: 'compare',
      title: '同一分区，覆盖和追加会留下什么？',
      intro: '调度系统可以发起重跑，但不能替加工任务决定写入语义。',
      columns: [
        {
          label: '正确的重复执行',
          title: '按目标分区覆盖',
          points: [
            '第一次：杭州分行余额 = 100 万。',
            'Rerun 同一个 snapshot_date。',
            '结果仍然是 100 万，目标分区只有一份结果。',
          ],
        },
        {
          label: '错误的重复执行',
          title: 'INSERT APPEND',
          points: [
            '第一次：杭州分行余额 = 100 万。',
            'Rerun 再追加一行相同结果。',
            '查询得到 200 万，任务虽成功，结果却重复。',
          ],
        },
      ],
    },
    {
      kind: 'takeaway',
      title: '重跑前问两个问题',
      text: '先选业务日期，再选 DAG 起点；完成后检查相同输入、相同业务日期是否仍然得到同一份目标结果。幂等是加工任务提供的重复执行语义，不是调度器自动附赠的能力。',
      bullets: [
        '这次是 Retry、Rerun 还是 Backfill？',
        '哪些上游结果可以复用，哪些必须重新计算？',
        '目标分区重复写入后，结果会保持一份还是叠加？',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把 Retry、Rerun、Backfill 混成“重跑”',
      text: '它们处理的运行对象和日期范围不同。也不要以为调度器发起第二次执行，就能自动修复 INSERT APPEND 带来的重复结果。',
    },
  ],
}
