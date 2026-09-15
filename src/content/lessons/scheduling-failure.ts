import type { LessonContent } from '../types'
import { createBankingSchedulerVisualization } from '../../features/scheduler/banking'

export const schedulingFailureContent: LessonContent = {
  eyebrow: '第 06 章 · 失败传播与重试',
  opening: {
    eyebrow: 'DWD 失败以后，DWS 为什么没有开始？',
    title: '一个任务失败，后面的任务会怎样？',
    intro:
      '同一条存款余额 DAG 中，DWD 第一次执行遇到临时数据库连接失败。看清 DWD、DWS、ADS 的状态变化，再用下一次 Attempt 让链路继续。',
    cards: [
      { label: 'Attempt 1', value: 'DWD FAILED', detail: '临时数据库连接失败' },
      { label: '下游', value: '等待上游', detail: 'DWS / ADS 不能凭空继续' },
      { label: 'Attempt 2', value: 'SUCCESS', detail: 'DWD 成功后才放行 DWS' },
    ],
    question: 'DWD 失败时，DWS 应该继续算、等待，还是报告成功？',
  },
  subtitle: '注入一次 DWD 故障，观察失败如何影响下游，再执行 Retry 恢复同一条链。',
  quickSummary:
    '失败会沿任务依赖影响后续节点；Retry 是同一任务实例增加一次 Attempt，不是把等待中的下游误标为失败。',
  concept: {
    term: '失败传播（Failure Propagation）',
    definition:
      '当上游任务没有产出可用结果时，依赖它的下游任务不能继续使用这次运行的数据。下游应保持等待或被阻断，直到上游 Retry 或人工恢复成功。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '一次临时失败会留下什么证据？',
      paragraphs: [
        'DWD Attempt 1 在 02:02 开始，经过一次处理后因临时数据库连接失败结束。此时 DWD 进入 Retry；DWS 没有拿到成功的明细结果，所以保持等待，ADS 也不能发布。',
        '如果重试耗尽，DWD 才会进入失败终态，DWS 和 ADS 会被阻断。状态的变化要沿依赖关系解释，不能只看某个节点的颜色。',
      ],
      bullets: [
        '运行中：任务已经开始执行。',
        '成功：这次任务产出可供下游使用的结果。',
        '失败：这次任务没有完成，需要 Retry 或人工处理。',
        '等待：任务尚未具备继续运行的条件，不等于执行失败。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '故障注入实验 · 状态沿依赖传播',
      title: '让 DWD 失败一次，再观察下游如何恢复',
      description:
        '选择“失败后自动重试”或“重试耗尽”，逐步推进同一业务日期的运行。重点观察 DWS / ADS 为什么等待，以及 Attempt 2 何时获得运行资格。',
      visualization: createBankingSchedulerVisualization('failure'),
    },
    {
      kind: 'narrative',
      title: 'Retry 是一次新的尝试，不是新的业务日期',
      paragraphs: [
        'Retry 仍然处理 `snapshot_date = 2026-09-30`，只是为 DWD 增加 Attempt 2。输入、业务日期和目标分区没有因为失败而换掉；成功后，DWS 才能沿原来的 DAG 继续。',
        '当失败确实不可自动恢复时，可以暂停下游并留下失败记录。人工检查后再恢复任务，恢复动作也必须保留在运行证据里。',
      ],
      bullets: [
        'DWD Retry 时，DWS / ADS 等待上游结果。',
        'DWD 最终失败时，下游被阻断，不应误报 success。',
        'Recovery 后增加新的 Attempt，成功才重新放行依赖。',
      ],
    },
    {
      kind: 'takeaway',
      title: '看失败时，沿着三条线排查',
      text: '先看任务状态，再看 Attempt 和失败原因，最后看依赖它的下游。这样才能判断是一次可恢复的临时故障，还是需要人工处理的链路阻断。',
      bullets: [
        '失败发生在哪个任务、哪个业务日期？',
        '当前是第几次 Attempt，是否还有 Retry 机会？',
        '哪些下游正在等待，哪些结果仍然不可用？',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把下游等待写成下游失败',
      text: 'DWS 没有开始执行，不代表 DWS 自己报错；它是在等待 DWD 提供成功结果。只有真正开始并执行失败，才有属于它自己的失败记录。',
    },
  ],
}
