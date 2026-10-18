import type { StarSchemaRow } from '../../types'
import { sumNumericColumn } from '../../utils/star-schema'

export type SchemaShape = 'star' | 'snowflake'

export interface CategoryAggregate {
  category_name: string
  total_amount: number
}

export interface SchemaQueryResult {
  rows: readonly CategoryAggregate[]
  total: number
  joinCount: number
  dimensionTableCount: number
  repeatedCategoryLabels: number
  rowsToUpdateForCategoryRename: number
}

export const TRANSACTION_FACT_ROWS: readonly StarSchemaRow[] = [
  { transaction_id: 'T-1001', product_sk: 'P-01', transaction_amount: 5_000 },
  { transaction_id: 'T-1002', product_sk: 'P-02', transaction_amount: 2_000 },
  { transaction_id: 'T-1003', product_sk: 'P-03', transaction_amount: 7_000 },
  { transaction_id: 'T-1004', product_sk: 'P-01', transaction_amount: 3_000 },
]

/** Star form: descriptive category is copied onto each product row. */
export const STAR_PRODUCT_ROWS: readonly StarSchemaRow[] = [
  {
    product_sk: 'P-01',
    product_name: 'Everyday checking',
    category_name: 'Deposit accounts',
  },
  {
    product_sk: 'P-02',
    product_name: 'Savings account',
    category_name: 'Deposit accounts',
  },
  {
    product_sk: 'P-03',
    product_name: 'Credit card',
    category_name: 'Credit products',
  },
]

/** Snowflake form: product keeps a category key; labels live in one category row. */
export const SNOWFLAKE_PRODUCT_ROWS: readonly StarSchemaRow[] = [
  { product_sk: 'P-01', product_name: 'Everyday checking', category_sk: 'C-01' },
  { product_sk: 'P-02', product_name: 'Savings account', category_sk: 'C-01' },
  { product_sk: 'P-03', product_name: 'Credit card', category_sk: 'C-02' },
]

export const PRODUCT_CATEGORY_ROWS: readonly StarSchemaRow[] = [
  { category_sk: 'C-01', category_name: 'Deposit accounts' },
  { category_sk: 'C-02', category_name: 'Credit products' },
]

export const STAR_SCHEMA_SQL = `SELECT p.category_name, SUM(f.transaction_amount) AS total_amount
FROM fact_transaction AS f
JOIN dim_product AS p ON p.product_sk = f.product_sk
GROUP BY p.category_name
ORDER BY p.category_name`

export const SNOWFLAKE_SCHEMA_SQL = `SELECT c.category_name, SUM(f.transaction_amount) AS total_amount
FROM fact_transaction AS f
JOIN dim_product AS p ON p.product_sk = f.product_sk
JOIN dim_product_category AS c ON c.category_sk = p.category_sk
GROUP BY c.category_name
ORDER BY c.category_name`

function requiredText(row: StarSchemaRow | undefined, key: string): string {
  const value = row?.[key]
  if (typeof value !== 'string') {
    throw new Error(`Missing text field ${key}`)
  }
  return value
}

export function aggregateTransactionsByCategory(shape: SchemaShape): SchemaQueryResult {
  const joinedRows: StarSchemaRow[] = []

  for (const fact of TRANSACTION_FACT_ROWS) {
    const productKey = requiredText(fact, 'product_sk')
    const productRows =
      shape === 'star'
        ? STAR_PRODUCT_ROWS.filter((product) => product.product_sk === productKey)
        : SNOWFLAKE_PRODUCT_ROWS.filter((product) => product.product_sk === productKey)

    for (const product of productRows) {
      const categoryName =
        shape === 'star'
          ? requiredText(product, 'category_name')
          : requiredText(
              PRODUCT_CATEGORY_ROWS.find(
                (category) => category.category_sk === product.category_sk,
              ),
              'category_name',
            )
      joinedRows.push({
        category_name: categoryName,
        transaction_amount: fact.transaction_amount as number,
      })
    }
  }

  const grouped = new Map<string, StarSchemaRow[]>()
  for (const row of joinedRows) {
    const categoryName = requiredText(row, 'category_name')
    grouped.set(categoryName, [...(grouped.get(categoryName) ?? []), row])
  }

  const rows = [...grouped.entries()]
    .map(([category_name, items]) => ({
      category_name,
      total_amount: sumNumericColumn(items, 'transaction_amount'),
    }))
    .sort((left, right) => left.category_name.localeCompare(right.category_name))

  const depositCategoryKey = 'C-01'
  const starCategoryLabelRows = STAR_PRODUCT_ROWS.filter(
    (product) => product.category_name === 'Deposit accounts',
  ).length
  const snowflakeCategoryRows = PRODUCT_CATEGORY_ROWS.filter(
    (category) => category.category_sk === depositCategoryKey,
  ).length

  return {
    rows,
    total: sumNumericColumn(rows, 'total_amount'),
    joinCount: shape === 'star' ? 1 : 2,
    dimensionTableCount: shape === 'star' ? 1 : 2,
    repeatedCategoryLabels: shape === 'star' ? starCategoryLabelRows - snowflakeCategoryRows : 0,
    rowsToUpdateForCategoryRename: shape === 'star' ? starCategoryLabelRows : snowflakeCategoryRows,
  }
}

export function compareSchemaShapes(): {
  star: SchemaQueryResult
  snowflake: SchemaQueryResult
  sameRows: boolean
  sameTotal: boolean
} {
  const star = aggregateTransactionsByCategory('star')
  const snowflake = aggregateTransactionsByCategory('snowflake')
  return {
    star,
    snowflake,
    sameRows: JSON.stringify(star.rows) === JSON.stringify(snowflake.rows),
    sameTotal: star.total === snowflake.total,
  }
}
