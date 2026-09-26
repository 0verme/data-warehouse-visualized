import type { LessonContent } from '../types'
import { createLineageVisualization, overviewTeaching } from './data-lineage-shared'

const overviewVisualization = createLineageVisualization(overviewTeaching)
const viewDependencyVisualization = createLineageVisualization({
  mode: 'view-dependency',
  tableNodeIds: [],
})

export const dataLineageContent: LessonContent = {
  eyebrow: '第 07 章 · 7-1 表级血缘',
  subtitle: '沿统一的银行存款余额链路，先确认这份数据的直接来源、加工位置和消费去向。',
  quickSummary:
    '表级数据血缘描述数据对象之间的来源、加工和消费关系。View 可以折叠 SQL 读取细节；调度显式依赖和 SQL 实际读取回答不同问题，血缘关系本身也不等于业务根因证明。',
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
    {
      kind: 'visualization',
      eyebrow: '7-1 · View 与真实依赖',
      title: 'View 隐藏了哪些 SQL 上游？',
      description:
        '先观察调度配置明确等待的任务，再展开 V_CUSTOMER 的 SQL 来源。这个样例把两个观察范围并列展示，不把 View 当成调度任务，也不把简化路径当成完整 DAG。',
      visualization: viewDependencyVisualization,
    },
  ],
  pitfalls: [
    '直接上游和传递上游是相对当前对象而言的；换一个对象，调查范围也会改变。',
    'Task dependency 说明任务先后，data lineage 说明数据来源；两者不能互相替代。',
    '数据库 View 是正常能力；隐式依赖需要在排障、影响分析和调度治理时查清，不据此推导 View 一定低效、应禁止使用或所有 SQL 上游都必须成为调度依赖。',
  ],
}
