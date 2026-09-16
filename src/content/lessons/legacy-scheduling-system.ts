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
const legacyTasks = createSchedulerTasks(sqlTransformationTaskContract)
const legacySchedulerTasks = legacyTasks.map((task, index) =>
  index === legacyTasks.length - 1
    ? {
        ...task,
        contract: { ...task.contract, outputTable: 'ads_yesterday_sales' },
      }
    : task,
)

export const legacySchedulerVisualization: SchedulerVisualization = {
  kind: 'scheduler',
  targetDate: sqlTransformationDataset.targetDate,
  tasks: legacySchedulerTasks,
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

export const legacySchedulingSystemContent: LessonContent = {
  eyebrow: '第 05 章 · 时间轴驱动 DAG Run',
  opening: {
    eyebrow: '早上 8 点，报表为什么还没到？',
    title: '报表晚到时，时间线上的绿色勾说明什么？',
    intro:
      '当订单明细逐步加工成 DWD、DWS 和 ADS 后，把整条链路放入每日定时批处理中：如果上游数据迟到或某个任务失败，故障会如何沿着依赖链向下扩散？',
    cards: [
      { label: '日批触发', value: '06:00', detail: '按业务日期启动一轮 DAG Run' },
      { label: '上游迟到', value: '06:20', detail: '支付批次到达前，DWD 不能越过依赖' },
      {
        label: 'ADS 结果',
        value: `${beforeLate.amount} → ${afterLate.amount} 元`,
        detail: 'O1005 属于 09-13，迟到后必须重跑业务分区',
      },
    ],
    question: '早上 8 点报表还没到，先查哪一个任务、哪个业务分区、哪一次重试？',
  },
  subtitle: '早上 8 点报表没出，沿着任务状态、业务分区和重试记录找出卡在哪里。',
  quickSummary:
    '把 ODS → DWD → DWS → ADS 编排成一轮日批，沿时间线追踪依赖放行、状态传播和异常排查。',
  concept: {
    term: 'DAG Run',
    definition:
      '一次针对特定业务日期和分区的有向无环任务运行。任务只有在所有上游成功且输入就绪后才能运行；失败、迟到和重跑都会留下可追踪的运行记录。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '将离线加工链路接入时间与依赖调度',
      paragraphs: [
        '五个 ODS 接入任务汇合到 DWD，DWD 清洗后汇总为 dws_sales_daily，最后由发布任务生成 ads_yesterday_sales。调度系统负责编排这些任务的执行时序，确保每个节点只有在所有上游就绪时才开始运行。',
      ],
      bullets: [
        '任务依赖（Task Dependency）决定运行先后顺序；表依赖（Table Dependency）表达数据的输入输出来源。两者不能混为一谈。',
        '同一套调度逻辑每天处理不同的业务日期，因此运行日志中必须明确区分执行实例 ID、分区键与业务日期。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'SCHEDULER LAB · 时间轴驱动 DAG Run',
      title: '观察任务状态如何沿依赖链流转',
      description:
        '选择不同调度场景，逐步推进执行时钟。观察任务节点如何从排队（queued）进入运行（running），以及上游迟到或报错时下游如何自动等待或跳过（skipped）。',
      visualization: legacySchedulerVisualization,
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
            '依赖任务本身的幂等写入机制（如分区覆盖），避免重复输出导致数据翻倍。',
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
      title: '调度日志是排查“报表为什么晚了”的唯一依据',
      text: '在生产故障复盘时，不能只凭记忆或只看最终状态。调度系统留下的任务标识、运行实例、业务分区、重试次数（attempt）、上下游依赖就绪时刻、实际运行耗时以及 SLA 达成状态，是定位数据延迟与责任边界的客观依据。',
    },
    {
      kind: 'pitfall',
      title: '不要只存最终状态',
      text: '如果事件日志没有触发原因、分区和 attempt，就无法解释“为什么晚了”；如果把 task dependency 和 table dependency 混在一起，重跑范围也会被误判。',
    },
  ],
}
