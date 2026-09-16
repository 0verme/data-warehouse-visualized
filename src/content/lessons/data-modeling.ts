import type { LessonContent } from '../types'

export const dataModelingContent: LessonContent = {
  eyebrow: '第 02 章 · 业务过程',
  subtitle: '业务方说“新增贷款”时，先把这句话拆成可以被记录、核对和追问的业务过程。',
  quickSummary:
    '沿着 Customer → LoanContract → LoanNote → Repayment 的最小链路，比较合同约定、实际放款、借据本金和当前余额，先声明到底要记录哪件事。',
  concept: {
    term: 'Business Process（业务过程）',
    definition:
      '业务过程是现实世界中一类可识别的业务活动，例如签订合同、实际放款或发生还款。建模前要先确定本次分析记录的是哪一个过程。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '“新增贷款”到底指什么？',
      paragraphs: [
        '业务方问：“今年新增贷款是多少？”这句话听起来明确，实际可能对应合同约定金额、实际放款金额、新增借据本金，甚至当前贷款余额。它们来自贷款链路中的不同业务活动，不能因为都叫“贷款”就放在一起计算。',
        '先看一条足够小的链路：张三签下 LoanContract，合同下实际形成两笔 LoanNote，之后产生 Repayment，最后某笔借据可以进入结清状态。每个节点都是真实业务对象或状态，但它们记录的事情不同。',
      ],
      bullets: [
        '合同签订：记录银行和客户约定了什么。',
        '实际放款：记录哪一笔借据真正形成了贷款本金。',
        '实际还款：记录客户实际偿还了多少、什么时候偿还。',
        '结清：表示某笔借据的余额已经归零，不等于又发生了一笔放款。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '业务过程实验 · 先选要记录的事情',
      title: '沿着贷款链路选择一个业务过程',
      description:
        '点击签约、放款、还款或结清，查看它对应的业务对象、事件和记录数量；再选择一个数字，检查它回答的到底是哪一个问题。',
      visualization: {
        kind: 'loan-business-process',
        customerLabel: '张三 · customer_id C001',
        contractLabel: 'contract_id C001 · contract_amount ¥1,000,000',
        defaultStepId: 'disbursement',
        steps: [
          {
            id: 'contract',
            title: '合同签订',
            objectName: 'LoanContract',
            event: '合同成立',
            businessProcess: '贷款签约',
            analysisObject: 'LoanContract',
            recordCount: 1,
            detail: 'C001 · 约定金额 ¥1,000,000',
          },
          {
            id: 'disbursement',
            title: '实际放款',
            objectName: 'LoanNote',
            event: '实际放款',
            businessProcess: '贷款放款',
            analysisObject: 'LoanNote',
            recordCount: 2,
            detail: 'N001 ¥300,000 · N002 ¥200,000',
          },
          {
            id: 'repayment',
            title: '实际还款',
            objectName: 'Repayment',
            event: '还款发生',
            businessProcess: '贷款还款',
            analysisObject: 'Repayment',
            recordCount: 3,
            detail: 'R001 ¥50,000 · R002 ¥30,000 · R003 ¥20,000',
          },
          {
            id: 'settlement',
            title: '结清',
            objectName: 'LoanNote',
            event: '余额归零',
            businessProcess: '借据结清',
            analysisObject: 'LoanNote',
            recordCount: 1,
            detail: '某笔 LoanNote · balance = ¥0',
          },
        ],
        measures: [
          {
            id: 'contract-amount',
            label: '新签合同金额',
            field: 'contract_amount',
            displayValue: '¥1,000,000',
            description:
              '回答“今年签了多少合同约定额度”，对应 LoanContract 的合同事件；它不是已经放出的本金。',
          },
          {
            id: 'disbursed-principal',
            label: '实际放款金额',
            field: 'disbursed_principal',
            displayValue: '¥500,000',
            description: '回答“今年实际形成了多少放款本金”，对应 LoanNote 的实际放款事件。',
          },
          {
            id: 'new-note-principal',
            label: '新增借据本金',
            field: 'LoanNote.disbursed_principal',
            displayValue: '¥500,000',
            description:
              '按新生成的 LoanNote 统计本金。本例只包含两笔新借据，所以数值与实际放款金额相同，业务含义仍然不同。',
          },
          {
            id: 'current-balance',
            label: '当前贷款余额',
            field: 'balance',
            displayValue: '¥400,000',
            description:
              '回答“截至当前还有多少本金未还”，它是某个时间点的状态，不是今年新增的业务金额。',
          },
        ],
      },
    },
    {
      kind: 'narrative',
      title: '先写一条业务过程声明',
      paragraphs: [
        '如果问题是“今年实际放出了多少贷款本金”，建模前可以先写下：Business Process：贷款放款；分析对象：LoanNote；事件：实际放款。这个声明让后续每个字段和数字都有了检查依据。',
        '如果问题改成“今年签了多少合同”，声明就会变成贷款签约和 LoanContract。问题变了，记录对象也应该跟着变，而不是继续沿用上一种业务含义。',
      ],
      bullets: [
        '业务对象回答“涉及谁、哪份合同、哪笔借据”。',
        '业务过程回答“发生了哪类活动”。',
        '分析事实回答“要把哪类活动记录成可分析的事件”。',
      ],
    },
    {
      kind: 'takeaway',
      title: '建模的第一个判断不是表名',
      text: '拿到一个分析问题时，先把要记录的现实业务活动说清楚。没有 Business Process 声明，后面的数字很容易把合同、放款、还款和余额混成一个口径。',
      bullets: [
        '业务对象 ≠ 业务过程 ≠ 分析事实。',
        '本章主案例的默认声明：贷款放款 / LoanNote / 实际放款。',
        '不同问题可以选择同一条链路中的不同节点，但不能省略这一步判断。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '把业务过程写进模型说明',
      text: '生产环境中，表的设计说明至少要写出业务过程、分析对象、事件时间和金额含义。业务方下次把“新增贷款”换成“新增借据”时，团队才能判断这是换了问题，还是只是换了说法。',
    },
  ],
}
