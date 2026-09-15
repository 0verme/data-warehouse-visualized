import type { LoanGrainErrorDemo, LoanGrainId, LoanGrainOption, TeachingTableRow } from '../types'

export function getLoanGrainOption(
  options: readonly LoanGrainOption[],
  grainId: LoanGrainId,
): LoanGrainOption | undefined {
  return options.find((option) => option.id === grainId)
}

export function sumLoanColumn(rows: readonly TeachingTableRow[], column: string): number {
  return rows.reduce((total, row) => {
    const value = row[column]
    const numericValue = typeof value === 'number' ? value : Number(value)

    return Number.isFinite(numericValue) ? total + numericValue : total
  }, 0)
}

export interface LoanGrainErrorResult {
  actualContractAmount: number
  wrongTotal: number
  fixedTotal: number
  wrongDifference: number
  fixedDifference: number
}

export function calculateLoanGrainErrorResult(demo: LoanGrainErrorDemo): LoanGrainErrorResult {
  const wrongTotal = sumLoanColumn(demo.wrongRows, demo.wrongMeasure)
  const fixedTotal = sumLoanColumn(demo.fixedRows, demo.fixedMeasure)

  return {
    actualContractAmount: demo.actualContractAmount,
    wrongTotal,
    fixedTotal,
    wrongDifference: wrongTotal - demo.actualContractAmount,
    fixedDifference: fixedTotal - demo.actualContractAmount,
  }
}
