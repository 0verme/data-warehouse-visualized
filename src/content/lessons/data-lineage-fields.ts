import type { LessonContent } from '../types'
import { createLineageVisualization, fieldTeaching } from './data-lineage-shared'

export const dataLineageFieldsContent: LessonContent = {
  eyebrow: '第 07 章 · 7-2 字段级血缘',
  subtitle: '沿一条字段路径下钻，分清字段值、重命名、过滤和 JOIN 各自怎样改变结果。',
  quickSummary:
    '字段级血缘解释一个字段怎样进入另一个字段。它需要同时记录字段路径、转换操作和可以核对的关系证据。',
  concept: {
    term: '字段级血缘',
    definition:
      '描述源字段如何通过 SUM、重命名、FILTER 或 JOIN 等转换进入目标字段，帮助定位表级链路中具体发生了什么。',
  },
  sections: [
    {
      kind: 'visualization',
      eyebrow: '7-2 · 字段级血缘',
      title: '只知道上游表，为什么还不够？',
      description:
        '沿 dwd_account_balance_detail → dws_deposit_balance_daily 下钻。余额值、字段重命名、产品过滤和机构 JOIN 都可能影响结果，但它们在链路中的作用不同；选择一个关系，沿字段路径查看证据。',
      visualization: createLineageVisualization(fieldTeaching),
    },
  ],
  code: {
    label: '一个需要字段血缘的问题',
    language: 'sql',
    code: `-- 修改余额字段前，先确认直接下游和最终指标消费者
SELECT source_field, target_field, operation, evidence_source, verification_status
FROM lineage_field_dependencies
WHERE source_field = 'dwd_account_balance_detail.balance';`,
  },
}
