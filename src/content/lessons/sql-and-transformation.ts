import type { LessonContent } from '../types'
import {
  DEPOSIT_BALANCE_SCOPE,
  depositBalanceDataset,
  depositBalanceTaskContract,
} from '../../data/deposit-balance'
import type { SqlTransformationVisualization } from '../../features/sql-transformation/types'

/** 保留旧模块的导出名，调度与测试可以共享同一份银行教学数据，不再复制课程 fixture。 */
export const sqlTransformationDataset = depositBalanceDataset
export const sqlTransformationTaskContract = depositBalanceTaskContract

export const sqlTransformationVisualization: SqlTransformationVisualization = {
  kind: 'sql-transformation',
  focus: 'plan',
  targetDate: sqlTransformationDataset.targetDate,
  dataset: sqlTransformationDataset,
  taskContract: sqlTransformationTaskContract,
}

export const sqlAndTransformationContent: LessonContent = {
  eyebrow: '第 04 章 · 从指标卡到加工计划',
  opening: {
    eyebrow: '指标卡已经写清楚，数据库为什么还不能直接给答案？',
    title: '口径已经说清楚，为什么还不能直接算？',
    intro:
      '第 03 章的指标卡已经写下“杭州分行、小微、人民币、定期、截至 2026-09-30 的存款余额”。接下来要做的是把这句话翻译成输入表、字段和加工顺序。',
    cards: [
      { label: '统计对象', value: '存款余额', detail: '度量字段是 balance' },
      { label: '业务范围', value: '杭州分行 · 小微', detail: '需要 Branch 与 Customer' },
      { label: '目标结果', value: '300,000 元', detail: '一行代表一组指标维度' },
    ],
    question: '指标定义告诉我们要什么数字；加工计划还要说明，哪些输入能稳定地产出它。',
  },
  subtitle: '从一张存款余额指标卡开始，把业务条件落到输入表、字段和目标数据粒度。',
  quickSummary:
    '围绕 2026-09-30 的存款余额，识别账户余额快照、账户、客户、产品和机构五类输入，写出目标结果的一行代表什么。',
  concept: {
    term: '加工计划',
    definition:
      '加工计划把指标定义翻译成可执行的数据路径：需要读取哪些表、使用哪些字段、按哪个业务日期处理，以及最终输出的一行代表什么。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先把指标卡拆成可追踪的字段',
      paragraphs: [
        '“杭州分行、小微口径、人民币、定期、截至 2026-09-30 的存款余额”是一张业务指标卡。它已经说明想看什么，但数据库里这些词分散在不同输入中：余额来自账户余额快照，机构来自 Branch，客户口径来自 Customer，产品口径来自 Product，币种来自快照本身。',
        '当前加工目标不是再讨论小微口径如何定义，而是确认这张卡需要哪些数据才能被稳定复现。',
      ],
      bullets: [
        '统计日期 → AccountBalanceSnapshot.snapshot_date',
        '度量 → AccountBalanceSnapshot.balance',
        '客户口径 → Customer.customer_scope',
        '产品口径 → Product.product_type',
        '机构范围 → Branch.branch_name',
        '币种 → AccountBalanceSnapshot.currency，进入稳定层后统一编码',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '加工计划 · 从指标卡寻找输入',
      title: '先列输入，再写 SQL',
      description:
        '点击指标卡中的条件，查看它对应的输入表和字段。计划表暂时不改变数据行；它先把“要算什么”变成“准备读什么”。',
      visualization: sqlTransformationVisualization,
    },
    {
      kind: 'narrative',
      title: '结果的一行要提前写出来',
      paragraphs: [
        `这次目标结果的一行是：${sqlTransformationDataset.targetDate} × ${DEPOSIT_BALANCE_SCOPE.branchName} × ${DEPOSIT_BALANCE_SCOPE.customerScope} × ${DEPOSIT_BALANCE_SCOPE.productType} × ${DEPOSIT_BALANCE_SCOPE.currency}。如果没有先写出这句话，后面看到 4 行账户明细、3 行分组或 1 行指标结果时，很难判断哪些行是正常变化。`,
      ],
      bullets: [
        '输入明细的一行：一个账户 × 一个快照日。',
        '主题汇总的一行：一个快照日 × 机构 × 客户口径 × 产品 × 币种。',
        '应用结果的一行：一张指标卡在一个快照日的结果。',
      ],
    },
    {
      kind: 'takeaway',
      title: '先写加工问题，SQL 才有落点',
      text: '拿到指标定义后，先列出输入表、业务日期、目标数据粒度和需要关联的维度。这样每一步加工都有检查依据，数字变化也能找到来源。',
      bullets: [
        '指标定义决定筛选条件，不自动生成可用明细。',
        '五类核心输入分别承载余额、账户关系和业务维度。',
        'AccountMedium 只是后面观察 Join 放大的辅助表，不是这张指标卡的必要维度。',
      ],
    },
  ],
}
