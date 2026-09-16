import type { LessonContent } from '../types'
import { performanceVisualizations } from '../../features/performance/banking'

export const performanceScanLayoutContent: LessonContent = {
  eyebrow: '第 11 章 · 11-2 扫描、分区与文件布局',
  opening: {
    eyebrow: '最近 30 天的特征查询仍然读得很重',
    title: '明明过滤了，为什么还是读了这么多数据？',
    intro:
      'Transaction 已经按 txn_date 分区，需求也只要固定最近 30 天。页面先把 3 年历史和 30 天分区放在一起，再把分区内的大量小文件单独拿出来比较。',
    cards: [
      { label: '历史输入', value: '3 年', detail: '按 txn_date 保存的教学范围' },
      { label: '目标窗口', value: '最近 30 天', detail: '固定窗口特征' },
      { label: '常见误区', value: '少读 ≠ 高效', detail: '分区和文件布局是两个问题' },
    ],
    question: '过滤条件写在查询里以后，怎样确认它真的减少了读取范围？',
  },
  subtitle: '从 Partition Pruning 到小文件和日期分区倾斜，分开判断“读哪些”和“怎样读”。',
  quickSummary:
    '先确认最近 30 天查询只命中最近 30 天分区，再单独检查分区内文件数量与布局；双 11 分区变大也不等于 txn_date 选错。',
  concept: {
    term: 'Partition Pruning：只读取需要的分区',
    definition:
      'Partition Pruning 利用过滤条件排除不需要的分区，减少 Scan 范围；它不会自动把命中分区里的碎片文件整理好，也不会消除真实业务高峰造成的大分区。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先确认过滤条件有没有在分区层生效',
      paragraphs: [
        '最近 30 天交易对手数是一个固定窗口需求。理想的读取范围是：3 年历史中只命中最近 30 天的 txn_date 分区。判断时要同时看命中分区数、Scan Bytes、文件数和相对耗时，而不是只看 SQL 文本里有没有日期条件。',
        '本节所有 Scan Bytes、文件数和耗时都是 relative simulation / 教学模拟值。它们用来比较同一任务的两种读取范围，不是任何真实银行集群的 benchmark。',
      ],
      bullets: [
        '3 年历史 → 最近 30 天分区，是读取范围的变化。',
        'Scan Bytes 下降，才说明实际读取量确实缩小。',
        '7 天、90 天可以采用同类固定窗口；本节不分别做完整 Demo。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '11-2 · Partition Pruning 实验',
      title: '切换扫描范围，再打开文件布局',
      description:
        '先比较 3 年历史与最近 30 天的命中分区，再保持范围不变，观察碎片小文件与 Compaction 后布局的差异。最后切换到双 11，判断日期分区倾斜发生在哪一层。',
      visualization: performanceVisualizations.scanLayout,
    },
    {
      kind: 'compare',
      title: '两个动作解决的不是同一个问题',
      intro: '它们都可能让后续读取变快，但收益和写入代价要分别记录。',
      columns: [
        {
          label: 'Partition Pruning',
          title: '缩小读取范围',
          points: [
            '排除不需要的 txn_date 分区',
            '减少 Scan Bytes 和命中分区数',
            '依赖过滤条件与分区字段语义正确',
          ],
        },
        {
          label: 'Compaction',
          title: '整理命中分区内的文件',
          points: [
            '减少碎片小文件的打开与调度',
            '改善同一范围的物理读取组织',
            '新增写入、存储和维护工作',
          ],
        },
        {
          label: '日期分区倾斜',
          title: '先接受业务分布事实',
          points: [
            '普通日期 100~150 GB',
            '双 11 可能达到 1.8 TB',
            '继续考虑大分区的并行与拆分方式',
          ],
        },
      ],
    },
    {
      kind: 'takeaway',
      title: '分区字段合理，不代表每个分区一样大',
      text: 'Partition Pruning 解决“需要读取哪些数据”，文件布局解决“这些数据怎样被读出来”。txn_date 仍然可以是合理分区字段；双 11 的大分区要结合业务分布、文件布局、并行度和任务拆分判断。',
      bullets: [
        '先用 Scan Bytes 和命中分区数证明裁剪是否生效。',
        '再看文件数和 Compaction 的写入代价。',
        '不要把日期分区倾斜误判为 Shuffle Key 倾斜。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要只看到“过滤”两个字',
      text: '逻辑上有日期条件，不等于物理读取一定只命中目标分区；即使命中分区已经减少，碎片小文件和某个超大分区仍然可能拖慢读取。',
    },
  ],
}
