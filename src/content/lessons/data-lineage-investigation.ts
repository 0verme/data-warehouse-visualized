import type { LessonContent } from '../types'
import { createLineageVisualization, investigationTeaching } from './data-lineage-shared'
import { depositBalanceQualityEvent } from './data-quality'

export const dataLineageInvestigationContent: LessonContent = {
  eyebrow: '第 08 章 · 8-3 质量事件调查',
  subtitle: '收到 Quality Event 后，先沿直接上游检查，再决定是否扩大调查范围。',
  quickSummary:
    'Quality Event 固定异常事实；血缘调查按近到远检查可能来源，不把候选根因当作已证实结论。',
  concept: {
    term: '近到远调查',
    definition:
      '从质量事件命中的当前对象开始，先检查直接上游的转换，再根据检查结果向更远的来源展开。',
  },
  sections: [
    {
      kind: 'visualization',
      eyebrow: '8-3 · 质量事件调查',
      title: '质量告警以后，哪些上游值得先查？',
      description: `第 07 章留下的质量事件在 ${depositBalanceQualityEvent.target.table}.${depositBalanceQualityEvent.target.field} 上发现 delta = ${depositBalanceQualityEvent.observedValue}，因此 Release BLOCKED。先检查 DWD 这个直接上游：如果 DWD 正常，停在当前转换；如果 DWD 已异常，再向 AccountBalanceSnapshot、Account、Branch、Product 展开。`,
      visualization: createLineageVisualization(investigationTeaching),
    },
  ],
  engineeringTip:
    '生产排错时，先把 Quality Event 的业务日期、目标分区、任务运行实例和发布决定固定下来，再沿近到远的血缘路径安排检查。',
  pitfalls: [
    'Root-cause candidate 只是基于血缘关系的复核优先级，仍需要数据 Diff、执行参数、SQL 版本、任务日志或业务变更记录证明。',
  ],
}
