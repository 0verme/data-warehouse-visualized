/**
 * Arrow Table → 普通 JS 结果的转换。
 *
 * 只依赖结构化接口（schema + toArray），因此该模块可以在不 import
 * `@duckdb/duckdb-wasm` / `apache-arrow` 的情况下被单元测试。
 */
import type { SqlQueryResult, SqlResultSummary, SqlTargetScope } from './types'

export const SQL_SANDBOX_MAX_RESULT_ROWS = 200

export interface ArrowTableLike {
  schema: { fields: readonly { name: string }[] }
  toArray(): readonly unknown[]
}

function toSerializable(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const numeric = Number(value)
    return Number.isSafeInteger(numeric) ? numeric : value.toString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item))
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value && typeof value === 'object') {
    const candidate = value as { toJSON?: () => unknown }
    if (typeof candidate.toJSON === 'function') {
      return toSerializable(candidate.toJSON())
    }

    const record: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      record[key] = toSerializable(item)
    }
    return record
  }

  return value
}

export function arrowTableToResult(
  table: ArrowTableLike,
  maxRows: number = SQL_SANDBOX_MAX_RESULT_ROWS,
): SqlQueryResult {
  const columns = table.schema.fields.map((field) => field.name)
  const allRows = table.toArray()
  const rows = allRows.slice(0, maxRows).map((row) => {
    const candidate = row as { toJSON?: () => Record<string, unknown> }
    const raw =
      typeof candidate.toJSON === 'function' ? candidate.toJSON() : (row as Record<string, unknown>)
    const record: Record<string, unknown> = {}
    for (const column of columns) {
      record[column] = toSerializable(raw[column])
    }
    return record
  })

  return {
    columns,
    rows,
    rowCount: allRows.length,
    truncated: allRows.length > maxRows,
  }
}

function matchesTargetScope(row: Record<string, unknown>, scope: SqlTargetScope): boolean {
  return (
    row.branch_name === scope.branchName &&
    row.customer_scope === scope.customerScope &&
    row.product_type === scope.productType &&
    row.currency === scope.currency
  )
}

export function summarizeResult(result: SqlQueryResult, scope: SqlTargetScope): SqlResultSummary {
  const balanceColumn = result.columns.includes('balance') ? 'balance' : null

  let totalBalance: number | null = null
  if (balanceColumn) {
    totalBalance = result.rows.reduce((total, row) => {
      const value = row[balanceColumn]
      return typeof value === 'number' && Number.isFinite(value) ? total + value : total
    }, 0)
  }

  const targetRows = result.rows.filter((row) => matchesTargetScope(row, scope))
  const targetScopeBalance =
    balanceColumn && targetRows.length > 0
      ? targetRows.reduce((total, row) => {
          const value = row[balanceColumn]
          return typeof value === 'number' && Number.isFinite(value) ? total + value : total
        }, 0)
      : null

  return {
    rowCount: result.rowCount,
    balanceColumn,
    totalBalance,
    targetScopeRowCount: targetRows.length,
    targetScopeBalance,
  }
}
