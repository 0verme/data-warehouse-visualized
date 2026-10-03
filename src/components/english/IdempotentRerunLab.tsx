import { useState } from 'react'
import {
  applyRerun,
  branchId,
  businessDate,
  createInitialRerunState,
  getRerunMetrics,
  setPolicy,
  type WritePolicy,
} from '../../features/english-etl/model'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const POLICY_LABELS: Record<WritePolicy, { label: string; detail: string }> = {
  append: {
    label: 'INSERT APPEND',
    detail: 'Adds the new row without touching existing rows.',
  },
  overwrite: {
    label: 'OVERWRITE PARTITION',
    detail: 'Deletes the business date, then writes the fresh result.',
  },
  merge: {
    label: 'MERGE / UPSERT',
    detail: 'Updates the existing row for the business date, or inserts it once.',
  },
}

const POLICY_ORDER: readonly WritePolicy[] = ['append', 'overwrite', 'merge']

export function IdempotentRerunLab() {
  const [state, setState] = useState(() => createInitialRerunState('append'))
  const metrics = getRerunMetrics(state)
  const lastRun = state.runs.at(-1)
  const hasRun = state.runs.length > 0
  const duplicated = metrics.rowsForPartition > 1

  return (
    <section className="etl-lab" aria-label="Idempotent ETL rerun lab">
      <div className="etl-lab__toolbar">
        <div>
          <span className="etl-lab__overline">Same input · run twice</span>
          <p aria-live="polite" id="etl-status">
            {!hasRun &&
              'The target partition is empty. Run the job once, then rerun it with the same input and compare write policies.'}
            {hasRun &&
              duplicated &&
              `Duplicate rows: ${metrics.rowsForPartition} rows now represent the same business date, and SUM(balance) is ${currency.format(metrics.balanceTotal)} instead of ${currency.format(metrics.expectedBalance)}.`}
            {hasRun &&
              !duplicated &&
              `Idempotent so far: one row represents ${businessDate}, and SUM(balance) stays ${currency.format(metrics.balanceTotal)} after the rerun.`}
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setState(createInitialRerunState(state.policy))}
        >
          Reset lab
        </button>
      </div>

      <div className="etl-lab__policies" role="group" aria-label="Write policy">
        {POLICY_ORDER.map((policy) => (
          <button
            className={`etl-lab__policy${state.policy === policy ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={state.policy === policy}
            key={policy}
            onClick={() => setState((current) => setPolicy(current, policy))}
          >
            <strong>{POLICY_LABELS[policy].label}</strong>
            <span>{POLICY_LABELS[policy].detail}</span>
          </button>
        ))}
      </div>

      <div className="etl-lab__actions">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={hasRun}
          onClick={() => setState((current) => applyRerun(current, 'initial'))}
        >
          Run job (first load)
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={!hasRun}
          onClick={() => setState((current) => applyRerun(current, current.inputVersion))}
        >
          Rerun same input
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={!hasRun}
          onClick={() => setState((current) => applyRerun(current, 'corrected'))}
        >
          Rerun with corrected input
        </button>
      </div>

      <div className="etl-lab__metrics" data-tone={duplicated ? 'risk' : hasRun ? 'ok' : 'neutral'}>
        <div>
          <span>Rows for the business date</span>
          <strong>{metrics.rowsForPartition}</strong>
        </div>
        <div data-tone={duplicated ? 'risk' : undefined}>
          <span>SUM(balance)</span>
          <strong>{currency.format(metrics.balanceTotal)}</strong>
        </div>
        <div>
          <span>Expected balance</span>
          <strong>{currency.format(metrics.expectedBalance)}</strong>
        </div>
        <div>
          <span>Duplicate rows</span>
          <strong>{metrics.duplicateRows}</strong>
        </div>
      </div>

      <div className="etl-lab__tables">
        <div className="etl-lab__panel" data-tone={duplicated ? 'risk' : 'neutral'}>
          <div className="etl-lab__panel-heading">
            <strong>target table · branch_daily_balance</strong>
            <span>
              partition: {branchId} · {businessDate}
            </span>
          </div>
          {state.rows.length === 0 ? (
            <p className="etl-lab__empty">No rows yet. Run the job to load the partition.</p>
          ) : (
            <div className="etl-lab__table-scroll">
              <table className="etl-lab__table">
                <caption className="sr-only">Rows in the target partition</caption>
                <thead>
                  <tr>
                    <th scope="col">branch_id</th>
                    <th scope="col">business_date</th>
                    <th scope="col">balance</th>
                    <th scope="col">loaded_by_run</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row) => (
                    <tr className={duplicated ? 'is-risk' : undefined} key={row.id}>
                      <td>{row.branchId}</td>
                      <td>{row.businessDate}</td>
                      <td>{currency.format(row.balance)}</td>
                      <td>{row.loadedByRun}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="etl-lab__panel">
          <div className="etl-lab__panel-heading">
            <strong>run log</strong>
            <span>{state.runs.length} executions</span>
          </div>
          {state.runs.length === 0 ? (
            <p className="etl-lab__empty">No executions recorded yet.</p>
          ) : (
            <div className="etl-lab__table-scroll">
              <table className="etl-lab__table">
                <caption className="sr-only">Execution log</caption>
                <thead>
                  <tr>
                    <th scope="col">run</th>
                    <th scope="col">policy</th>
                    <th scope="col">input</th>
                    <th scope="col">rows after</th>
                    <th scope="col">effect</th>
                  </tr>
                </thead>
                <tbody>
                  {state.runs.map((run) => (
                    <tr key={run.id}>
                      <td>#{run.id}</td>
                      <td>{POLICY_LABELS[run.policy].label}</td>
                      <td>
                        {run.inputVersion === 'initial'
                          ? currency.format(run.inputBalance)
                          : `${currency.format(run.inputBalance)} (corrected)`}
                      </td>
                      <td data-tone={run.duplicate ? 'risk' : undefined}>{run.resultingRows}</td>
                      <td>
                        {run.updatedRows > 0
                          ? '1 row updated'
                          : run.removedRows > 0
                            ? `1 deleted · 1 inserted`
                            : '1 row appended'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {lastRun && (
        <p className="etl-lab__note" aria-live="polite">
          Last execution: run #{lastRun.id} used{' '}
          <strong>{POLICY_LABELS[lastRun.policy].label}</strong> with the {lastRun.inputVersion}{' '}
          input, and the partition now holds <strong>{lastRun.resultingRows}</strong> row
          {lastRun.resultingRows === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  )
}
