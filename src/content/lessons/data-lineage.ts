import type { LessonContent } from '../types'
import { createLineageVisualization, overviewTeaching } from './data-lineage-shared'

const overviewVisualization = createLineageVisualization(overviewTeaching)

export const dataLineageContent: LessonContent = {
  eyebrow: '第 07 章 · 7-1 表级血缘',
  subtitle: '沿统一的银行存款余额链路，先确认这份数据的直接来源、加工位置和消费去向。',
  quickSummary:
    '表级数据血缘描述数据对象之间的来源、加工和消费关系。它能帮助安排调查顺序和变更影响范围，但血缘关系本身不等于业务根因证明。',
  concept: {
    term: '数据血缘',
    definition:
      '描述数据对象之间来源、加工和消费关系的依赖信息。表级关系帮助定位链路中的直接和传递关系。',
  },
  sections: [
    {
      kind: 'visualization',
      eyebrow: '7-1 · 表级血缘',
      title: '这份数据到底从哪里来？',
      description:
        '先读一条统一的银行存款余额链路：AccountBalanceSnapshot 等输入经过 dwd_account_balance_detail，汇总到 dws_deposit_balance_daily，再发布到 ads_deposit_balance，最后被存款余额指标消费。点击对象，比较直接上游、传递上游和下游影响。',
      visualization: overviewVisualization,
    },
  ],
  pitfalls: [
    '直接上游和传递上游是相对当前对象而言的；换一个对象，调查范围也会改变。',
    'Task dependency 说明任务先后，data lineage 说明数据来源；两者不能互相替代。',
  ],
}

export { qualityLineageInvestigation } from './data-lineage-shared'
