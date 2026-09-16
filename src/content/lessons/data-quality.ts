import type { LessonContent } from '../types'
import type { DataQualityVisualization } from '../../features/data-quality/types'
import { depositBalanceQualityEvent } from '../../features/data-quality/banking'
import {
  QUALITY_BUSINESS_DATE,
  createDataQualityVisualization,
  createQualitySchedulerRun,
  createQualityTeachingModel,
} from '../../utils/data-quality'
import { schedulerVisualization } from './scheduling-system'

export { depositBalanceQualityEvent }

export const qualitySchedulerRun = createQualitySchedulerRun(
  schedulerVisualization.tasks,
  QUALITY_BUSINESS_DATE,
)
export const qualityTeachingModel = createQualityTeachingModel()

/** 6-1 keeps the existing slug and introduces the three independent states. */
export const dataQualityVisualization: DataQualityVisualization = createDataQualityVisualization(
  qualitySchedulerRun,
  'status',
  qualityTeachingModel,
)

export const dataQualityContent: LessonContent = {
  eyebrow: '第 06 章 · 6-1 数据质量状态',
  opening: {
    eyebrow: '任务成功了，数据就可信了吗？',
    title: '任务成功了，数据就可信了吗？',
    intro:
      'business_date 是 2026-09-30。AccountBalanceSnapshot 与 Account、Customer、Product、Branch 一起加工成 DWD、DWS 和 ADS；日批在 07:20 完成，Scheduler 显示 SUCCESS，SLA 也显示 MET，但存款余额仍然对不上。接下来要看的，是一条独立的质量状态。',
    cards: [
      { label: 'Run Status', value: 'SUCCESS', detail: '程序运行完成' },
      { label: 'SLA', value: 'MET', detail: '按约定时间完成' },
      { label: 'Quality', value: 'FAILED', detail: '数据内容检查没有通过' },
      { label: 'Release', value: 'BLOCKED', detail: '关键银行结果暂不发布' },
    ],
    question: '任务已经成功且按时完成，为什么存款余额仍然不能发布？',
  },
  subtitle: '从第 05 章交接来的 SUCCESS 和 SLA MET，只是质量判断的起点。',
  quickSummary:
    '运行完成、数据通过质量检查、允许发布是三个独立判断。质量失败时，要留下证据，并在关键结果上阻断发布。',
  concept: {
    term: '质量状态',
    definition:
      '质量状态描述产出的数据是否满足已声明的检查规则。它不改写 Scheduler 的运行状态，也不自动等价于发布许可。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '同一轮日批里，三个状态各自回答什么？',
      paragraphs: [
        'Scheduler SUCCESS 回答“程序有没有正常结束”；SLA MET 回答“任务有没有在约定时间内结束”。它们都没有回答“产出的账户余额能不能相信”。',
        '质量检查会把同一轮运行的业务日期、分区、任务和产出内容放在一起核对。只有检查通过，结果才有机会进入发布判断。',
      ],
      bullets: [
        '运行状态：这次任务有没有跑完。',
        'Quality 状态：这批数据是否满足已声明的规则。',
        'Release 状态：现在是否允许把结果交给下游使用。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'STATUS FLOW · 三个状态分开看',
      title: 'SUCCESS → Quality FAILED → Release BLOCKED',
      description:
        '点击查看本次对账失败留下的事实证据。这里不重新演示等待、重试或补数；那些判断属于第 05 章。',
      visualization: dataQualityVisualization,
    },
    {
      kind: 'narrative',
      title: '质量检查从哪里接手？',
      paragraphs: [
        '质量层拿到 run id、business date、partition、task status 和输出表等运行上下文，再检查表里的数据。这样“任务跑完了”与“结果可信”之间有一条可以复核的边界。',
        '本章后面会把问题拆开：先看一行余额记录是否合理，再看整批数据和加工链，最后保存能交给调查流程继续使用的质量事实。',
      ],
      bullets: [
        '第 05 章说明任务何时运行、依赖是否放行。',
        '第 06 章说明产出内容是否满足规则。',
        '第 07 章再沿质量事实查可能的来源和影响。',
      ],
    },
    {
      kind: 'takeaway',
      title: '先记住这条判断链',
      text: '一次运行成功，只能把问题带到质量检查门口。银行关键数据已知失败时，质量失败会让发布保持 BLOCKED。',
      bullets: [
        'SUCCESS 不等于 Quality PASS。',
        'SLA MET 不等于数据内容足够新。',
        'Release BLOCKED 是发布判断，不是 Scheduler 任务失败。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要用一个绿色勾代替三个问题',
      text: '看到任务成功就直接发布，会把运行问题、数据问题和发布责任混在一起。每个状态都要有自己的证据。',
    },
  ],
}
