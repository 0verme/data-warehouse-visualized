import type { LessonContent } from '../types'

export const grainContent: LessonContent = {
  eyebrow: '第 03 章 · Grain',
  subtitle: '同一份贷款合同可以拆出借据和还款记录；先说清一行代表什么，金额才有正确的落点。',
  quickSummary:
    '用合同 C001、借据 N001/N002 和还款 R001/R002/R003 切换合同、借据、还款三种 Grain，观察 identity、行数、金额和可回答问题如何一起变化。',
  concept: {
    term: 'Grain（粒度）',
    definition:
      'Grain 是对“一行究竟代表什么”的明确声明。它决定一行的 identity、金额字段能否直接计算，以及这张表可以或不能回答哪些问题。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '一份合同，为什么会长出多行？',
      paragraphs: [
        '合同 C001 的约定金额是 100 万，但合同下可以有多笔实际放款。下面这个最小例子里，C001 对应借据 N001（30 万）和 N002（20 万）；N001 又发生了 R001（5 万）和 R002（3 万），N002 发生了 R003（2 万）。',
        '这些记录都属于同一条贷款链，却分别描述合同、实际放款和实际还款。把它们放进同一张表并不等于它们拥有同一个 Grain。',
      ],
      bullets: [
        '合同 C001：1 份，合同约定金额 100 万。',
        '借据 N001、N002：2 笔，实际放款本金合计 50 万。',
        '还款 R001、R002、R003：3 笔，实际还款合计 10 万。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'Grain 实验 · 一行的身份',
      title: '切换 Grain，重新读一遍这张表',
      description:
        '选择合同、借据或还款 Grain，查看当前一行、identity / 主键、行数、匹配金额，以及它能否回答某个问题。',
      visualization: {
        kind: 'loan-grain',
        contractId: 'C001',
        contractAmount: 1000000,
        options: [
          {
            id: 'contract',
            label: '合同 Grain',
            statement: '一行 = 一份贷款合同',
            identity: 'contract_id',
            primaryKey: 'contract_id',
            rowMeaning: '这一行描述合同约定，不表示合同下已经发生了几次放款。',
            columns: ['contract_id', 'contract_amount'],
            rows: [{ contract_id: 'C001', contract_amount: 1000000 }],
            amountField: 'contract_amount',
            amountLabel: '合同约定金额',
            amountValue: '¥1,000,000',
            canAnswer: ['合同数量', '合同约定金额'],
            cannotAnswer: ['借据数量和每笔实际放款本金', '每笔还款发生了什么'],
          },
          {
            id: 'loan-note',
            label: '借据 Grain',
            statement: '一行 = 一次实际放款 / 一笔借据',
            identity: 'note_id',
            primaryKey: 'note_id',
            rowMeaning: '这一行对应合同下的一笔实际放款，金额与实际形成的贷款本金对齐。',
            columns: ['note_id', 'contract_id', 'disbursed_principal'],
            rows: [
              { note_id: 'N001', contract_id: 'C001', disbursed_principal: 300000 },
              { note_id: 'N002', contract_id: 'C001', disbursed_principal: 200000 },
            ],
            amountField: 'disbursed_principal',
            amountLabel: '实际放款本金',
            amountValue: '¥500,000',
            canAnswer: ['实际放款笔数和本金', '按借据分析贷款形成情况'],
            cannotAnswer: ['直接列出每一笔还款流水', '把合同金额复制到每笔借据后直接求和'],
          },
          {
            id: 'repayment',
            label: '还款 Grain',
            statement: '一行 = 一笔实际还款',
            identity: 'repayment_id',
            primaryKey: 'repayment_id',
            rowMeaning: '这一行对应一次实际还款，金额与本次偿还行为对齐。',
            columns: ['repayment_id', 'note_id', 'repayment_amount'],
            rows: [
              { repayment_id: 'R001', note_id: 'N001', repayment_amount: 50000 },
              { repayment_id: 'R002', note_id: 'N001', repayment_amount: 30000 },
              { repayment_id: 'R003', note_id: 'N002', repayment_amount: 20000 },
            ],
            amountField: 'repayment_amount',
            amountLabel: '实际还款金额',
            amountValue: '¥100,000',
            canAnswer: ['还款笔数和已还金额', '按借据追踪每笔还款'],
            cannotAnswer: ['直接把一行当作一笔借据本金', '不经过关联就回答合同约定金额'],
          },
        ],
        errorDemo: {
          wrongColumns: ['contract_id', 'note_id', 'contract_amount'],
          wrongRows: [
            { contract_id: 'C001', note_id: 'N001', contract_amount: 1000000 },
            { contract_id: 'C001', note_id: 'N002', contract_amount: 1000000 },
          ],
          fixedColumns: ['contract_id', 'contract_amount'],
          fixedRows: [{ contract_id: 'C001', contract_amount: 1000000 }],
          actualContractAmount: 1000000,
          wrongMeasure: 'contract_amount',
          fixedMeasure: 'contract_amount',
          wrongSql: 'SUM(contract_amount)',
          fixedSql: 'SUM(contract_amount)  -- 回到 contract Grain',
        },
      },
    },
    {
      kind: 'narrative',
      title: 'Grain 错了，Join 会把指标放大',
      paragraphs: [
        '如果把合同 C001 的 100 万 Join 到 N001 和 N002，再直接 SUM(contract_amount)，一份合同就被算了两次。问题不在 SUM 函数，而在合同金额被带到了借据 Grain。',
        '看到 Join 结果后，要先问“当前一行是什么”，再决定金额是否可以在这里计算。需要合同金额时，先回到 contract_id 唯一的合同 Grain，或明确只保留一次。',
      ],
    },
    {
      kind: 'takeaway',
      title: '设计事实表前，先写出这一句话',
      text: '一行代表什么，不是表建好以后再补的注释，而是决定 identity、金额和指标边界的起点。',
      bullets: [
        '合同 Grain：一行 = 一份贷款合同，identity = contract_id。',
        '借据 Grain：一行 = 一次实际放款 / 一笔借据，identity = note_id。',
        '还款 Grain：一行 = 一笔实际还款，identity = repayment_id。',
        'Grain 错 → Join 放大 → 指标直接算错。',
      ],
    },
    {
      kind: 'pitfall',
      title: '金额字段必须和当前 Grain 对齐',
      text: '不要因为字段名相似就把 contract_amount、disbursed_principal 和 repayment_amount 互相替换。先确认一行的身份，再判断哪个金额属于这一行。',
    },
  ],
}
