import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StarSchemaVsSnowflakeLab } from '../src/components/english/StarSchemaVsSnowflakeLab'
import {
  PRODUCT_CATEGORY_ROWS,
  SNOWFLAKE_PRODUCT_ROWS,
  SNOWFLAKE_SCHEMA_SQL,
  STAR_PRODUCT_ROWS,
  STAR_SCHEMA_SQL,
  TRANSACTION_FACT_ROWS,
  aggregateTransactionsByCategory,
  compareSchemaShapes,
} from '../src/features/english-modeling/star-snowflake'

const CJK = /[\u3400-\u9fff]/

describe('English star schema vs snowflake model', () => {
  it('holds the four transaction fact rows and 17,000 total constant', () => {
    expect(TRANSACTION_FACT_ROWS).toHaveLength(4)
    expect(aggregateTransactionsByCategory('star').total).toBe(17_000)
    expect(aggregateTransactionsByCategory('snowflake').total).toBe(17_000)
  })

  it('returns identical deterministic category aggregates for both shapes', () => {
    const comparison = compareSchemaShapes()
    expect(comparison.sameRows).toBe(true)
    expect(comparison.sameTotal).toBe(true)
    expect(comparison.star.rows).toEqual([
      { category_name: 'Credit products', total_amount: 7_000 },
      { category_name: 'Deposit accounts', total_amount: 10_000 },
    ])
    expect(comparison.snowflake.rows).toEqual(comparison.star.rows)
  })

  it('changes only the dimension join topology and maintenance counts', () => {
    const star = aggregateTransactionsByCategory('star')
    const snowflake = aggregateTransactionsByCategory('snowflake')
    expect(star.joinCount).toBe(1)
    expect(snowflake.joinCount).toBe(2)
    expect(star.dimensionTableCount).toBe(1)
    expect(snowflake.dimensionTableCount).toBe(2)
    expect(star.repeatedCategoryLabels).toBe(1)
    expect(snowflake.repeatedCategoryLabels).toBe(0)
    expect(star.rowsToUpdateForCategoryRename).toBe(2)
    expect(snowflake.rowsToUpdateForCategoryRename).toBe(1)
  })

  it('keeps the normalized category relation unique and the star dimension denormalized', () => {
    expect(new Set(PRODUCT_CATEGORY_ROWS.map((row) => row.category_sk)).size).toBe(2)
    expect(STAR_PRODUCT_ROWS.every((row) => typeof row.category_name === 'string')).toBe(true)
    expect(STAR_PRODUCT_ROWS.every((row) => !('category_sk' in row))).toBe(true)
    expect(SNOWFLAKE_PRODUCT_ROWS.every((row) => typeof row.category_sk === 'string')).toBe(true)
  })

  it('provides one-join and two-join SQL for the same grouped query', () => {
    expect(STAR_SCHEMA_SQL).toContain('JOIN dim_product AS p')
    expect(STAR_SCHEMA_SQL).not.toContain('dim_product_category')
    expect(SNOWFLAKE_SCHEMA_SQL.match(/JOIN /g)).toHaveLength(2)
    expect(SNOWFLAKE_SCHEMA_SQL).toContain('JOIN dim_product_category AS c')
    expect(SNOWFLAKE_SCHEMA_SQL).toContain('GROUP BY c.category_name')
  })

  it('keeps English model copy free of Chinese characters', () => {
    const copy = [
      STAR_SCHEMA_SQL,
      SNOWFLAKE_SCHEMA_SQL,
      ...STAR_PRODUCT_ROWS.flatMap((row) => Object.values(row).map(String)),
      ...SNOWFLAKE_PRODUCT_ROWS.flatMap((row) => Object.values(row).map(String)),
      ...PRODUCT_CATEGORY_ROWS.flatMap((row) => Object.values(row).map(String)),
    ]
    for (const text of copy) expect(CJK.test(text), text).toBe(false)
  })

  it('renders the server-side star model and its verifiable output', () => {
    const markup = renderToStaticMarkup(<StarSchemaVsSnowflakeLab />)
    expect(markup).toContain('One fact · two dimension shapes')
    expect(markup).toContain('Same answer; different dimension topology')
    expect(markup).toContain('dim_product')
    expect(markup).toContain('10,000')
    expect(markup).toContain('17,000')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-live="polite"')
  })
})
