import type { LessonContent } from '../types'
import { createLineageVisualization, impactTeaching } from './data-lineage-shared'

export const dataLineageImpactContent: LessonContent = {
  eyebrow: '第 08 章 · 8-4 变更影响范围',
  subtitle: '沿直接下游逐层展开，判断一次变更会传到哪些结果和指标消费者。',
  quickSummary:
    '影响分析从变更对象开始，区分直接下游、传递影响和最终消费者，为变更评审确定检查范围。',
  concept: {
    term: '影响范围（Blast Radius）',
    definition:
      '描述一个数据对象发生变化后，哪些直接下游、传递下游和最终消费者可能受到影响的范围。',
  },
  sections: [
    {
      kind: 'visualization',
      eyebrow: '8-4 · 变更影响范围',
      title: '如果这里出问题，会影响哪些下游？',
      description:
        '先预测直接下游，再逐层展开 Blast Radius。dws_deposit_balance_daily 是第一轮验证对象，ads_deposit_balance 和存款余额指标是传递影响；最终数字的消费者也属于变更评审范围。',
      visualization: createLineageVisualization(impactTeaching),
    },
  ],
}
