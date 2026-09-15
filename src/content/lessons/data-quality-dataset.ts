import type { LessonContent } from '../types'
import { createDataQualityVisualization } from '../../utils/data-quality'
import { qualitySchedulerRun, qualityTeachingModel } from './data-quality'

export const dataQualityDatasetVisualization = createDataQualityVisualization(
  qualitySchedulerRun,
  'dataset',
  qualityTeachingModel,
)

export const dataQualityDatasetContent: LessonContent = {
  eyebrow: '第 07 章 · 7-3 整批与加工链',
  opening: {
    eyebrow: '每一行都正常，为什么结果还是可能错？',
    title: '每一行都正常，为什么结果还是可能错？',
    intro:
      '如果只抽查收到的记录，它们可能全部通过非空、枚举和引用检查。问题在于：应该来的账户是否都来了？内容日期是否追上业务日期？DWD 和 DWS 是否算的是同一批余额？',
    cards: [
      { label: '应到集合', value: '10,000', detail: '2026-09-30 有效 Account' },
      { label: '实到快照', value: '7,000', detail: '少了 3,000 个账户' },
      { label: 'Freshness', value: '09-29', detail: '任务按时完成但内容还是昨天' },
      { label: 'Reconciliation', value: '10 亿 → 8 亿', detail: '同口径对账 delta = -2 亿' },
    ],
    question: '7000 条都合法，能不能证明这批结果完整？',
  },
  subtitle: '从单行判断上升到应到集合、数据日期和跨层结果。',
  quickSummary: '整批完整性、Freshness 和跨层对账检查的是集合与加工结果，不是某一行单独是否合法。',
  concept: {
    term: '整批质量',
    definition: '整批质量把实际产出与明确的应到集合、目标业务日期和同口径的跨层结果进行比较。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '完整的行，不一定组成完整的批次',
      paragraphs: [
        '本例明确知道 2026-09-30 有效 Account 应到 10000 个，实际 AccountBalanceSnapshot 只有 7000 个。收到的 7000 条可以全部满足非空、币种和机构引用规则，整批仍少了 3000 个账户。',
        '“昨天有 10000 条、今天有 7000 条”只能描述波动，不能单独证明缺失。质量规则需要一个业务上明确的应到集合。',
      ],
      bullets: [
        '应到集合：10000 个有效 Account。',
        '实际集合：7000 个 AccountBalanceSnapshot。',
        '缺口：3000 个账户，没有逐行坏样本也可以成立。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'DATASET QUALITY LAB · 批次与结果',
      title: '把每一行、整批和加工链放在三个位置看',
      description:
        '切换整批缺口、Freshness 和跨层对账。每个场景都使用相同的日期、机构、客户口径、产品和币种约束。',
      visualization: dataQualityDatasetVisualization,
    },
    {
      kind: 'narrative',
      title: 'Freshness 检查数据内容的日期',
      paragraphs: [
        'Scheduler 记录 business_date = 2026-09-30，任务在 07:20 SUCCESS，SLA MET；但 DWD 的 MAX(snapshot_date) 仍然是 2026-09-29。任务运行及时，数据内容却不新鲜。',
        '这里比较的是产出记录表达的日期，不再次讲上游什么时候到、为什么等待或怎样重试。',
      ],
      bullets: [
        '运行及时：属于第 06 章的任务事实。',
        '内容新鲜：属于第 07 章的日期质量。',
        '两者可以同时为真，也可以一个为真、另一个失败。',
      ],
    },
    {
      kind: 'takeaway',
      title: '跨层对账必须先固定口径',
      text: 'DWD 重聚合和 DWS 比较时，至少固定 business_date、币种、统计范围、客户口径和产品口径。只有这样，delta 才有判断意义。',
      bullets: [
        'DWD：1,000,000,000。',
        'DWS：800,000,000。',
        'delta：-200,000,000；每一行合法也不能掩盖整条加工链的缺口。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把所有 SUM 无脑相等当成规则',
      text: '不同业务日期、币种或统计范围的金额不能直接对账。对账规则首先要说明比较的是哪一个业务口径。',
    },
  ],
}
