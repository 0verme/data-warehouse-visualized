import type { LessonContent } from '../types'
import { createBankingSchedulerVisualization } from '../../features/scheduler/banking'

export const schedulingSlaContent: LessonContent = {
  eyebrow: '第 05 章 · 迟到与业务交付',
  opening: {
    eyebrow: '所有任务都成功了，为什么经营分析还是没等到？',
    title: '任务都成功了，为什么数据还是可能迟到？',
    intro:
      '经营分析约定 07:30 使用 2026-09-30 的存款余额结果。把上游到达时间往后拖，观察延迟怎样经过 DWD、DWS 传到 ADS，以及最终是否错过业务可用时间。',
    cards: [
      { label: '业务约定', value: '07:30', detail: '结果必须可用的时间' },
      { label: '正常结果', value: '07:20', detail: 'ADS ready，SLA 满足' },
      { label: '迟到结果', value: '可能超时', detail: '所有任务 success 也会 SLA Miss' },
    ],
    question: '如果 2026-09-30 的余额结果 07:42 才可用，任务最终 success 能抵消这次延迟吗？',
  },
  subtitle: '拖动上游到达时间，追踪迟到如何传播到 ADS，并用业务可用时间判断 SLA。',
  quickSummary:
    'SLA（服务级别约定）首先描述业务消费者要求的数据可用时间；任务 success 只能说明执行完成，不能保证按约定时间交付。',
  concept: {
    term: 'SLA（服务级别约定）',
    definition:
      'SLA 是业务约定的数据可用时间。本例要求 2026-09-30 存款余额结果在 07:30 前可供经营分析使用；DWD、DWS 的完成时间只是解释延迟的证据。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '成功和按时是两件事',
      paragraphs: [
        '正常情况下，DAG 可以在 07:20 前完成 ADS，经营分析按约定使用结果。如果 AccountBalanceSnapshot 迟到，DWD 的开始时间会后移，DWS 和 ADS 只能依次等待，最终可能在 07:42 才可用。',
        '07:42 的每个任务都可能显示 success，因为程序最终完成了；但业务消费者在 07:30 等不到结果，SLA 仍然没有满足。',
      ],
      bullets: [
        '任务状态回答“这次执行有没有完成”。',
        'SLA 回答“业务约定的时间前，结果能不能使用”。',
        '上游到达、DWD / DWS 完成和 ADS ready 是同一条延迟证据链。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '交付时效实验 · 拖动上游到达时间',
      title: '看 ADS Ready 如何突破 07:30',
      description:
        '拖动 AccountBalanceSnapshot 的实际到达时间，再推进同一条 DAG 到完成。结果会保留 2026-09-30 业务日期，并显示最终 ADS ready 时间和 SLA 是否满足。',
      visualization: createBankingSchedulerVisualization('sla'),
    },
    {
      kind: 'narrative',
      title: 'SLA 从业务消费者开始定义',
      paragraphs: [
        '经营分析关心的是“07:30 能不能拿到 9 月 30 日存款余额”，所以 SLA 应写成结果可用约定，而不是只给某一个内部任务设置一个倒计时。DWD 和 DWS 的完成时间用于定位哪一段变慢。',
        '把到达时间拖到 07:30 之后，延迟会沿依赖链向下传递。即使最后没有任何代码报错，也要把 SLA Miss 记录为交付问题。',
      ],
      bullets: [
        '业务日期仍是 2026-09-30，不会随迟到时间改变。',
        '结果 ready 时间由整条必要链路共同决定。',
        'SLA 关注业务可用性，不在本章展开告警、值班或事故流程。',
      ],
    },
    {
      kind: 'takeaway',
      title: '本章最后留下一个问题',
      text: '现在我们已经能判断一条 DAG 何时运行、为什么等待、如何失败恢复、怎样按日期重跑，以及是否按时交付。但即使任务成功且 SLA 满足，数据就一定可信吗？',
      bullets: [
        'success 说明任务完成，不自动证明数据正确。',
        'SLA MET 说明按时可用，不自动证明结果可信。',
        '下一章从结果本身开始检查完整性、唯一性和业务一致性。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把 SLA 当成任务绿灯',
      text: 'SLA 是业务消费者和数据平台之间的可用时间约定；任务状态和节点耗时是证据。所有节点最终成功，也可能已经错过消费者需要的时间。',
    },
  ],
}
