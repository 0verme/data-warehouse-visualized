import { useState } from 'react'
import {
  buildIncrementalLoadComparison,
  type LoadPlanId,
} from '../../features/english-load-comparison/model'

const comparison = buildIncrementalLoadComparison()
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const PLAN_ORDER: readonly LoadPlanId[] = ['full-load', 'event-time-only', 'arrival-cursor']

const PLAN_LABELS: Record<LoadPlanId, string> = {
  'full-load': 'Full load',
  'event-time-only': 'Event-time watermark only',
  'arrival-cursor': 'Arrival cursor + affected window',
}

export function IncrementalVsFullLoadLab() {
  const [selectedPlanId, setSelectedPlanId] = useState<LoadPlanId>('arrival-cursor')
  const plan = comparison.plans.find(({ id }) => id === selectedPlanId)!
  const lateChangeIds = new Set(comparison.lateChanges.map(({ id }) => id))

  return (
    <section
      className="incremental-load-lab"
      aria-label="Incremental versus full load lab"
      data-load-lab
    >
      <div className="incremental-load-lab__heading">
        <div>
          <span className="incremental-load-lab__overline">Deterministic change-log fixture</span>
          <p>
            The first cutoff is {comparison.initialAsOf}. Two later changes arrive by{' '}
            {comparison.finalAsOf}, but both carry an earlier event time than the saved{' '}
            {comparison.eventTimeWatermark} event-time watermark.
          </p>
        </div>
      </div>

      <div className="incremental-load-lab__source english-table-scroll">
        <table className="english-table">
          <caption>Source changes · event time is not arrival time</caption>
          <thead>
            <tr>
              <th scope="col">Change</th>
              <th scope="col">Transaction</th>
              <th scope="col">Event time</th>
              <th scope="col">Available at</th>
              <th scope="col">Revision</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {comparison.sourceChanges.map((change) => (
              <tr key={change.id} data-late-change={lateChangeIds.has(change.id)}>
                <td>
                  <code>{change.id}</code>{' '}
                  {lateChangeIds.has(change.id) && (
                    <span className="incremental-load-lab__late">late</span>
                  )}
                </td>
                <td>{change.transactionId}</td>
                <td>{change.eventTime}</td>
                <td>{change.availableAt}</td>
                <td>{`v${change.revision}`}</td>
                <td>{currency.format(change.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="incremental-load-lab__plans" role="group" aria-label="Load plan">
        {PLAN_ORDER.map((planId) => (
          <button
            className={`incremental-load-lab__plan${selectedPlanId === planId ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={selectedPlanId === planId}
            data-load-plan-button={planId}
            key={planId}
            onClick={() => setSelectedPlanId(planId)}
          >
            {PLAN_LABELS[planId]}
          </button>
        ))}
      </div>

      <div
        className="incremental-load-lab__result"
        data-load-plan={plan.id}
        data-load-equivalent={plan.equalsFullLoad}
        aria-live="polite"
      >
        <div className="incremental-load-lab__result-heading">
          <div>
            <span className="incremental-load-lab__overline">Selected plan</span>
            <h3>{plan.label}</h3>
            <p>{plan.description}</p>
          </div>
          <strong className="incremental-load-lab__verdict" data-equivalent={plan.equalsFullLoad}>
            {plan.equalsFullLoad
              ? 'Matches the full-load reference'
              : 'Does not match the full-load reference'}
          </strong>
        </div>

        <dl className="incremental-load-lab__metrics">
          <div>
            <dt>Candidate changes</dt>
            <dd data-load-candidates={plan.candidateChanges.length}>
              {plan.candidateChanges.length}
            </dd>
          </div>
          <div>
            <dt>Fixture rows in recompute scope</dt>
            <dd data-load-recompute-rows={plan.sourceRowsRecomputed}>
              {plan.sourceRowsRecomputed}
            </dd>
          </div>
          <div>
            <dt>Windows recomputed</dt>
            <dd data-load-window-count={plan.windowsRecomputed.length}>
              {plan.windowsRecomputed.length === 0 ? 'None' : plan.windowsRecomputed.join(', ')}
            </dd>
          </div>
          <div>
            <dt>Output total</dt>
            <dd data-load-total={plan.totalAmount}>{currency.format(plan.totalAmount)}</dd>
          </div>
        </dl>

        <div className="incremental-load-lab__output english-table-scroll">
          <table className="english-table">
            <caption>Materialized totals by event-time window</caption>
            <thead>
              <tr>
                <th scope="col">Window</th>
                <th scope="col">Transactions</th>
                <th scope="col">Amount</th>
                <th scope="col">Full-load amount</th>
              </tr>
            </thead>
            <tbody>
              {plan.output.map((row, index) => (
                <tr key={row.windowId} data-load-window={row.windowId}>
                  <td>{row.label}</td>
                  <td>{row.transactionCount}</td>
                  <td>{currency.format(row.amountTotal)}</td>
                  <td>{currency.format(comparison.fullLoadOutput[index]?.amountTotal ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{plan.output.reduce((total, row) => total + row.transactionCount, 0)}</td>
                <td>{currency.format(plan.totalAmount)}</td>
                <td>{currency.format(comparison.plans[0]!.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="incremental-load-lab__note">
        Fixture counts show which records and windows this model recomputes; they are not physical
        bytes, runtime, or a production benchmark. The full-load result is the correctness
        reference.
      </p>
    </section>
  )
}
