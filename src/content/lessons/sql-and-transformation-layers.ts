import type { LessonContent } from '../types'
import { depositBalanceDataset, depositBalanceTaskContract } from '../../data/deposit-balance'
import type { SqlTransformationVisualization } from '../../features/sql-transformation/types'

const visualization: SqlTransformationVisualization = {
  kind: 'sql-transformation',
  focus: 'layers',
  targetDate: depositBalanceDataset.targetDate,
  dataset: depositBalanceDataset,
  taskContract: depositBalanceTaskContract,
}

export const sqlTransformationLayersContent: LessonContent = {
  eyebrow: '第 04 章 · DWD 到 ADS',
  opening: {
    eyebrow: '从 4 行账户明细到 1 行指标，消失的行去哪了？',
    title: '从 DWD 到 DWS / ADS，一行发生了什么变化？',
    intro:
      '同一批余额经过标准化、主题聚合和指标筛选后，行数会变化。每次变化都要重新说清楚：现在的一行代表哪一组业务事实。',
    cards: [
      { label: 'DWD', value: '4 行', detail: '一个账户 × 一个快照日' },
      { label: 'DWS', value: '3 行', detail: '一组业务维度 × 一个快照日' },
      { label: 'ADS', value: '1 行', detail: '一张指标卡 × 一个快照日' },
    ],
    question: '聚合不是把数字简单相加；它同时把明细的行含义改成了业务分组。',
  },
  subtitle: '沿着 DWD → DWS → ADS 的快照切换，观察账户明细如何收敛为存款余额指标。',
  quickSummary:
    'DWD 保留账户日明细，DWS 按机构、客户口径、产品和币种聚合，ADS 再筛出杭州分行小微定期 CNY 的一行结果。',
  concept: {
    term: '聚合后的数据粒度',
    definition:
      'GROUP BY 保留的字段共同决定输出的一行代表什么。DWS 的一行不再代表某个账户，而代表一个快照日和一组指标维度。',
  },
  sections: [
    {
      kind: 'narrative',
      title: 'DWD 还保留哪些事实？',
      paragraphs: [
        'DWD 的 4 行分别对应 A001、A002、A003、A004 在 2026-09-30 的账户余额。即使 A003 缺少客户关联、A004 缺少产品关联，它们仍然是已经发生的余额快照，不能在聚合前凭空消失。',
        '这一步承接第 02 章的判断：数据粒度要能说清楚；这里关注的是加工后的一行含义如何变化，不再重新讲建模理论。',
      ],
      bullets: [
        'DWD：一行 = 一个账户 × 一个快照日。',
        'DWS：一行 = 一个快照日 × 机构 × 客户口径 × 产品 × 币种。',
        'ADS：一行 = 一张存款余额指标卡 × 一个快照日。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '分层快照 · 观察行含义变化',
      title: '切换一层，重新读一行',
      description:
        '在 ODS、DWD、DWS、ADS 之间切换，查看当前层的行数、金额字段和一行代表什么。目标指标会在 ADS 收敛为 300,000。',
      visualization,
    },
    {
      kind: 'narrative',
      title: 'DWS 不是“把所有余额加成一行”',
      paragraphs: [
        'DWS 保留指标复用需要的分组字段。A001 和 A002 都属于杭州分行、小微、定期、CNY，所以它们在 DWS 合并成 300,000；A003 的客户口径为空，A004 的产品类型为空，分别落在另外的分组里。',
        '到了 ADS，系统只取指标卡指定的那一组。行数减少不是数据丢失，而是每一层承担的查询问题不同。',
      ],
    },
    {
      kind: 'takeaway',
      title: '读聚合结果的三个问题',
      text: '哪些字段被保留在 GROUP BY？哪些明细被合并？最终一行是否正好对应第 03 章定义的指标口径？',
      bullets: [
        '先看 DWD 行含义，再看 DWS 的分组字段。',
        '金额从 4 行明细汇总到 3 行业务分组，目标分组为 300,000。',
        'ADS 只发布指标卡对应的一行，不把 DWS 的其他分组误当成目标结果。',
      ],
    },
  ],
}
