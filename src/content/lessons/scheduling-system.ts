import type { LessonContent } from '../types'
import type { SchedulerVisualization, SchedulerOutputPreview } from '../../features/scheduler/types'
import { SCHEDULER_LATE_DATA_ARRIVAL_AT, createSchedulerTasks } from '../../utils/scheduler'
import { getLayerSnapshots } from '../../utils/sql-transformation'
import { sqlTransformationDataset, sqlTransformationTaskContract } from './sql-and-transformation'

function getAdsPreview(includeLateData: boolean): Pick<
  SchedulerOutputPreview,
  'beforeLateRows' | 'afterLateRows'
> & {
  amount: number
} {
  const ads = getLayerSnapshots(sqlTransformationDataset, 'order', includeLateData).find(
    (snapshot) => snapshot.layer === 'ads',
  )
  const table = ads?.tables[0]
  const row = table?.rows[0]
  const amount = row?.sales_amount

  return {
    beforeLateRows: includeLateData ? 0 : (table?.rows.length ?? 0),
    afterLateRows: includeLateData ? (table?.rows.length ?? 0) : 0,
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
    eyebrow: '早上 8 点，报表为什么还没到？',
    title: '先看时间，再看绿色勾',
    intro:
      '第 05 章已经把订单加工成 DWD、DWS 和 ADS。现在把同一条链路放进日批：上游迟到、任务失败和重跑会怎样沿着依赖传播？',
    cards: [
      { label: '日批触发', value: '06:00', detail: '按业务日期启动一轮 DAG Run' },
      { label: '上游迟到', value: '06:20', detail: '支付批次到达前，DWD 不能越过依赖' },
      {
        label: 'ADS 结果',
        value: `${beforeLate.amount} → ${afterLate.amount} 元`,
        detail: 'O1005 属于 09-13，迟到后必须重跑业务分区',
      },
    ],
    question: '调度不是把 SQL 定时点一下，而是在管理数据依赖、业务日期和每一次状态变化。',
  },
  subtitle: '沿着时间轴推进一轮日批，观察依赖如何放行、失败如何阻断，以及重跑为何必须声明边界。',
  quickSummary:
    '复用第 05 章的 sqlTransformationTaskContract，把 ODS → DWD → DWS → ADS 变成可操作的 DAG Run：时间推进，状态传播，事件留证。',
  concept: {
    term: 'DAG Run',
    definition:
      '一次针对特定业务日期和分区的有向无环任务运行。任务只有在所有上游成功且输入就绪后才能运行；失败、迟到和重跑都会留下可追踪的运行记录。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '这不是一条新数据链，而是给第 05 章加上时间',
      paragraphs: [
        '订单事件、订单明细、用户、支付和退款仍然来自第 05 章。五个 ODS 落地任务汇合到 DWD，DWD 再生成 dws_sales_daily，最后由原来的 transform.sales.daily.v1 发布 ads_yesterday_sales。调度层只编排它们，不复制订单，也不重新实现 SQL。',
      ],
      bullets: [
        'DAG 依赖的是任务 identity；task contract 里的 dependencies 仍然表达输入表。两者不能混成一个字段。',
        '同一套任务可以运行不同 business date，但 run identity、partition 和事件日志必须把日期写清楚。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'SCHEDULER LAB · 时间轴驱动 DAG Run',
      title: '让时间、依赖和状态传播成为主角',
      description:
        '切换确定性场景，再用播放、单步或跳到故障时刻推进时钟。看节点如何从 queued 变成 running，为什么迟到和失败会让下游等待或 skipped。',
      visualization: schedulerVisualization,
    },
    {
      kind: 'compare',
      title: '同样是“再跑一次”，输出为什么不同？',
      intro:
        '局部补数只应该触及声明支持的业务分区；全链路重跑则从 ODS 重新走过依赖。写入策略还决定第二次运行是覆盖正确结果，还是制造重复输出。',
      columns: [
        {
          label: 'partial rerun',
          title: '局部补数',
          points: [
            '复用已经成功且仍然可信的上游任务。',
            '只重跑目标任务及其下游分区。',
            '适合 DWS 已正确、只需重新发布 ADS 的场景。',
          ],
        },
        {
          label: 'full rerun',
          title: '全链路重跑',
          points: [
            '从 ODS 重新读取同一个 business date。',
            '适合上游迟到数据已经到达的场景。',
            '依赖 task contract 的幂等写入，避免重复结果。',
          ],
        },
      ],
    },
    {
      kind: 'narrative',
      title: '一次成功不等于整条链路可信',
      paragraphs: [
        '任务状态、依赖状态、attempt、起止时间和 SLA 要一起看。DWD 第一次失败时，它进入 retry，DWS 只能等待；如果重试耗尽，DWS 和 ADS 会被标记为 skipped，而不会被涂成成功。人工 recovery 后，新的 attempt 才能重新放行下游。',
        '迟到场景也一样：06:00 触发不代表输入已经就绪。支付批次在 06:20 到达前，DWD 的 dependency state 是 waiting；到达事件会进入日志，最终 ADS 的 SLA 会反映这段延迟。',
      ],
    },
    {
      kind: 'takeaway',
      title: '读一个 DAG Run，要留下这些证据',
      text: '把“报表没到”拆成可定位的问题：是哪一个 run、哪一个业务分区、哪一个 task、当前第几次 attempt、依赖是否满足、耗时是否越过 SLA，以及输出是否可用。',
      bullets: [
        '状态传播：上游 retry 时下游等待；上游最终 failed 时下游 skipped。',
        '分区边界：迟到数据按业务日期回补，不按到达日期凭空生成新报表。',
        '幂等边界：覆盖同一分区可保持一行；append 同一结果会留下 duplicate output。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '给后续质量检查留下稳定接口',
      text: '本章对外表达 task identity、run identity、business date / partition、attempt、task status、dependency state、start/end/runtime、SLA state 和 output state。它们是运行事实，不提前实现第 07 章的质量规则。',
    },
    {
      kind: 'pitfall',
      title: '不要只存最终状态',
      text: '如果事件日志没有触发原因、分区和 attempt，就无法解释“为什么晚了”；如果把 task dependency 和 table dependency 混在一起，重跑范围也会被误判。',
    },
  ],
}
