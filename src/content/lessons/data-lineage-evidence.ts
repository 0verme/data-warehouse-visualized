import type { LessonContent } from '../types'
import { createLineageVisualization, evidenceTeaching } from './data-lineage-shared'

export const dataLineageEvidenceContent: LessonContent = {
  eyebrow: '第 08 章 · 8-5 证据与边界',
  subtitle: '对照 SQL、任务配置、指标定义和人工登记，判断一条血缘关系当前能否相信。',
  quickSummary:
    '血缘关系要带有证据来源和确认状态。pending 的关系可以帮助调查，但不能替代独立验证。',
  concept: {
    term: '血缘关系证据',
    definition:
      '证据来源说明关系依据来自哪里，确认状态说明当前是否已经核实；两者共同决定这条关系能否直接用于判断。',
  },
  sections: [
    {
      kind: 'visualization',
      eyebrow: '8-5 · 证据与边界',
      title: '图上的这条箭头，凭什么相信？',
      description:
        '回看 SQL、任务配置、指标定义和人工登记四类关系证据。来源回答“证据从哪里来”，确认状态回答“现在能不能相信”；pending 的关系可以帮助调查，但不能替代独立验证。',
      visualization: createLineageVisualization(evidenceTeaching),
    },
  ],
  pitfalls: [
    '关系的 evidence source 与 verification status 是两个字段；人工登记的关系必须保留待确认状态。',
  ],
}
