import type { LessonContent } from '../types'

export const factTableTypesContent: LessonContent = {
  eyebrow: '第 02 章 · 事实表类型',
  subtitle: '事件、某个时间点的状态和一条业务生命周期，需要三种不同的事实表形态来记录。',
  quickSummary:
    '用账户交易流水、账户日终余额和 LoanNote 生命周期做三组对照，理解 Transaction Fact、Periodic Snapshot Fact 和 Accumulating Snapshot Fact 各自回答什么问题。',
  concept: {
    term: '三类 Fact Table（事实表）',
    definition:
      'Transaction Fact 记录事件，Periodic Snapshot Fact 记录固定周期的状态，Accumulating Snapshot Fact 记录一个业务过程从开始到结束的里程碑。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '事件、状态、生命周期是三种时间问题',
      paragraphs: [
        '账户流水告诉我们“发生了什么”；账户日终余额告诉我们“某天结束时是什么状态”；一笔 LoanNote 的生命周期则要追踪“从放款走到结清经历了哪些节点”。如果用同一种行含义承载三种问题，查询结果就会失去时间语义。',
        '下面的实验把三种事实表放在同一组对照里。先看每类表什么时候新增或更新，再看它的时间字段和适用问题。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'Fact Type 实验 · 三组事实形态',
      title: '选择一种事实表，读懂它的一行',
      description:
        '三张卡片先并列说明边界；选择其中一张后，查看样本数据。选到 LoanNote 生命周期时，还可以逐步推进放款、首期应还、首次还款、逾期和结清里程碑。',
      visualization: {
        kind: 'banking-fact-types',
        factTypes: [
          {
            id: 'transaction',
            label: '交易事实表',
            englishName: 'Transaction Fact',
            rowMeaning: '一行代表一笔账户交易事件',
            trigger: '有事件发生，才新增一行。',
            timeSemantics: '使用交易发生或入账的 event_time。',
            canAnswer: '发生了几笔交易、交易类型和交易金额。',
            cannotAnswer: '某天没有交易时的账户余额状态。',
            columns: [
              'transaction_id',
              'account_id',
              'transaction_type',
              'transaction_amount',
              'event_time',
            ],
            rows: [
              {
                transaction_id: 'T001',
                account_id: 'A001',
                transaction_type: '取款',
                transaction_amount: 2000,
                event_time: '09:31',
              },
              {
                transaction_id: 'T002',
                account_id: 'A001',
                transaction_type: '转账',
                transaction_amount: 5000,
                event_time: '14:20',
              },
            ],
          },
          {
            id: 'periodic-snapshot',
            label: '周期快照表',
            englishName: 'Periodic Snapshot Fact',
            rowMeaning: '一行代表一个账户在某个周期末的状态',
            trigger: '每个固定周期结束时记录状态，即使当天没有交易。',
            timeSemantics: '使用 snapshot_date 表示日终状态属于哪一天。',
            canAnswer: '某个账户在某个日期的期末余额。',
            cannotAnswer: '当天具体发生了哪一笔交易。',
            columns: ['snapshot_date', 'account_id', 'balance', 'transaction_count'],
            rows: [
              {
                snapshot_date: '2026-09-13',
                account_id: 'A001',
                balance: 52000,
                transaction_count: 2,
              },
              {
                snapshot_date: '2026-09-14',
                account_id: 'A001',
                balance: 50000,
                transaction_count: 0,
              },
              {
                snapshot_date: '2026-09-15',
                account_id: 'A001',
                balance: 48000,
                transaction_count: 1,
              },
            ],
          },
          {
            id: 'accumulating-snapshot',
            label: '累积快照表',
            englishName: 'Accumulating Snapshot Fact',
            rowMeaning: '一行代表一笔 LoanNote 的生命周期',
            trigger: '业务过程出现新的里程碑时，更新同一行的日期和状态字段。',
            timeSemantics: '一行中保留多个里程碑日期，分别说明过程走到哪里。',
            canAnswer: '一笔借据是否完成首期还款、是否逾期、何时结清。',
            cannotAnswer: '每一笔实际还款流水的金额和发生时间。',
            columns: [
              'note_id',
              'disbursed_date',
              'first_due_date',
              'first_repayment_date',
              'overdue_date',
              'settled_date',
              'current_status',
            ],
            rows: [
              {
                note_id: 'N001',
                disbursed_date: '2026-01-08',
                first_due_date: '2026-02-01',
                first_repayment_date: '2026-02-03',
                overdue_date: '—',
                settled_date: '—',
                current_status: '正常还款中',
              },
            ],
          },
        ],
        loanNoteLifecycle: {
          noteId: 'N001',
          milestones: [
            {
              id: 'disbursed',
              label: '放款',
              field: 'disbursed_date',
              date: '2026-01-08',
              status: '已放款',
              description: 'LoanNote 生成，生命周期有了起点；这是同一行的第一处里程碑。',
            },
            {
              id: 'first-due',
              label: '首次应还',
              field: 'first_due_date',
              date: '2026-02-01',
              status: '等待首期还款',
              description: '首次应还日期补入同一行，仍然没有新增一条 LoanNote。',
            },
            {
              id: 'first-repayment',
              label: '首次还款',
              field: 'first_repayment_date',
              date: '2026-02-03',
              status: '正常还款中',
              description: '收到第一笔实际 Repayment 后，补齐首次还款里程碑。',
            },
            {
              id: 'overdue',
              label: '可能逾期',
              field: 'overdue_date',
              date: '2026-03-04',
              status: '逾期',
              description: '如果业务过程进入逾期，写入 overdue_date；这不是新的交易事实。',
            },
            {
              id: 'settled',
              label: '最终结清',
              field: 'settled_date',
              date: '2026-06-30',
              status: '已结清',
              description: '余额归零后补入 settled_date，同一笔 LoanNote 的生命周期结束。',
            },
          ],
        },
      },
    },
    {
      kind: 'narrative',
      title: '同一个账户，可以同时需要两种事实',
      paragraphs: [
        '账户交易流水和账户日终余额并不互相替代：有些日期没有交易，但业务仍然需要一行日终状态。查看余额时必须带上 snapshot_date，查看流水时则回到 transaction_id 和 event_time。',
        '累积快照使用 LoanNote，而不是 LoanContract。因为一份合同可以对应多笔借据，放款、首次应还和结清的里程碑应该属于具体哪一笔借据，必须在行 Grain 上说清楚。',
      ],
    },
    {
      kind: 'takeaway',
      title: '先判断问题属于哪一种事实形态',
      text: '事件、状态、生命周期不是同一种事实。选择事实表时，先看问题是在问发生了什么、某个时间点是什么状态，还是一个过程走到了哪一步。',
      bullets: [
        'Transaction Fact：有事件才新增记录。',
        'Periodic Snapshot Fact：固定周期记录状态，没有交易也可能有行。',
        'Accumulating Snapshot Fact：同一行随着 LoanNote 生命周期补齐里程碑。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '为每种事实形态写清时间字段',
      text: '表设计说明中要明确 event_time、snapshot_date 或生命周期里程碑分别代表什么。不要把余额快照当成交易流水，也不要把生命周期的一次更新当成新增交易。',
    },
  ],
}
