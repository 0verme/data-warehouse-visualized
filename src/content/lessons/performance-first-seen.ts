import type { LessonContent } from '../types'
import { performanceVisualizations } from '../../features/performance/banking'

export const performanceFirstSeenContent: LessonContent = {
  eyebrow: '第 11 章 · 11-4 业务状态与预计算',
  opening: {
    eyebrow: '“是不是第一次交易”每天都在重复读历史',
    title: '为什么“是不是第一次交易”每天都要重新翻历史流水？',
    intro:
      '反欺诈 T+1 任务真正要判断的是 customer_id + counterparty_id 过去是否出现过。把每一笔 Transaction 重新翻一遍历史，只是实现方式，不是业务问题本身。',
    cards: [
      { label: '当前关系', value: 'A001 → B003', detail: '2026-09-16 当天出现' },
      { label: '需要保存', value: 'first_seen', detail: '客户与交易对手的首次业务日期' },
      { label: '状态 Grain', value: '客户 × 对手', detail: 'customer_id × counterparty_id' },
    ],
    question: '如果只需回答“历史上是否出现过”，为什么每天重建完整历史集合？',
  },
  subtitle: '从重复历史扫描转向有业务含义的 first_seen 增量状态，并保持不同输出的 Grain 清楚。',
  quickSummary:
    '先把 Transaction 收束为当日 customer-counterparty 关系，再用 customer_counterparty_first_seen 判断首次出现；历史累计和最近 30 天结果分别按客户日输出。',
  concept: {
    term: '业务状态：重新理解要计算的东西',
    definition:
      '当业务问题只是判断一组关系是否曾经出现，可以维护这组关系的 first_seen 状态。它是计算方案和业务语义的重新设计，不只是给原 SQL 加一个技巧。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '从全量历史动作还原真正的问题',
      paragraphs: [
        '旧方案每天扫描完整历史 Transaction，重建每个客户所有历史交易对手，再判断今天的关系是不是第一次。分区和 Shuffle 调整可能减少读取或长尾，却没有改变“重复计算已经知道的关系”这一事实。',
        '今天的 A001 → B003 不在已有状态中，因此写入 first_seen_date = 2026-09-16；A001 → B001 已经存在，直接标记为非首次。判断依赖 customer_id + counterparty_id，counterparty_id 仍然只是本章的分析标识 / 特征键。',
      ],
      bullets: [
        'Transaction fact：一行代表一笔交易事件。',
        '当日关系：business_date × customer_id × counterparty_id。',
        'first_seen：customer_id × counterparty_id，保存首次出现日期。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '11-4 · 全量历史 → 增量状态',
      title: '把今天的关系写入有业务含义的状态',
      description:
        '先看当日关系如何从 Transaction 去重，再选择 A001 → B003 或已有关系，观察 first_seen 的写入和非首次判断。最后对照客户日累计与固定最近 30 天结果。',
      visualization: performanceVisualizations.firstSeen,
    },
    {
      kind: 'narrative',
      title: '一份状态不能替代所有查询问题',
      paragraphs: [
        'customer_counterparty_first_seen 可以支持截至某个业务日的历史累计交易对手数；daily_customer_counterparty_relation 保留每天发生过的关系；最近 30 天交易对手数则可以做成固定窗口的客户日预计算。三者都服务同一个反欺诈场景，但行含义和更新方式不同。',
        '7 天、90 天可以采用同类固定窗口的思路。任意起止日期的 DISTINCT 不在本节实现，因为那会引入另一组查询灵活性与存储取舍。',
      ],
      bullets: [
        '历史累计特征：customer_id × business_date。',
        '最近 30 天特征：customer_id × business_date，窗口固定。',
        '不要把关系、first_seen 和客户日聚合混成一张语义模糊的表。',
      ],
    },
    {
      kind: 'takeaway',
      title: '性能收益来自重新设计计算方案',
      text: '业务需要的是“这组客户与交易对手关系是否曾经出现”，而不是每天重新翻完整流水。增量状态和固定窗口预计算减少了重复工作，同时要求团队维护状态修正、回补和重建边界。',
      bullets: [
        '当天不存在：首次出现并写入 first_seen。',
        '当天已存在：非首次，不重建完整历史集合。',
        '预计算让固定问题读取更快，也会牺牲一部分查询灵活性。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把状态表当作交易明细表',
      text: 'first_seen 一行代表一个 customer_id × counterparty_id 关系，不代表一笔 Transaction，也不直接替代当日关系或客户日特征。使用前先确认 Grain 和业务日期。',
    },
  ],
}
