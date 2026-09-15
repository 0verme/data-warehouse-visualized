import { describe, expect, it } from 'vitest'
import { grainContent } from '../src/content/lessons/grain'
import { getLessonBySlug } from '../src/data/course'
import type { LoanGrainVisualization } from '../src/types'
import {
  calculateLoanGrainErrorResult,
  getLoanGrainOption,
  sumLoanColumn,
} from '../src/utils/loan-grain'

let visualization: LoanGrainVisualization | undefined

for (const section of grainContent.sections) {
  if (section.kind === 'visualization' && section.visualization.kind === 'loan-grain') {
    visualization = section.visualization
    break
  }
}

if (!visualization) {
  throw new Error('Grain 测试需要 loan-grain visualization 数据')
}

describe('Grain：一行究竟代表什么课程数据', () => {
  it('注册合同、借据和还款三种 Grain', () => {
    expect(getLessonBySlug('grain')).toMatchObject({
      title: 'Grain：一行究竟代表什么？',
      chapter: '03',
      order: 200,
      demo: 'loan-grain',
    })
    expect(visualization.options.map((option) => option.id)).toEqual([
      'contract',
      'loan-note',
      'repayment',
    ])
    expect(visualization.options.map((option) => option.rows.length)).toEqual([1, 2, 3])
  })

  it('贷款样本保持 C001 → N001/N002 → R001/R002/R003 的关系', () => {
    const contract = getLoanGrainOption(visualization.options, 'contract')
    const note = getLoanGrainOption(visualization.options, 'loan-note')
    const repayment = getLoanGrainOption(visualization.options, 'repayment')

    expect(contract?.rows[0]).toEqual({ contract_id: 'C001', contract_amount: 1000000 })
    expect(note?.rows.map((row) => row.note_id)).toEqual(['N001', 'N002'])
    expect(repayment?.rows.map((row) => row.repayment_id)).toEqual(['R001', 'R002', 'R003'])
    expect(sumLoanColumn(note?.rows ?? [], 'disbursed_principal')).toBe(500000)
    expect(sumLoanColumn(repayment?.rows ?? [], 'repayment_amount')).toBe(100000)
  })

  it('把合同金额 Join 到两笔借据会从 100 万放大到 200 万', () => {
    const result = calculateLoanGrainErrorResult(visualization.errorDemo)

    expect(result).toEqual({
      actualContractAmount: 1000000,
      wrongTotal: 2000000,
      fixedTotal: 1000000,
      wrongDifference: 1000000,
      fixedDifference: 0,
    })
  })
})
