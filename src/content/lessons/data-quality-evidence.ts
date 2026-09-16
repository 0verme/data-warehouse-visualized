import type { LessonContent } from '../types'
import { createDataQualityVisualization } from '../../utils/data-quality'
import { qualitySchedulerRun, qualityTeachingModel } from './data-quality'

export const dataQualityEvidenceVisualization = createDataQualityVisualization(
  qualitySchedulerRun,
  'evidence',
  qualityTeachingModel,
)

export const dataQualityEvidenceContent: LessonContent = {
  eyebrow: '第 06 章 · 6-4 质量证据',
  opening: {
    eyebrow: '质量失败以后，我们到底应该看什么？',
    title: '质量失败以后，我们到底应该看什么？',
    intro:
      '“规则失败”只是一个结论。排查需要回到表、分区、字段、期望、观察值和证据；有坏行时展示样本，没有坏行时就保留聚合或日期比较。',
    cards: [
      { label: 'Rule', value: 'branch_reference_check', detail: '哪条规则失败' },
      { label: 'Target', value: 'table / partition / field', detail: '检查的范围' },
      { label: 'Expected', value: 'Branch 中必须存在', detail: '期望发生什么' },
      { label: 'Observed', value: 'B9999 · 3 rows', detail: '实际观察到什么' },
    ],
    question: '红灯以后，什么证据能让别人复核你的判断？',
  },
  subtitle: '把质量结论还原成可以检查的 Quality Event。',
  quickSummary: 'Quality Event 描述发现了什么异常以及证据是什么；它不提前回答根因和下游影响。',
  concept: {
    term: 'Quality Event / 质量事件',
    definition:
      '质量事件记录一次规则检查的事实：目标范围、期望、观察值、失败行或聚合证据，以及对应的 Scheduler 上下文。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先问这条失败能不能被别人复核',
      paragraphs: [
        '引用完整性失败时，事件要让读者看到 rule、table、partition、business_date、field、expected、observed 和 failed_rows，并给出一条真实样本，例如 A10031 / B9999 / 230000。',
        '事件只说观察到的质量事实。哪个上游过滤了数据、哪个下游指标受影响，需要第 07 章沿表、字段和任务关系继续调查。',
      ],
      bullets: [
        '规则身份：branch_reference_check。',
        '目标范围：DWD 存款账户余额明细的 business_date 分区。',
        '证据内容：3 行无法关联 Branch，展示其中一条样本。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'QUALITY EVIDENCE PANEL · 事实与证据',
      title: '同一个失败，不一定都有坏行',
      description:
        '分别查看引用完整性、对账和 Freshness 事件。对账与日期失败会直接展示聚合或日期证据，不会为了填表伪造 sample。',
      visualization: dataQualityEvidenceVisualization,
    },
    {
      kind: 'narrative',
      title: '聚合失败也需要完整上下文',
      paragraphs: [
        'DWD / DWS 对账失败没有一条可以指责的“坏行”：同一口径下，DWD 是 10 亿，DWS 是 8 亿，observed delta 是 -2 亿。这组聚合证据已经足够说明结果不能直接使用。',
        'Freshness 也是同样的情况：expected_business_date 是 2026-09-30，actual_max_snapshot_date 是 2026-09-29。它是日期证据，不需要伪造一条坏记录。',
      ],
      bullets: [
        '有行级异常，带 sample。',
        '只有聚合差异，带 expected / observed。',
        '只有日期落后，带业务日期与实际最大快照日期。',
      ],
    },
    {
      kind: 'takeaway',
      title: 'Quality Event 在这里停住',
      text: '第 06 章输出“发现了什么、观察到什么、证据在哪里”。第 07 章才根据 target、task 和表映射推导可能来源与影响路径。',
      bullets: [
        '保留 Scheduler run、task status 和 partition。',
        '不把 root cause 写进质量事实。',
        '不把 upstreamHints 或 downstreamImpacts 塞进事件。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要只显示红灯或质量总分',
      text: '一个分数不能告诉读者哪条规则失败、期待什么、观察到什么。可调查证据比“87 分”更重要。',
    },
  ],
}
