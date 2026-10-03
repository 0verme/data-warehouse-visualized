/**
 * Deterministic rerun model for the English idempotent-ETL page.
 *
 * One source row per (branch, business_date). Re-running the job with the same
 * input must leave the same business state; the write policy decides what
 * actually happens to the target table.
 */

export type WritePolicy = 'append' | 'overwrite' | 'merge'

export type InputVersion = 'initial' | 'corrected'

export interface TargetRow {
  readonly id: string
  readonly branchId: string
  readonly businessDate: string
  readonly balance: number
  readonly loadedByRun: number
}

export interface RunRecord {
  readonly id: number
  readonly policy: WritePolicy
  readonly inputVersion: InputVersion
  readonly inputBalance: number
  readonly appendedRows: number
  readonly removedRows: number
  readonly updatedRows: number
  readonly resultingRows: number
  readonly duplicate: boolean
}

export interface RerunState {
  readonly policy: WritePolicy
  readonly inputVersion: InputVersion
  readonly runs: readonly RunRecord[]
  readonly rows: readonly TargetRow[]
}

export interface RerunMetrics {
  readonly rowsForPartition: number
  readonly balanceTotal: number
  readonly expectedBalance: number
  readonly duplicateRows: number
}

export const branchId = 'HZ-01'
export const businessDate = '2026-02-01'
export const initialBalance = 1000000
export const correctedBalance = 1100000

const partitionRows = (rows: readonly TargetRow[]): TargetRow[] =>
  rows.filter((row) => row.branchId === branchId && row.businessDate === businessDate)

export function createInitialRerunState(policy: WritePolicy = 'append'): RerunState {
  return { policy, inputVersion: 'initial', runs: [], rows: [] }
}

export function balanceForVersion(version: InputVersion): number {
  return version === 'initial' ? initialBalance : correctedBalance
}

export function getRerunMetrics(state: RerunState): RerunMetrics {
  const rows = partitionRows(state.rows)
  const balanceTotal = rows.reduce((total, row) => total + row.balance, 0)

  return {
    rowsForPartition: rows.length,
    balanceTotal,
    expectedBalance: balanceForVersion(state.inputVersion),
    duplicateRows: Math.max(0, rows.length - 1),
  }
}

/**
 * Apply one execution with the current policy and input version.
 * - append: always inserts a fresh row for the partition.
 * - overwrite: deletes the partition, then inserts the fresh row.
 * - merge: updates the existing partition row in place, or inserts it once.
 */
export function applyRerun(state: RerunState, inputVersion: InputVersion): RerunState {
  const runId = state.runs.length + 1
  const balance = balanceForVersion(inputVersion)
  const existing = partitionRows(state.rows)
  const freshRow: TargetRow = {
    id: `${branchId}-${businessDate}-${runId}`,
    branchId,
    businessDate,
    balance,
    loadedByRun: runId,
  }

  let rows: TargetRow[]
  let appendedRows = 0
  let removedRows = 0
  let updatedRows = 0

  switch (state.policy) {
    case 'append': {
      rows = [...state.rows, freshRow]
      appendedRows = 1
      break
    }
    case 'overwrite': {
      rows = [...state.rows.filter((row) => !existing.includes(row)), freshRow]
      removedRows = existing.length
      appendedRows = 1
      break
    }
    case 'merge': {
      if (existing.length === 0) {
        rows = [...state.rows, freshRow]
        appendedRows = 1
      } else {
        rows = state.rows.map((row) => (existing.includes(row) ? { ...freshRow, id: row.id } : row))
        updatedRows = 1
      }
      break
    }
  }

  const resultingRows = partitionRows(rows).length
  const run: RunRecord = {
    id: runId,
    policy: state.policy,
    inputVersion,
    inputBalance: balance,
    appendedRows,
    removedRows,
    updatedRows,
    resultingRows,
    duplicate: resultingRows > 1,
  }

  return {
    ...state,
    inputVersion,
    runs: [...state.runs, run],
    rows,
  }
}

export function setPolicy(state: RerunState, policy: WritePolicy): RerunState {
  return { ...state, policy }
}
