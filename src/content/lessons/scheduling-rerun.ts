import type { LessonContent } from '../types'
import { createBankingSchedulerVisualization } from '../../features/scheduler/banking'

export const schedulingRerunContent: LessonContent = {
  eyebrow: '第 05 章 · 重跑范围与幂等',
  opening: {
    eyebrow: '“再跑一次”有三种完全不同的意思',
    title: '同样是“再跑一次”，到底有什么不同？',
    intro:
      '杭州分行 2026-09-30 的余额结果需要重新执行时，先判断这是 Retry、Rerun 还是 Backfill，再决定日期范围和 DAG 起点。还要检查迁移期间是否有两个仍启用的生产入口指向同一逻辑。',
    cards: [
      { label: 'Retry', value: '同一 Run', detail: '失败任务增加一次 Attempt' },
      { label: 'Rerun', value: '一天', detail: '重新计算一个已有业务日期' },
      { label: 'Backfill', value: '一段历史', detail: '批量补跑多个业务日期' },
    ],
    question: '9 月 30 日结果错了，应该重试一次、重跑一天，还是补跑一段日期？',
  },
  subtitle: '区分 Retry、Rerun、Backfill 与意外双入口；观察运行范围、写入语义和下游副作用。',
  quickSummary:
    'Retry 处理一次失败的任务实例；Rerun 明确重算一个业务日期；Backfill 批量补跑历史日期。除此之外，迁移时必须确认同一生产逻辑没有两个意外同时有效的调度入口；SQL 幂等不能消除重复计算与外部副作用。',
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
      kind: 'narrative',
      title: '主动 Rerun，不等于两个入口同时触发',
      paragraphs: [
        'Rerun 是明确的运行行为：有人为恢复或纠错而发起一次运行，有目标业务日期、范围和运行记录。它回答“为什么这次要再跑”。',
        '双入口事故发生在配置层：迁移过程中旧 JOB 未下线、新 JOB 已启用；两个独立定义都认为自己应该在 2026-09-30 执行，于是分别触发同一生产逻辑和目标。它不是一个 Run 的第二次 Attempt，也不必然带有恢复意图。',
      ],
      bullets: [
        'Rerun：一个明确的操作意图，检查目标日期、重跑范围、原因和 run history。',
        '双入口：两个 enabled schedule 各自触发，排查定义状态、ownership、独立 run record 与下游产物。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '迁移切换实验 · enabled state × target semantics',
      title: '旧 JOB 和新 JOB 都开着，会发生什么？',
      description:
        '先保持两个入口 ON，运行一次 2026-09-30；观察触发、执行、写入和下游产物数量。再比较幂等 / 非幂等目标，并关闭旧入口验证单入口恢复。',
      visualization: createBankingSchedulerVisualization('duplicate-entry'),
    },
    {
      kind: 'narrative',
      title: '用 cutover checklist 收敛到唯一生产入口',
      paragraphs: [
        '迁移前确认这个业务产物的负责人、生产入口、业务日期和目标；切换时按已约定的顺序 disable 旧入口、enable 新入口，并确认实际 enabled/disabled 状态，而不是只看配置提交成功。',
        '切换后核对该业务日期的 run history、任务实例和下游证据：生产逻辑实际执行几次、目标分区有几份数据、生成多少文件、发起多少次推送。表结果正确并不能证明没有重复运行或重复副作用。',
        '有意双跑用于影子比较并非一概禁止，但应由明确 owner 负责，隔离目标并控制通知、文件和外部推送等副作用，记录比较窗口与清理条件。调度平台的去重能力及组织发布门禁各不相同，需按本地约定验证。',
      ],
      bullets: [
        '迁移前：明确唯一生产入口、owner、业务日期和目标。',
        '切换时：核验旧入口 disabled、新入口 enabled，保留变更与 run history。',
        '切换后：对照 run record、目标数据、文件与推送证据。',
      ],
    },
    {
      kind: 'takeaway',
      title: '调度定义也是数据正确性的一部分',
      text: '同一业务日期的加工逻辑被两个有效入口触发时，即使下游表按分区覆盖、最终行数仍正确，也可能重复计算、生成文件、调用接口或发送通知。正确性依赖加工写入语义，也依赖生产入口配置。',
      bullets: [
        '这次是带目标日期与恢复意图的 Rerun，还是两个生产入口各自触发？',
        '同一逻辑指向什么目标，实际有几个 trigger / run / write？',
        '幂等保护了哪些数据结果，哪些文件、推送或通知仍会重复？',
        '迁移前后，run history 和下游证据是否证明只有预期入口生效？',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把 SQL 幂等当成双调度入口的豁免',
      text: '两个有效入口仍可能重复计算并重复产生文件、推送或通知；也不要把这种配置事故误记成一次有意、有目标日期和恢复记录的 Rerun。',
    },
  ],
}
