import type { LessonContent } from '../types'
import type { SchedulerOutputPreview, SchedulerVisualization } from '../../features/scheduler/types'
import { SCHEDULER_LATE_DATA_ARRIVAL_AT, createSchedulerTasks } from '../../utils/scheduler'
import { appendLateBalanceSnapshot, getLayerSnapshots } from '../../utils/sql-transformation'
import { sqlTransformationDataset, sqlTransformationTaskContract } from './sql-and-transformation'

function getAdsPreview(includeLateData: boolean): Pick<
  SchedulerOutputPreview,
  'beforeLateRows' | 'afterLateRows'
> & {
  amount: number
} {
  const dataset = includeLateData
    ? appendLateBalanceSnapshot(sqlTransformationDataset)
    : sqlTransformationDataset
  const ads = getLayerSnapshots(dataset).find((snapshot) => snapshot.layer === 'ads')
  const table = ads?.tables[0]
  const row = table?.rows[0]
  const amount = row?.balance

  return {
    beforeLateRows: table?.rows.length ?? 0,
    afterLateRows: table?.rows.length ?? 0,
    amount: typeof amount === 'number' ? amount : 0,
  }
}

const beforeLate = getAdsPreview(false)
const afterLate = getAdsPreview(true)

export const schedulerVisualization: SchedulerVisualization = {
  kind: 'scheduler',
  targetDate: sqlTransformationDataset.targetDate,
  tasks: createSchedulerTasks(sqlTransformationTaskContract),
  taskContract: sqlTransformationTaskContract,
  outputPreview: {
    beforeLateRows: beforeLate.beforeLateRows,
    beforeLateAmount: beforeLate.amount,
    afterLateRows: afterLate.afterLateRows,
    afterLateAmount: afterLate.amount,
  },
  lateDataArrivalAt: SCHEDULER_LATE_DATA_ARRIVAL_AT,
  lateBusinessDate: sqlTransformationDataset.targetDate,
}

export const schedulingSystemContent: LessonContent = {
  eyebrow: '第 06 课 · 时间轴驱动 DAG Run',
  opening: {
    eyebrow: '早上 6 点触发了加工，为什么指标还没更新？',
    title: '迟到数据和失败重试，怎样沿着时间线排查？',
    intro:
      '第 05 章已经交付存款余额加工契约。现在把同一条账户余额链路放入每日调度：如果业务日期的数据晚到，或 DWD 执行失败，状态会怎样沿依赖传播？',
    cards: [
      { label: '日批触发', value: '06:00', detail: '按 2026-09-30 业务日期启动一轮 DAG Run' },
      { label: '余额快照到达', value: '06:20', detail: '到达日期是 10-01，业务日期仍是 09-30' },
      {
        label: 'ADS 结果',
        value: `${beforeLate.amount.toLocaleString('zh-CN')} → ${afterLate.amount.toLocaleString('zh-CN')} 元`,
        detail: 'A005 迟到后回补 09-30 分区',
      },
    ],
    question: '指标晚到时，先查哪一个 run、哪一个业务分区、哪一次 attempt？',
  },
  subtitle: '沿存款余额加工链的任务状态、业务分区和重试记录，定位指标为什么晚到。',
  quickSummary:
    '把账户余额快照、账户、客户、产品和机构接入任务 DAG，观察迟到输入、DWD 重试、下游阻断和按业务日期重跑。',
  concept: {
    term: 'DAG Run',
    definition:
      '一次针对特定业务日期和分区的有向无环任务运行。任务只有在上游成功且输入就绪后才能运行；迟到、失败和重跑都会留下可追踪记录。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '第 05 章的契约进入每日运行',
      paragraphs: [
        '五个 ODS 接入任务汇合到 DWD，DWD 生成账户日明细，再由 DWS 聚合，最后发布指标卡对应的存款余额。调度系统负责编排执行时序，不改变每一层的数据粒度。',
        '本课把“什么时候跑、依赖是否满足、失败后怎么办”单独拿出来。加工逻辑仍由第 05 章的契约说明。',
      ],
      bullets: [
        '任务依赖决定运行先后；表依赖说明每个任务读什么、产出什么。',
        '同一套调度逻辑每天处理不同业务日期，运行记录要同时保存 run ID、分区和业务日期。',
        '迟到的是 2026-09-30 的余额快照，不应按 2026-10-01 另造一张业务报表。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'SCHEDULER LAB · 时间轴驱动 DAG Run',
      title: '观察存款余额任务如何沿依赖链流转',
      description:
        '选择调度场景，逐步推进执行时钟。观察任务如何从 queued 进入 running；输入迟到或 DWD 失败时，下游如何等待、跳过或在 recovery 后继续。',
      visualization: schedulerVisualization,
    },
    {
      kind: 'compare',
      title: '同样是“再跑一次”，输出为什么不同？',
      intro:
        '局部补数只触及指定业务分区；全链路重跑从余额快照重新走过 DWD、DWS 和 ADS。写入策略决定第二次运行是覆盖正确结果，还是制造重复输出。',
      columns: [
        {
          label: 'partial rerun',
          title: '局部补数',
          points: [
            '复用已经成功且仍然可信的上游任务。',
            '只重跑目标任务及其下游分区。',
            '适合 DWS 已正确、只需重新发布指标结果的场景。',
          ],
        },
        {
          label: 'full rerun',
          title: '全链路重跑',
          points: [
            '从余额快照重新读取同一个 business date。',
            '适合迟到的 A005 已经到达，需要重新穿过 DWD、DWS 和 ADS 的场景。',
            '依赖分区覆盖等幂等写入，避免相同业务日期的余额重复输出。',
          ],
        },
      ],
    },
    {
      kind: 'narrative',
      title: '一次成功不等于整条链路可信',
      paragraphs: [
        '任务状态、依赖状态、attempt、起止时间和 SLA 要一起看。DWD 第一次失败时，它进入 retry，DWS 只能等待；如果重试耗尽，DWS 和 ADS 会被标记为 skipped，而不会被涂成成功。人工 recovery 后，新的 attempt 才能重新放行下游。',
        '迟到场景也一样：06:00 触发不代表 09-30 的余额快照已经全部就绪。A005 在 06:20 到达前，DWD 的 dependency state 是 waiting；到达事件会进入日志，最终指标的 SLA 会反映这段延迟。',
      ],
    },
    {
      kind: 'takeaway',
      title: '读一个 DAG Run，要留下这些证据',
      text: '把“指标没更新”拆成可定位的问题：是哪一个 run、哪一个业务分区、哪一个 task、当前第几次 attempt、依赖是否满足、耗时是否越过 SLA，以及输出是否可用。',
      bullets: [
        '状态传播：上游 retry 时下游等待；上游最终 failed 时下游 skipped。',
        '分区边界：迟到数据按业务日期回补，不按到达日期凭空生成新报表。',
        '幂等边界：覆盖同一分区可保持一行；append 同一结果会留下 duplicate output。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '调度日志是排查“指标为什么晚了”的客观依据',
      text: '在生产故障复盘时，不能只凭记忆或只看最终状态。任务标识、运行实例、业务分区、重试次数（attempt）、上下游依赖就绪时刻、实际运行耗时以及 SLA 达成状态，组成了数据延迟的证据链。',
    },
    {
      kind: 'pitfall',
      title: '不要只存最终状态',
      text: '如果事件日志没有触发原因、分区和 attempt，就无法解释“为什么晚了”；如果把 task dependency 和 table dependency 混在一起，重跑范围也会被误判。',
    },
  ],
}
