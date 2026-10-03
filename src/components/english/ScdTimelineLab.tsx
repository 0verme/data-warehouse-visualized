import { useMemo, useState } from 'react'
import {
  createScdView,
  englishCustomerHistory,
  formatScdDate,
  type ScdMode,
} from '../../features/english-scd/model'
import { diffCustomerDays } from '../../utils/customer-history'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const PRESETS = [
  { label: 'Loan date', date: englishCustomerHistory.loanNote.disbursedDate },
  { label: 'Day before change', date: '2026-02-28' },
  { label: 'Change date', date: englishCustomerHistory.change.effectiveFrom },
  { label: 'Today', date: '2026-06-30' },
] as const

export function ScdTimelineLab() {
  const loanDateIndex = diffCustomerDays(
    englishCustomerHistory.initialVersion.effectiveFrom,
    englishCustomerHistory.loanNote.disbursedDate,
  )
  const [mode, setMode] = useState<ScdMode>('type2')
  const [cursorIndex, setCursorIndex] = useState(loanDateIndex)
  const { versions, view, loanMatch } = useMemo(
    () => createScdView(mode, cursorIndex),
    [mode, cursorIndex],
  )

  const isType2 = mode === 'type2'
  const loanAttributesCorrect = isType2

  return (
    <section className="scd-lab" aria-label="SCD Type 2 timeline lab">
      <div className="scd-lab__toolbar">
        <div>
          <span className="scd-lab__overline">Timeline · effective dates</span>
          <p aria-live="polite" id="scd-status">
            {isType2
              ? `History kept: ${versions.length} versions of customer C-100, addressed by effective date ranges.`
              : 'Overwrite only: one row for C-100, so the 2025 loan now reads the current attributes.'}
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setCursorIndex(loanDateIndex)}
        >
          Reset cursor
        </button>
      </div>

      <div className="scd-lab__modes" role="group" aria-label="Dimension strategy">
        <button
          className={`scd-lab__mode${!isType2 ? ' is-selected' : ''}`}
          type="button"
          aria-pressed={!isType2}
          onClick={() => setMode('type1')}
        >
          <strong>SCD Type 1 · overwrite</strong>
          <span>Update the current row in place. History is lost.</span>
        </button>
        <button
          className={`scd-lab__mode${isType2 ? ' is-selected' : ''}`}
          type="button"
          aria-pressed={isType2}
          onClick={() => setMode('type2')}
        >
          <strong>SCD Type 2 · version rows</strong>
          <span>Close the old row, insert a new one with effective dates.</span>
        </button>
      </div>

      <div className="scd-lab__timeline">
        <div className="scd-lab__timeline-heading">
          <strong>Business date cursor</strong>
          <span>
            {view.cursorDate} · change boundary {view.boundaryDate} (inclusive)
          </span>
        </div>
        <input
          className="scd-lab__range"
          type="range"
          min={0}
          max={view.totalDays}
          step={1}
          value={cursorIndex}
          aria-label="Business date cursor"
          aria-valuetext={view.cursorDate}
          onChange={(event) => setCursorIndex(Number(event.target.value))}
        />
        <div className="scd-lab__presets">
          {PRESETS.map((preset) => {
            const presetIndex = Math.min(
              Math.max(
                diffCustomerDays(englishCustomerHistory.initialVersion.effectiveFrom, preset.date),
                0,
              ),
              view.totalDays,
            )
            return (
              <button
                className={`scd-lab__preset${cursorIndex === presetIndex ? ' is-active' : ''}`}
                type="button"
                key={preset.label}
                onClick={() => setCursorIndex(presetIndex)}
              >
                {preset.label} · {preset.date}
              </button>
            )
          })}
        </div>
      </div>

      <div className="scd-lab__tables">
        <div className="scd-lab__panel">
          <div className="scd-lab__panel-heading">
            <strong>customer dimension</strong>
            <span>
              {versions.length} row{versions.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="scd-lab__table-scroll">
            <table className="scd-lab__table">
              <caption className="sr-only">Customer dimension versions</caption>
              <thead>
                <tr>
                  <th scope="col">customer_sk</th>
                  <th scope="col">customer_id</th>
                  <th scope="col">level</th>
                  <th scope="col">branch</th>
                  <th scope="col">effective_from</th>
                  <th scope="col">effective_to</th>
                  <th scope="col">is_current</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr
                    className={view.hit?.customerSk === version.customerSk ? 'is-hit' : undefined}
                    key={version.customerSk}
                  >
                    <td>{version.customerSk}</td>
                    <td>{version.customerId}</td>
                    <td>{version.level}</td>
                    <td>{version.branch}</td>
                    <td>{formatScdDate(version.effectiveFrom)}</td>
                    <td>{formatScdDate(version.effectiveTo)}</td>
                    <td>{version.isCurrent ? 'true' : 'false'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="scd-lab__panel">
          <div className="scd-lab__panel-heading">
            <strong>historical query at the cursor</strong>
            <span>{view.cursorDate}</span>
          </div>
          <div className="scd-lab__cursor" aria-live="polite">
            {view.hit ? (
              <>
                <p>
                  Matched version <code>{view.hit.customerSk}</code>:{' '}
                  <strong>
                    {view.hit.level} · {view.hit.branch}
                  </strong>
                </p>
                <p>
                  Effective range{' '}
                  <code>
                    [{view.hit.effectiveFrom}, {formatScdDate(view.hit.effectiveTo)})
                  </code>{' '}
                  — the start date is included, the end date is not.
                </p>
              </>
            ) : (
              <p>No version covers {view.cursorDate}.</p>
            )}
          </div>
        </div>
      </div>

      <div className="scd-lab__loan" data-tone={loanAttributesCorrect ? 'ok' : 'risk'}>
        <div className="scd-lab__loan-heading">
          <strong>Historical loan join</strong>
          <span>
            {englishCustomerHistory.loanNote.noteId} ·{' '}
            {englishCustomerHistory.loanNote.disbursedDate} ·{' '}
            {currency.format(englishCustomerHistory.loanNote.disbursedPrincipal)}
          </span>
        </div>
        {loanMatch ? (
          <p>
            The loan joins to <code>{loanMatch.customerSk}</code> and reads{' '}
            <strong>
              {loanMatch.level} · {loanMatch.branch}
            </strong>
            .{' '}
            {loanAttributesCorrect
              ? 'Correct: the attributes are the ones that were effective on the disbursement date.'
              : 'Wrong history: the loan now reads the current attributes instead of the 2025 ones.'}
          </p>
        ) : (
          <p>No customer version matches the disbursement date.</p>
        )}
      </div>
    </section>
  )
}
