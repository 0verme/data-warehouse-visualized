export type OltpOlapWorkloadId = 'point-update' | 'analytical-scan'

export interface AccountSnapshotRow {
  accountId: string
  branch: string
  product: 'Savings' | 'Checking'
  balanceCny: number
}

export interface OltpOlapColumn {
  id: 'account_id' | 'branch' | 'product' | 'balance_cny'
  label: string
}

export interface LayoutReadEstimate {
  layout: 'row' | 'column'
  blockCount: number
  blocks: readonly string[]
  blockValueSlots: number
  slotsRead: number
  usefulValues: number
  readAmplification: number
}

export interface OltpOlapWorkloadScenario {
  id: OltpOlapWorkloadId
  label: string
  title: string
  request: string
  result: string
  note: string
  rowLayout: LayoutReadEstimate
  columnLayout: LayoutReadEstimate
}

export interface OltpOlapAccessModel {
  snapshotDate: string
  rows: readonly AccountSnapshotRow[]
  columns: readonly OltpOlapColumn[]
  scenarios: readonly OltpOlapWorkloadScenario[]
}

const BLOCK_VALUE_SLOTS = 8
const SNAPSHOT_DATE = '2026-01-31'
const COLUMNS: readonly OltpOlapColumn[] = [
  { id: 'account_id', label: 'Account ID' },
  { id: 'branch', label: 'Branch' },
  { id: 'product', label: 'Product' },
  { id: 'balance_cny', label: 'Balance (CNY)' },
]

const ACCOUNT_SNAPSHOT_ROWS: readonly AccountSnapshotRow[] = [
  { accountId: 'A-101', branch: 'North', product: 'Savings', balanceCny: 4200 },
  { accountId: 'A-102', branch: 'South', product: 'Checking', balanceCny: 1800 },
  { accountId: 'A-103', branch: 'North', product: 'Savings', balanceCny: 6300 },
  { accountId: 'A-104', branch: 'East', product: 'Checking', balanceCny: 2500 },
  { accountId: 'A-105', branch: 'South', product: 'Savings', balanceCny: 4700 },
  { accountId: 'A-106', branch: 'East', product: 'Checking', balanceCny: 1200 },
  { accountId: 'A-107', branch: 'West', product: 'Savings', balanceCny: 5100 },
  { accountId: 'A-108', branch: 'West', product: 'Checking', balanceCny: 2200 },
]

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatBlockNumber(value: number): string {
  return String(value).padStart(2, '0')
}

function makeEstimate(
  layout: LayoutReadEstimate['layout'],
  blocks: readonly string[],
  usefulValues: number,
): LayoutReadEstimate {
  const slotsRead = blocks.length * BLOCK_VALUE_SLOTS

  return {
    layout,
    blockCount: blocks.length,
    blocks,
    blockValueSlots: BLOCK_VALUE_SLOTS,
    slotsRead,
    usefulValues,
    readAmplification: slotsRead / usefulValues,
  }
}

function buildPointUpdateScenario(
  rows: readonly AccountSnapshotRow[],
  columns: readonly OltpOlapColumn[],
): OltpOlapWorkloadScenario {
  const targetAccountId = 'A-105'
  const targetIndex = rows.findIndex(({ accountId }) => accountId === targetAccountId)
  const target = rows[targetIndex]

  if (!target || targetIndex < 0) {
    throw new Error(`The fixed account snapshot is missing ${targetAccountId}.`)
  }

  const rowsPerBlock = BLOCK_VALUE_SLOTS / columns.length
  const rowBlockNumber = Math.floor(targetIndex / rowsPerBlock) + 1
  const rowBlocks = [`row page ${formatBlockNumber(rowBlockNumber)}`]
  const columnBlocks = columns.map(({ id }) => `${id} column block 01`)

  return {
    id: 'point-update',
    label: 'Point lookup / update',
    title: 'Inspect one account row before a targeted correction',
    request: `Find ${target.accountId}, confirm its branch, product, and current balance, then consider changing balance_cny from ${CURRENCY.format(target.balanceCny)} to ${CURRENCY.format(target.balanceCny + 50)}.`,
    result: `${target.accountId} · ${target.branch} · ${target.product} · ${CURRENCY.format(target.balanceCny)}`,
    note: 'This comparison counts reads to inspect the complete target row. The locator/index lookup and all write, logging, concurrency, and transaction costs are excluded.',
    rowLayout: makeEstimate('row', rowBlocks, columns.length),
    columnLayout: makeEstimate('column', columnBlocks, columns.length),
  }
}

function buildAnalyticalScanScenario(
  rows: readonly AccountSnapshotRow[],
): OltpOlapWorkloadScenario {
  const totalBalance = rows.reduce((total, { balanceCny }) => total + balanceCny, 0)
  const rowBlockCount = Math.ceil(rows.length / (BLOCK_VALUE_SLOTS / COLUMNS.length))
  const columnBlockCount = Math.ceil(rows.length / BLOCK_VALUE_SLOTS)
  const rowBlocks = Array.from(
    { length: rowBlockCount },
    (_, index) => `row page ${formatBlockNumber(index + 1)}`,
  )
  const columnBlocks = Array.from(
    { length: columnBlockCount },
    (_, index) => `balance_cny column block ${formatBlockNumber(index + 1)}`,
  )

  return {
    id: 'analytical-scan',
    label: 'Narrow analytical scan',
    title: 'Sum one projected column across all accounts',
    request: `Read balance_cny for all ${rows.length} accounts in the ${SNAPSHOT_DATE} snapshot and sum the values.`,
    result: `${CURRENCY.format(totalBalance)} across ${rows.length} accounts`,
    note: 'The projection is one of four fixture columns. The model counts fixed-size value slots, not bytes, elapsed time, or a production scan metric.',
    rowLayout: makeEstimate('row', rowBlocks, rows.length),
    columnLayout: makeEstimate('column', columnBlocks, rows.length),
  }
}

/**
 * Build a deterministic access-shape comparison over one fixed account-balance
 * snapshot. Each equal-sized teaching block holds eight value slots: row pages
 * pack two four-column records; column blocks pack eight values for one column.
 * This describes logical reads only, not a database engine or physical benchmark.
 */
export function getOltpOlapAccessModel(): OltpOlapAccessModel {
  const rows = ACCOUNT_SNAPSHOT_ROWS.map((row) => ({ ...row }))
  const columns = COLUMNS.map((column) => ({ ...column }))

  return {
    snapshotDate: SNAPSHOT_DATE,
    rows,
    columns,
    scenarios: [buildPointUpdateScenario(rows, columns), buildAnalyticalScanScenario(rows)],
  }
}
