import type { GrainId, GrainOption, StarSchemaRow } from '../types'

export function getGrainOption(
  options: readonly GrainOption[],
  grainId: GrainId,
): GrainOption | undefined {
  return options.find((option) => option.id === grainId)
}

export function sumNumericColumn(rows: readonly StarSchemaRow[], column: string): number {
  return rows.reduce((total, row) => {
    const value = row[column]
    const numericValue = typeof value === 'number' ? value : Number(value)

    return Number.isFinite(numericValue) ? total + numericValue : total
  }, 0)
}

export interface GrainErrorResult {
  actualAmount: number
  wrongTotal: number
  fixedTotal: number
  wrongDifference: number
  fixedDifference: number
}

export function calculateGrainErrorResult(rows: {
  wrongRows: readonly StarSchemaRow[]
  fixedRows: readonly StarSchemaRow[]
  actualAmount: number
  wrongMeasure: string
  fixedMeasure: string
}): GrainErrorResult {
  const wrongTotal = sumNumericColumn(rows.wrongRows, rows.wrongMeasure)
  const fixedTotal = sumNumericColumn(rows.fixedRows, rows.fixedMeasure)

  return {
    actualAmount: rows.actualAmount,
    wrongTotal,
    fixedTotal,
    wrongDifference: wrongTotal - rows.actualAmount,
    fixedDifference: fixedTotal - rows.actualAmount,
  }
}
