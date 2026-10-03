import { useMemo, useReducer } from 'react'
import { createJoinDuplicatesKernel } from '../../features/english-join/steps'
import type {
  JoinDemoState,
  JoinHighlight,
  JoinResultRow,
  JoinStepKind,
} from '../../features/english-join/types'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  getVisualizationPlayerProgress,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../../utils/visualization-steps'

const KIND_LABELS: Record<JoinStepKind, string> = {
  observe: 'Observe',
  expand: 'Fan-out',
  diagnose: 'Diagnose',
  distinct: 'DISTINCT trap',
  fix: 'Fix',
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatCurrency(value: number): string {
  return currency.format(value)
}

function isHighlighted(ids: readonly string[], id: string): boolean {
  return ids.includes(id)
}

function countByOrder<T extends { readonly orderId: string }>(
  rows: readonly T[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.orderId, (counts.get(row.orderId) ?? 0) + 1)
  }
  return counts
}

function StepEquation({ state, highlight }: { state: JoinDemoState; highlight: JoinHighlight }) {
  const paymentCounts = countByOrder(state.payments)
  const shipmentCounts = countByOrder(state.shipments)
  const showPayments = state.mode === 'payments' || state.mode === 'payments-shipments'
  const showShipments = state.mode === 'payments-shipments'
  const aggregated = state.mode === 'aggregated'

  return (
    <div className="join-lab__equation" aria-label="Matching combinations per order">
      {state.orders.map((order) => {
        const paymentFactor = aggregated
          ? Math.min(1, paymentCounts.get(order.orderId) ?? 0)
          : (paymentCounts.get(order.orderId) ?? 0)
        const shipmentFactor = aggregated
          ? Math.min(1, shipmentCounts.get(order.orderId) ?? 0)
          : (shipmentCounts.get(order.orderId) ?? 0)
        const resultCount = state.resultRows.filter((row) => row.orderId === order.orderId).length
        const factors = [
          1,
          showPayments ? paymentFactor : undefined,
          showShipments ? shipmentFactor : undefined,
        ].filter((value): value is number => value !== undefined)
        const active = isHighlighted(highlight.orderIds, order.id)

        return (
          <p className={active ? 'is-active' : undefined} key={order.id}>
            <code>{order.orderId}</code>
            <span>{factors.join(' × ')}</span>
            <span className="join-lab__equation-result">= {resultCount} rows</span>
          </p>
        )
      })}
      <p className="join-lab__equation-total">
        <strong>{state.metrics.joinedRows}</strong> rows returned in total
      </p>
    </div>
  )
}

function MetricsPanel({ state }: { state: JoinDemoState }) {
  const { metrics } = state
  const fixed = state.mode === 'aggregated' || state.mode === 'exists'
  const inflated = metrics.overcountedAmount > 0

  return (
    <div className="join-lab__metrics" data-tone={fixed ? 'ok' : inflated ? 'risk' : 'neutral'}>
      <div>
        <span>Rows returned</span>
        <strong>{metrics.joinedRows}</strong>
      </div>
      <div>
        <span>COUNT(DISTINCT order_id)</span>
        <strong>{metrics.distinctOrders}</strong>
      </div>
      <div data-tone={inflated && !fixed ? 'risk' : undefined}>
        <span>SUM(order_amount)</span>
        <strong>{formatCurrency(metrics.sumOrderAmount)}</strong>
      </div>
      <div>
        <span>Actual order total</span>
        <strong>{formatCurrency(metrics.expectedOrderTotal)}</strong>
      </div>
      <p aria-live="polite">
        {fixed
          ? `Safe: the order grain is preserved, so SUM(order_amount) matches the ${formatCurrency(metrics.expectedOrderTotal)} the orders are really worth.`
          : inflated
            ? `Overcounted by ${formatCurrency(metrics.overcountedAmount)}: order_amount is summed once per matching child row.`
            : 'No rows joined yet.'}
      </p>
    </div>
  )
}

