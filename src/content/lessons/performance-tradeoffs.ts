import type { LessonContent } from '../types'
import { performanceVisualizations } from '../../features/performance/banking'

export const performanceTradeoffsContent: LessonContent = {
  eyebrow: '第 11 章 · 11-5 优化副作用与工程取舍',
  opening: {
    eyebrow: 'Runtime 降低以后，复盘才刚开始',
    title: '跑快了，就算优化成功了吗？',
    intro:
      '把反欺诈 T+1 特征任务从 68 min 降到 18 min 是一个值得继续调查的变化。现在要把正确性、SLA、Freshness、Scan / Compute Cost、Storage、Backfill、Rerun 和维护复杂度写进同一份工程判断。',
    cards: [
      { label: 'Before → After', value: '68 → 18 min', detail: 'relative simulation / 教学模拟值' },
      { label: '必须检查', value: '正确性 + SLA', detail: '结果可用且按时到达' },
      { label: '容易遗漏', value: '状态代价', detail: '迟到修正、回补、重建和维护' },
    ],
    question: '一个方案让任务更快，却让状态和维护复杂很多，应该直接上线吗？',
  },
  subtitle: '用 Before / After、迟到数据和“不值得优化”的反例，完成一次性能工程复盘。',
  quickSummary:
    '优化验收顺序是结果正确、满足 SLA / Freshness、资源和成本合理、复杂度可维护；增量状态提高性能，也会增加修正与重建责任。',
  concept: {
    term: '工程取舍：把收益和代价放在一起',
    definition:
      '性能优化不是只降低 Runtime。要同时检查业务结果、交付时效、资源成本、Storage、回补重跑和长期维护，判断收益是否值得承担新增复杂度。',
  },
  sections: [
    {
      kind: 'narrative',
      title: 'Before / After 需要比运行时间多写几行',
      paragraphs: [
        '状态方案不再每天扫描完整历史，因此相对模拟运行时间从 68 min 变成 18 min。它同时保存 customer_counterparty_first_seen、daily_customer_counterparty_relation 和固定最近 30 天结果，Scan / Compute Cost 下降，但 Storage 和维护责任上升。',
        '工程复盘至少要把正确性、SLA、Freshness、Scan / Compute Cost、Storage、Backfill、Rerun、状态重建和维护复杂度逐项写出。只有 Runtime 的对照表，还不能证明反欺诈特征真的变好了。',
      ],
      bullets: [
        '运行时间是结果之一，不是唯一验收项。',
        '固定窗口和增量状态要有清楚的刷新、回补和重建路径。',
        '本节数字仍是确定性的 relative simulation / 教学模拟值。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '11-5 · 工程验收与取舍',
      title: '逐项检查收益，处理迟到数据，再判断是否值得',
      description:
        '先对照 Before / After，按顺序勾选验收项；再处理 2026-09-16 到达、但 business_date 属于 2026-09-10 的迟到交易。最后比较值得优化与不值得优化的两种情况。',
      visualization: performanceVisualizations.tradeoffs,
    },
    {
      kind: 'narrative',
      title: '迟到数据会把状态的代价暴露出来',
      paragraphs: [
        '2026-09-16 收到一笔 business_date = 2026-09-10 的交易。如果它让 A001 与 B004 的 first_seen_date 从 2026-09-12 提前到 2026-09-10，就不能只把这笔数据追加到今天的结果。要按业务日期修正状态，并回补受影响的客户日累计特征和固定 30 天结果。',
        '这意味着增量状态需要可追踪的修正证据、幂等的 Rerun、明确的 Backfill 范围，以及在状态损坏或规则变化时可以重建并对账的路径。性能收益没有消除工程工作，只是改变了工作的位置。',
      ],
      bullets: [
        'arrived_at = 2026-09-16，不等于 business_date = 2026-09-10。',
        'first_seen_date 受影响时，历史特征和固定窗口结果也要评估。',
        '回补、重跑和状态重建都是方案的一部分。',
      ],
    },
    {
      kind: 'compare',
      title: '什么时候值得承担这份复杂度？',
      intro: '同一种“跑快了”，放在不同 SLA 和访问需求下，结论并不相同。',
      columns: [
        {
          label: '值得优化',
          title: '68 min，T+1 窗口逐渐不够',
          points: [
            '重复历史扫描已经成为实际约束',
            '固定特征访问频繁且收益明确',
            '状态修正、回补和对账责任有团队承接',
          ],
        },
        {
          label: '不值得优化',
          title: '8 min → 3 min，SLA = 4 小时',
          points: ['原任务远在 SLA 内完成', '新增大量状态和任务', '长期维护成本超过 5 分钟收益'],
        },
        {
          label: '判断依据',
          title: '业务约束优先',
          points: ['数据规模和访问需求', '预算与资源成本', '团队能否维护回补和重建'],
        },
      ],
    },
    {
      kind: 'takeaway',
      title: '性能复盘的最后一行不是最快数字',
      text: '固定判断顺序：结果正确 → 满足 SLA / Freshness → 资源和成本合理 → 复杂度可维护。四项都能被证据支持，才有理由保留这次优化；否则应缩小方案或放弃优化。',
      bullets: [
        '正确性先于 Runtime。',
        'SLA / Freshness 先于资源和成本比较。',
        '状态、Storage、Backfill、Rerun 和维护复杂度要留下责任人和路径。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把预计算当成免费缓存',
      text: '预计算和增量状态会减少重复计算，但会增加写入、存储、回补和重建边界。它们适合固定且高价值的问题，不应为了把已经满足 SLA 的任务再压缩几分钟而盲目引入。',
    },
    {
      kind: 'narrative',
      title: '章节末思考：灵活性换到了哪里？',
      paragraphs: [
        '如果未来需要查询任意日期区间内的去重交易对手数，现有累计状态和固定 30 天预计算还能直接满足吗？先想 daily distinct 能直接 SUM 吗，first_seen 能回答任意区间吗，以及为了保留灵活性应该保留什么 Grain。',
        '这道题只要求意识到预计算的边界，不要求实现任意时间窗口的 DISTINCT 算法。',
      ],
    },
  ],
}
