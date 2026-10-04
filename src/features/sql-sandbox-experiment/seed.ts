/**
 * 从现有 Banking 教学数据集单向生成 DuckDB seed SQL。
 *
 * 唯一数据源是 `buildDepositBalanceRows(depositBalanceDataset)`（DWD 快照），
 * 不在本目录复制 fixture；seed 后的表内容必须与现有确定性函数输出一致。
 */
import { depositBalanceDataset } from '../../data/deposit-balance'
import { buildDepositBalanceRows } from '../../utils/sql-transformation'

export const SQL_SANDBOX_TABLE = 'dwd_deposit_balance_detail'

export const SQL_SANDBOX_SEED_COLUMNS = [
  'snapshot_date',
  'account_id',
  'customer_id',
  'customer_scope',
  'product_id',
  'product_type',
  'branch_id',
  'branch_name',
  'source_currency',
  'currency',
  'balance',
  'missing_dimensions',
] as const

export interface SeedScript {
  tableName: string
  columns: readonly string[]
  rowCount: number
  statements: string[]
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  return `'${String(value).replaceAll("'", "''")}'`
}

export function buildSeedScript(): SeedScript {
  const rows = buildDepositBalanceRows(depositBalanceDataset)

  const createTable = [
    `CREATE TABLE ${SQL_SANDBOX_TABLE} (`,
    '  snapshot_date TEXT,',
    '  account_id TEXT,',
    '  customer_id TEXT,',
    '  customer_scope TEXT,',
    '  product_id TEXT,',
    '  product_type TEXT,',
    '  branch_id TEXT,',
    '  branch_name TEXT,',
    '  source_currency TEXT,',
    '  currency TEXT,',
    '  balance DOUBLE,',
    '  missing_dimensions TEXT',
    ');',
  ].join('\n')

  const values = rows
    .map(
      (row) =>
        `  (${SQL_SANDBOX_SEED_COLUMNS.map((column) => sqlLiteral(row[column])).join(', ')})`,
    )
    .join(',\n')

  const insertRows = [
    `INSERT INTO ${SQL_SANDBOX_TABLE} (${SQL_SANDBOX_SEED_COLUMNS.join(', ')}) VALUES`,
    `${values};`,
  ].join('\n')

  return {
    tableName: SQL_SANDBOX_TABLE,
    columns: SQL_SANDBOX_SEED_COLUMNS,
    rowCount: rows.length,
    statements: [createTable, insertRows],
  }
}
