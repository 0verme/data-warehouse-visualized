import type { LessonContent } from '../types'

export const performanceAndPracticeContent: LessonContent = {
  eyebrow: '第 11 章 · 性能与工程实践',
  opening: {
    eyebrow: '同一份销售任务，规模开始增长',
    title: '为什么昨天能跑完，今天却超时？',
    intro:
      '销售日报仍然是同一个任务：扫描订单，JOIN 用户，shuffle，聚合，再写入结果。变化的是数据规模、布局和分布。下面把这些变量逐个打开，观察哪一个阶段先成为瓶颈。',
    cards: [
      { label: '任务', value: 'sales_daily', detail: 'scan → join → shuffle → aggregate → write' },
      { label: '核心实验', value: 'Pruning + Skew', detail: '一个减少无效扫描，一个暴露长尾' },
      { label: '口径', value: '相对估算', detail: '用于比较同一任务在不同条件下的方向' },
    ],
    question: '如果延迟下降了，但写入、存储或 freshness 变差，这还算优化吗？',
  },
  subtitle: '日报超时后，沿扫描、Shuffle、长尾和写入阶段查瓶颈，再比较优化方案的代价。',
  quickSummary:
    '围绕同一销售任务改变 data volume、partition、selectivity、hot key ratio 和 file fragmentation，再用 before/after 对比扫描、shuffle、长尾、相对延迟、成本和 freshness。',
  concept: {
    term: '性能：让数据少走不必要的路',
    definition:
      '可观测的性能分析要把端到端任务拆成 scan、join、shuffle、aggregate、write，并区分减少工作量、改善分布、增加复用与转移成本。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '一条会超时的数据流长什么样？',
      paragraphs: [
        '任务没有变，数据却从 1M 行涨到 100M 行。没有分区裁剪时，过滤条件只在扫描之后才生效；JOIN 把数据送到不同 worker，hot key 又让一个 worker 比其他 worker 多等很久。最后，写入许多碎文件会把下一次任务的扫描成本继续推高。',
        '“加机器”或“换引擎”都可能只是把问题往后推。实验室把 scan、shuffle、长尾和 write 拆开，帮助确认哪个阶段耗时最长。',
      ],
      bullets: [
        'Partition Pruning：过滤条件命中少量分区时，扫描行数和 blocks 应该下降。',
        'Data Skew：hot key ratio 上升时，平均 worker 可能没变，但 longest worker 会拖慢 stage。',
        '相对估算用于比较趋势，生产结论仍要结合 query plan、资源和实际观测。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '性能对比实验室 · 可控变量',
      title: '动手改变规模、布局和策略',
      description:
        '把 data volume 和 file fragmentation 调大，观察基线；再开启 Partition Pruning、布局调整、两阶段聚合、增量处理或物化复用，比较收益和代价。',
      visualization: {
        kind: 'performance-lab',
        architecture: {
          architecture: 'lakehouse',
          workload: 'bi',
          dataVolumeCategory: 'large',
        },
        defaults: {
          dataVolume: 10,
          partitionCount: 100,
          partitionFilterSelectivity: 0.1,
          hotKeyRatio: 0.02,
          fileFragmentation: 0.25,
          workerCount: 8,
        },
      },
    },
    {
      kind: 'narrative',
      title: '读懂 before / after，而不是只看一个快了多少',
      paragraphs: [
        'Partition Pruning 的关键证据是 partitions touched、scanned rows 和 scanned blocks 同时下降；Data Skew 的关键证据是 longest worker / stage，而不是只看所有 worker 的平均值。Shuffle volume 则告诉你 JOIN 与聚合是否把网络传输变成了新的瓶颈。',
        '实验中的 relative runtime 和 relative cost 是固定公式产生的相对估计。它们帮助比较同一组输入下的方向；真实系统仍需结合 query plan、集群资源、文件统计和生产观测验证。',
      ],
    },
    {
      kind: 'takeaway',
      title: '优化是工程取舍，不是免费按钮',
      text: '一个方案只有在业务目标、资源预算和 freshness 约束下仍然合适，才值得上线。把降低延迟的收益和写入成本、存储、复杂度、数据新鲜度一起记录。',
      bullets: [
        '布局调整与 compaction 可能减少读取，却增加写入和存储成本。',
        '物化结果可以让查询更快，却需要额外刷新链路，并可能带来 freshness impact。',
        '增量处理减少每次扫描，但要处理水位、迟到数据和可重跑边界。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '性能调优永远是读与写、存储与时效之间的取舍',
      text: '同一种优化可能减少读取，却增加写入、存储或刷新延迟。评估性能时同时记录扫描量、shuffle、尾延迟、成本和 freshness，避免只看单次 runtime。',
    },
    {
      kind: 'pitfall',
      title: '不要把平均值当成尾延迟',
      text: '当 hot key 集中在少数 worker 时，平均吞吐可能看起来正常，最长 worker 却决定任务何时结束。也不要把“没有命中分区”误解成“扫描全表”：实验会明确显示零命中。',
    },
  ],
}
