import { useMemo, useState } from 'react'
import {
  compareSchemaShapes,
  SNOWFLAKE_SCHEMA_SQL,
  STAR_SCHEMA_SQL,
  type SchemaShape,
} from '../../features/english-modeling/star-snowflake'

const SHAPES: readonly { id: SchemaShape; label: string }[] = [
  { id: 'star', label: 'Star schema' },
  { id: 'snowflake', label: 'Snowflake schema' },
]

export function StarSchemaVsSnowflakeLab() {
  const [shape, setShape] = useState<SchemaShape>('star')
  const comparison = useMemo(() => compareSchemaShapes(), [])
  const result = shape === 'star' ? comparison.star : comparison.snowflake
  const sql = shape === 'star' ? STAR_SCHEMA_SQL : SNOWFLAKE_SCHEMA_SQL

  return (
    <section className="star-snowflake-lab" aria-label="Star schema vs snowflake schema comparison">
      <div className="star-snowflake-lab__toolbar">
        <div>
          <span className="star-snowflake-lab__eyebrow">One fact · two dimension shapes</span>
          <p>
            Switch the model, not the business question. Both queries group the same four
            transaction rows by product category.
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setShape('star')}
        >
          Reset comparison
        </button>
      </div>

      <div className="star-snowflake-lab__switch" role="group" aria-label="Dimension model shape">
        {SHAPES.map((option) => (
          <button
            className={`star-snowflake-lab__option${shape === option.id ? ' is-selected' : ''}`}
            type="button"
            key={option.id}
            aria-pressed={shape === option.id}
            onClick={() => setShape(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        className="star-snowflake-lab__equivalence"
        data-tone={comparison.sameRows ? 'right' : 'wrong'}
        aria-live="polite"
      >
        <strong>
          {comparison.sameRows && comparison.sameTotal
            ? 'Same answer; different dimension topology'
            : 'The outputs differ — inspect the keys and rows'}
        </strong>
        <span>Four fact rows · total {comparison.star.total.toLocaleString('en-US')}</span>
      </div>

      <div className="star-snowflake-lab__model" aria-live="polite">
        <div className="star-snowflake-lab__model-heading">
          <div>
            <span>{shape === 'star' ? 'DIRECT DIMENSION' : 'NORMALIZED DIMENSION'}</span>
            <h3>
              {shape === 'star'
                ? 'Product carries its category'
                : 'Category is a separate dimension'}
            </h3>
          </div>
          <p>{shape === 'star' ? 'One dimension join' : 'Two dimension joins'}</p>
        </div>
        <div className="star-snowflake-lab__topology" aria-label={`${shape} schema join path`}>
          <span className="star-snowflake-lab__node star-snowflake-lab__node--fact">
            <strong>fact_transaction</strong>
            <small>transaction_id · product_sk · transaction_amount</small>
          </span>
          <span className="star-snowflake-lab__edge" aria-hidden="true">
            →
          </span>
          <span className="star-snowflake-lab__node">
            <strong>dim_product</strong>
            <small>
              {shape === 'star'
                ? 'product_sk · product_name · category_name'
                : 'product_sk · product_name · category_sk'}
            </small>
          </span>
          {shape === 'snowflake' && (
            <>
              <span className="star-snowflake-lab__edge" aria-hidden="true">
                →
              </span>
              <span className="star-snowflake-lab__node star-snowflake-lab__node--category">
                <strong>dim_product_category</strong>
                <small>category_sk · category_name</small>
              </span>
            </>
          )}
        </div>

        <div className="star-snowflake-lab__stats">
          <div>
            <span>Dimension tables</span>
            <strong>{result.dimensionTableCount}</strong>
          </div>
          <div>
            <span>Joins to category</span>
            <strong>{result.joinCount}</strong>
          </div>
          <div>
            <span>Repeated category labels</span>
            <strong>{result.repeatedCategoryLabels}</strong>
          </div>
          <div>
            <span>Rows touched to rename “Deposit accounts”</span>
            <strong>{result.rowsToUpdateForCategoryRename}</strong>
          </div>
        </div>
      </div>

      <pre className="star-snowflake-lab__sql">
        <code>{sql}</code>
      </pre>

      <div className="english-table-scroll">
        <table className="english-table star-snowflake-lab__result">
          <caption>Category totals from the selected schema</caption>
          <thead>
            <tr>
              <th scope="col">category_name</th>
              <th scope="col">total_amount</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.category_name}>
                <td>{row.category_name}</td>
                <td>{row.total_amount.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Grand total</td>
              <td>{result.total.toLocaleString('en-US')}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="star-snowflake-lab__note">
        The counts describe this small fixture, not a benchmark. Actual query cost depends on the
        engine, data volume, statistics, storage layout, caching and optimizer behavior.
      </p>
    </section>
  )
}
