import type { LessonContent } from '../types'
import { performanceVisualizations } from '../../features/performance/banking'

export const performanceShuffleSkewContent: LessonContent = {
  eyebrow: '第 11 章 · 11-3 Shuffle Key 倾斜',
  opening: {
    eyebrow: '平均 Task 看起来没有异常，最后一个却一直不结束',
    title: '为什么其他 Task 都结束了，只剩一个迟迟跑不完？',
    intro:
      '用一个简单的银行辅助案例观察长尾：普通支行有 5 万～20 万账户，线上开户中心可能有数百万账户。按 open_branch_id 分组后，工作量不会平均落到每个 Worker。',
    cards: [
      { label: '普通支行', value: '5 万～20 万', detail: '账户数量的教学范围' },
      { label: '线上开户中心', value: '数百万', detail: '可能形成热点 Key' },
      { label: '最长 Worker', value: '680 GB', detail: 'relative simulation / 教学模拟值' },
    ],
    question: '看到一个 Worker 远高于其他 Worker 时，先问它属于哪一种倾斜？',
  },
  subtitle: '用 Worker 负载和最长 Task 识别 Shuffle Key 倾斜，区分它与日期分区倾斜。',
  quickSummary:
    '按 open_branch_id 的 GROUP BY、Join 或等价 Shuffle 会受到热点 Key 影响；整体结束时间经常由最慢 Task 决定，不是由平均 Task 决定。',
  concept: {
    term: 'Shuffle Key 倾斜：分发键把工作集中起来',
    definition:
      '分布式处理按 Key 重新分发数据时，少数热点 Key 可能把大量记录送到同一个 Worker，形成长尾。处理它要先确认倾斜发生在 Join / Group By / Shuffle，而不是存储分区。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '同一个“倾斜”，可能发生在不同位置',
      paragraphs: [
        '双 11 的 txn_date 分区达到 1.8 TB，属于存储、Scan 和 Partition 层的数据分布问题。开户机构案例里，数据已经进入计算阶段，按 open_branch_id GROUP BY 后才发现线上开户中心成为热点 Key，这是 Join、Group By 和 Shuffle 层的问题。',
        '这两个问题都可能表现成“任务变慢”，但收集的证据不一样：前者看分区大小和文件，后者看 Shuffle Bytes、Worker 负载、Key Distribution 和最长 Task。',
      ],
      bullets: [
        '日期分区倾斜 → 存储 / Scan / Partition。',
        'Shuffle Key 倾斜 → Join / Group By / Shuffle。',
        '本节负载数字是确定性的相对教学模拟值，不是生产集群承诺。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '11-3 · Worker / Task 长尾',
      title: '切换倾斜位置，再选择通用处理方向',
      description:
        '先对照双 11 大分区和开户机构热点，再在 Worker 图上尝试提前过滤、提前聚合、热点 Key 拆分、两阶段聚合或调整数据分布。',
      visualization: performanceVisualizations.shuffleSkew,
    },
    {
      kind: 'narrative',
      title: '处理策略要对应数据分布',
      paragraphs: [
        '提前过滤可以减少进入 Shuffle 的无关记录，提前聚合可以让局部结果先合并；热点 Key 拆分和两阶段聚合用于改善少数 Key 的集中，调整数据分布则是重新安排工作落点。它们是通用方向，不需要在本节进入 Salt Key 或某个厂商 Hint 语法。',
        '策略改变后仍要重新测量 Shuffle Bytes、最长 Task 和最终结果。Worker 柱子变得接近，只说明分布可能改善，不能代替正确性和业务口径检查。',
      ],
      bullets: [
        '先确认热点 Key 是事实，不把平均值当证据。',
        '每次修改尽量说明减少了哪一类工作，以及代价转移到了哪里。',
        '结果对账和长尾测量要一起保留。',
      ],
    },
    {
      kind: 'takeaway',
      title: '最后一个 Task 往往决定整体时间',
      text: '分布式任务不是每个 Worker 都差不多就算健康。看到一个 Worker 负载远高于其他 Worker，先定位倾斜发生在存储读取还是 Shuffle 分发，再选择通用处理方向。',
      bullets: [
        'Worker 4 的 680 GB 是长尾证据。',
        '平均负载只能帮助对照，不能预测最终完成时间。',
        '不要用日期分区的解决方案替代 Shuffle Key 的解决方案。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要一看到倾斜就套同一个技巧',
      text: '先看分区、文件和 Scan，还是看 Key、Shuffle 和最长 Task。位置不同，处理方向不同；具体引擎的语法也不应取代对数据分布的理解。',
    },
  ],
}
