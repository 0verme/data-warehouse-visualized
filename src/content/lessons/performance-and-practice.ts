import type { LessonContent } from '../types'
import { performanceVisualizations } from '../../features/performance/banking'

export const performanceAndPracticeContent: LessonContent = {
  eyebrow: '第 11 章 · 11-1 性能诊断',
  opening: {
    eyebrow: 'T+1 反欺诈特征任务开始变慢',
    title: '任务变慢了，我们先看哪里？',
    intro:
      '这条离线 T+1 任务每天读取 Transaction（账户交易），加工客户与交易对手特征。一次运行的教学模拟记录已经从几分钟变成 68 min；现在要做的第一件事，是找到时间到底花在哪里。',
    cards: [
      { label: '主案例', value: 'Transaction', detail: '账户交易事实，一行一笔交易事件' },
      { label: '业务问题', value: '客户交易对手特征', detail: '历史累计、首次出现、最近 30 天' },
      { label: '本次记录', value: '68 min', detail: 'relative simulation / 教学模拟值' },
    ],
    question: '如果只知道任务变慢了，下一步应该先加资源，还是先找出最慢的阶段？',
  },
  subtitle: '把一次 T+1 运行拆成阶段，用证据定位瓶颈，再验证一个可以被复测的假设。',
  quickSummary:
    '先记录症状，再拆 Scan、Join、Shuffle、Aggregate、Write；对照阶段耗时、总运行时间和最长 Task，不凭平均值或直觉选择优化方案。',
  concept: {
    term: '性能诊断：先定位，再改变计算',
    definition:
      '性能诊断是一个可复核的过程：从症状出发拆执行阶段，收集证据，提出假设，实施小范围修改，重新测量，并检查副作用。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '同一条任务，先把症状写具体',
      paragraphs: [
        '这次加工的业务日期是 2026-09-16。Transaction 以 txn_date 作为业务日期字段；counterparty_id 只在本章作为分析标识和特征键，不新增一个交易对手业务实体。',
        '一次运行的阶段记录是 Scan 41 min、Join 6 min、Shuffle 15 min、Aggregate 5 min、Write 1 min。它们加起来是 68 min 的教学模拟值，但分布式任务还要另外观察最长 Task，不能只拿总时间或平均时间做结论。',
      ],
      bullets: [
        '症状：T+1 结果变慢，业务窗口开始有风险。',
        '阶段：先分开看 Scan、Join、Shuffle、Aggregate 和 Write。',
        '证据：Query Plan、Stage、Task、Scan Bytes、Shuffle Bytes 是真实系统中常见的观测入口；本节不教授某个引擎的执行计划语法。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '11-1 · Stage / Task 诊断',
      title: '先选出主要耗时阶段，再记录假设',
      description:
        '点击阶段查看对应证据。选对首要阶段后，执行一次只改变 Scan 假设的验证性测量；如果选的是候选阶段，也要保留“证据还不够”的判断。',
      visualization: performanceVisualizations.diagnosis,
    },
    {
      kind: 'narrative',
      title: '三层优化模型要跟着证据走',
      paragraphs: [
        '存储与执行层先回答“哪些数据被读了、文件怎样被读、哪个 Task 拖住了整体”。本节看到 Scan 41 min，因此优先调查分区命中、文件数量和 Task 证据。',
        '如果读取范围已经合理，再看计算方案层：是否提前过滤、提前聚合，是否让 Join 或 Shuffle 传输了不必要的数据。最后才回到业务语义层，问“是不是每天都需要重新计算完整历史”。三层可能相互影响，但不能用一个模糊的“调优”代替定位。',
      ],
      bullets: [
        '阶段耗时说明哪里慢，证据说明为什么可能慢。',
        '验证性修改要尽量一次只检验一个假设。',
        '重新测量以后，还要记录写入、Freshness、回补和维护方面的副作用。',
      ],
    },
    {
      kind: 'takeaway',
      title: '第一步不是选择优化按钮',
      text: '看到任务变慢，先把端到端运行拆开。Scan、Join、Shuffle、Aggregate、Write、总运行时间和最长 Task 各自回答不同问题；证据足够以后，才知道下一步该改变哪一层。',
      bullets: [
        '当前教学记录的主要耗时阶段是 Scan。',
        'Shuffle 15 min 也值得调查，但不能跳过 Worker / Task 分布。',
        '所有时间和资源数字都是 relative simulation / 教学模拟值。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要看到慢就默认加资源',
      text: '加资源、调并发或修改某个引擎参数有时能改变表现，但它们不能替代“慢在哪里、为什么慢”的证据。先留下诊断记录，才能判断修改是否真的解决了问题。',
    },
  ],
}