function KeyCards({ state }: { state: JoinDemoState }) {
  const paymentsForFirstOrder = state.payments.filter((row) => row.orderId === 'O-1001').length
  const shipmentsForFirstOrder = state.shipments.filter((row) => row.orderId === 'O-1001').length

  return (
    <div className="join-lab__keys">
      <article>
        <span>orders · parent</span>
        <strong>{state.orders.length} rows, order_id unique</strong>
        <p>Each row is one order with its own order_amount.</p>
      </article>
      <article>
        <span>payments · child</span>
        <strong>
          {state.payments.length} rows, order_id repeats {paymentsForFirstOrder}× for O-1001
        </strong>
        <p>Each row is one payment; nothing prevents several payments per order.</p>
      </article>
      <article>
        <span>shipments · child</span>
        <strong>
          {state.shipments.length} rows, order_id repeats {shipmentsForFirstOrder}× for O-1001
        </strong>
        <p>Each row is one shipment; joining both children on the same key crosses them.</p>
      </article>
    </div>
  )
}

function ResultTable({ state, highlight }: { state: JoinDemoState; highlight: JoinHighlight }) {
  const aggregated = state.mode === 'aggregated'
  const fixed = aggregated || state.mode === 'exists'

  return (
    <section
      className="join-lab__result"
      data-tone={fixed ? 'ok' : 'risk'}
      aria-label="Query result"
    >
      <div className="join-lab__result-heading">
        <span>{fixed ? 'Correct result' : 'Joined result'}</span>
        <strong>{state.metrics.joinedRows} rows</strong>
      </div>
      {state.resultRows.length === 0 ? (
        <p className="join-lab__empty">No rows yet: the query has not joined the tables.</p>
      ) : (
        <div className="join-lab__table-scroll">
          <table className="join-lab__table">
            <caption className="sr-only">Rows returned by the current query</caption>
            {aggregated ? (
              <>
                <thead>
                  <tr>
                    <th scope="col">order_id</th>
                    <th scope="col">order_amount</th>
                    <th scope="col">payments_total</th>
                    <th scope="col">payment_count</th>
                    <th scope="col">shipment_count</th>
                  </tr>
                </thead>
                <tbody>
                  {state.resultRows.map((row: JoinResultRow) => (
                    <tr
                      className={
                        isHighlighted(highlight.resultRowIds, row.id) ? 'is-active' : undefined
                      }
                      key={row.id}
                    >
                      <td>
                        <code>{row.orderId}</code>
                      </td>
                      <td>{formatCurrency(row.orderAmount)}</td>
                      <td>{row.paidAmount === null ? '—' : formatCurrency(row.paidAmount)}</td>
                      <td>{row.paymentCount ?? '—'}</td>
                      <td>{row.shipmentCount ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th scope="col">order_id</th>
                    <th scope="col">order_amount</th>
                    <th scope="col">payment_id</th>
                    <th scope="col">paid_amount</th>
                    <th scope="col">shipment_id</th>
                    <th scope="col">carrier</th>
                  </tr>
                </thead>
                <tbody>
                  {state.resultRows.map((row: JoinResultRow) => (
                    <tr
                      className={
                        isHighlighted(highlight.resultRowIds, row.id) ? 'is-active' : undefined
                      }
                      key={row.id}
                    >
                      <td>
                        <code>{row.orderId}</code>
                      </td>
                      <td>{formatCurrency(row.orderAmount)}</td>
                      <td>{row.paymentId ?? '—'}</td>
                      <td>{row.paidAmount === null ? '—' : formatCurrency(row.paidAmount)}</td>
                      <td>{row.shipmentId ?? '—'}</td>
                      <td>{row.carrier ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}
    </section>
  )
}

function DistinctPanel({ state }: { state: JoinDemoState }) {
  const distinctKeyRows = state.orders.length
  const distinctKeyTotal = state.metrics.expectedOrderTotal

  return (
    <div className="join-lab__distinct">
      <article>
        <span>Variant 1</span>
        <h4>SELECT *</h4>
        <code>{'SELECT * FROM orders JOIN payments USING (order_id);'}</code>
        <p>
          Returns <strong>{state.metrics.joinedRows} rows</strong> and sums order_amount to{' '}
          <strong>{formatCurrency(state.metrics.sumOrderAmount)}</strong>. Wrong.
        </p>
      </article>
      <article>
        <span>Variant 2</span>
        <h4>SELECT DISTINCT *</h4>
        <code>{'SELECT DISTINCT * FROM orders JOIN payments USING (order_id);'}</code>
        <p>
          Still <strong>{state.metrics.joinedRows} rows</strong>: payment_id differs, so DISTINCT
          has nothing to collapse. The symptom is hidden, not fixed.
        </p>
      </article>
      <article data-tone="warning">
        <span>Variant 3</span>
        <h4>SELECT DISTINCT order_id, order_amount</h4>
        <code>
          {'SELECT DISTINCT order_id, order_amount FROM orders JOIN payments USING (order_id);'}
        </code>
        <p>
          Returns <strong>{distinctKeyRows} rows</strong> and sums to{' '}
          <strong>{formatCurrency(distinctKeyTotal)}</strong>. It looks right, but the payment
          columns are gone, and two identical real payments would collapse into one.
        </p>
      </article>
    </div>
  )
}

function SourceTable({
  title,
  grain,
  columns,
  rows,
  highlightedIds,
  tone = 'neutral',
}: {
  title: string
  grain: string
  columns: readonly string[]
  rows: readonly (readonly (string | number)[])[]
  highlightedIds: readonly string[]
  tone?: 'neutral' | 'risk'
}) {
  return (
    <div className="join-lab__source" data-tone={tone}>
      <div className="join-lab__source-heading">
        <strong>{title}</strong>
        <span>{grain}</span>
      </div>
      <div className="join-lab__table-scroll">
        <table className="join-lab__table">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = String(row[0])
              const active = isHighlighted(highlightedIds, id)
              return (
                <tr className={active ? 'is-active' : undefined} key={row.join('|')}>
                  {row.map((cell, index) => (
                    <td key={`${columns[index]}-${String(cell)}`}>
                      {typeof cell === 'number' ? formatCurrency(cell) : cell}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FixSql({ mode }: { mode: JoinDemoState['mode'] }) {
  if (mode === 'aggregated') {
    return (
      <div className="join-lab__fix">
        <span>Fix 1 · pre-aggregate, then join</span>
        <pre>
          <code>{`WITH payments_by_order AS (
  SELECT order_id,
         SUM(paid_amount) AS payments_total,
         COUNT(*)         AS payment_count
  FROM payments
  GROUP BY order_id
),
shipments_by_order AS (
  SELECT order_id, COUNT(*) AS shipment_count
  FROM shipments
  GROUP BY order_id
)
SELECT o.order_id,
       o.order_amount,
       p.payments_total,
       p.payment_count,
       s.shipment_count
FROM orders AS o
LEFT JOIN payments_by_order  AS p ON p.order_id = o.order_id
LEFT JOIN shipments_by_order AS s ON s.order_id = o.order_id;`}</code>
        </pre>
      </div>
    )
  }

  if (mode === 'exists') {
    return (
      <div className="join-lab__fix">
        <span>Fix 2 · EXISTS for filtering only</span>
        <pre>
          <code>{`SELECT o.order_id, o.order_amount
FROM orders AS o
WHERE EXISTS (
  SELECT 1
  FROM payments AS p
  WHERE p.order_id = o.order_id
);`}</code>
        </pre>
      </div>
    )
  }

  return null
}

export function JoinDuplicatesLab() {
  const kernel = useMemo(() => createJoinDuplicatesKernel(), [])
  const [player, dispatch] = useReducer(
    applyVisualizationPlayerAction,
    kernel.size,
    createVisualizationPlayer,
  )
  const step = getCurrentVisualizationStep(player, kernel)
  const progress = getVisualizationPlayerProgress(player)
  const atStart = isVisualizationPlayerAtStart(player)
  const atEnd = isVisualizationPlayerAtEnd(player)

  if (!step.highlight) {
    throw new Error(`JOIN duplicate-rows step ${step.id} is missing its highlight contract`)
  }

  const highlight = step.highlight
  const { state } = step
  const aggregated = state.mode === 'aggregated'
  const riskTables = highlight.risk && state.mode !== 'none'

  return (
    <section
      className="join-lab"
      aria-label="SQL JOIN duplicate rows step-by-step lab"
      data-step-id={step.id}
      data-step-kind={highlight.kind}
      data-mode={state.mode}
    >
      <div className="visualization-toolbar join-lab__toolbar">
        <div className="join-lab__toolbar-main">
          <span className="visualization-toolbar__label">
            Step {progress.current} / {progress.total} · {KIND_LABELS[highlight.kind]}
          </span>
          <p aria-live="polite" aria-atomic="true">
            <strong>{step.title}</strong> {step.description}
          </p>
        </div>
        <div className="visualization-toolbar__actions" role="group" aria-label="Step controls">
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => dispatch('prev')}
            disabled={atStart}
          >
            Previous
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => dispatch('reset')}
          >
            Reset
          </button>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => dispatch('next')}
            disabled={atEnd}
          >
            {atEnd ? 'Done' : 'Next step'}
          </button>
        </div>
      </div>

      <div
        className="join-lab__progress"
        role="progressbar"
        aria-label="Step progress"
        aria-valuemin={1}
        aria-valuemax={progress.total}
        aria-valuenow={progress.current}
        aria-valuetext={`Step ${progress.current} of ${progress.total}`}
      >
        <span style={{ width: `${progress.ratio * 100}%` }} />
      </div>

      {state.mode === 'none' ? (
        <KeyCards state={state} />
      ) : (
        <>
          <StepEquation state={state} highlight={highlight} />
          <MetricsPanel state={state} />
        </>
      )}

      {highlight.kind === 'distinct' ? (
        <DistinctPanel state={state} />
      ) : (
        <ResultTable state={state} highlight={highlight} />
      )}

      <div className="join-lab__sources">
        <SourceTable
          title="orders"
          grain="one row per order · order_id unique"
          columns={['order_id', 'amount']}
          rows={state.orders.map((row) => [row.id, row.amount])}
          highlightedIds={highlight.orderIds}
          tone={riskTables && isHighlighted(highlight.orderIds, 'O-1001') ? 'risk' : 'neutral'}
        />
        {aggregated ? (
          <SourceTable
            title="payments_by_order"
            grain="pre-aggregated to one row per order"
            columns={['payment_key', 'order_id', 'payments_total', 'payment_count']}
            rows={state.aggregatedPayments.map((row) => [
              row.id,
              row.orderId,
              row.paidTotal,
              row.paymentCount,
            ])}
            highlightedIds={highlight.paymentIds}
          />
        ) : (
          <SourceTable
            title="payments"
            grain="one row per payment · order_id repeats"
            columns={['payment_id', 'order_id', 'paid_amount', 'paid_on']}
            rows={state.payments.map((row) => [row.id, row.orderId, row.paidAmount, row.paidOn])}
            highlightedIds={highlight.paymentIds}
            tone={riskTables && highlight.activeTables.includes('payments') ? 'risk' : 'neutral'}
          />
        )}
        {aggregated ? (
          <SourceTable
            title="shipments_by_order"
            grain="pre-aggregated to one row per order"
            columns={['shipment_key', 'order_id', 'shipment_count']}
            rows={state.aggregatedShipments.map((row) => [row.id, row.orderId, row.shipmentCount])}
            highlightedIds={highlight.shipmentIds}
          />
        ) : (
          <SourceTable
            title="shipments"
            grain="one row per shipment · order_id repeats"
            columns={['shipment_id', 'order_id', 'carrier']}
            rows={state.shipments.map((row) => [row.id, row.orderId, row.carrier])}
            highlightedIds={highlight.shipmentIds}
            tone={riskTables && highlight.activeTables.includes('shipments') ? 'risk' : 'neutral'}
          />
        )}
      </div>

      <FixSql mode={state.mode} />
    </section>
  )
}
