import { useState } from 'react'
import { getDataSkewSnapshot, type DataSkewPlan } from '../../features/english-data-skew/model'

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function formatGb(value: number): string {
  return `${numberFormat.format(value)} GB`
}

const PLAN_LABELS: Record<DataSkewPlan, string> = {
  unsplit: 'Unsplit hot key',
  salted: 'Hot key split into four buckets',
}

export function DataSkewLab() {
  const [plan, setPlan] = useState<DataSkewPlan>('unsplit')
  const snapshot = getDataSkewSnapshot(plan)

  return (
    <div
      className="english-data-skew-lab"
      data-skew-lab
      data-skew-plan={plan}
      data-skew-total={snapshot.totalInputGb}
      data-skew-mean={snapshot.averageInputGb}
      data-skew-max={snapshot.maximumInputGb}
      data-skew-ratio={snapshot.maximumToAverageRatio}
    >
      <div className="english-data-skew-lab__header">
        <div>
          <p className="english-data-skew-lab__eyebrow">Teaching simulation · input per worker</p>
          <h3>One hot key can leave a long-tail task</h3>
          <p>
            Compare the same four-worker fixture before and after an idealized hot-key split. The
            bars show simulated input volume, not elapsed time.
          </p>
        </div>
        <span className="english-data-skew-lab__total">
          Total: {formatGb(snapshot.totalInputGb)}
        </span>
      </div>

      <div
        className="english-data-skew-lab__controls"
        role="group"
        aria-label="Compare key distributions"
      >
        {(Object.keys(PLAN_LABELS) as DataSkewPlan[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            data-skew-plan-button={candidate}
            aria-pressed={plan === candidate}
            onClick={() => setPlan(candidate)}
          >
            {PLAN_LABELS[candidate]}
          </button>
        ))}
      </div>

      <div className="english-data-skew-lab__legend" aria-label="Chart legend">
        <span data-kind="routine">Other-key input</span>
        <span data-kind="hot-key">Hot-key input</span>
      </div>

      <div
        className="english-data-skew-lab__workers"
        role="list"
        aria-label="Simulated input by worker"
      >
        {snapshot.workers.map((worker) => (
          <div
            className="english-data-skew-lab__worker"
            data-skew-worker={worker.workerId}
            data-skew-load-gb={worker.totalInputGb}
            key={worker.workerId}
            role="listitem"
          >
            <div className="english-data-skew-lab__worker-heading">
              <strong>{worker.workerId}</strong>
              <span>{formatGb(worker.totalInputGb)}</span>
            </div>
            <div
              className="english-data-skew-lab__bar"
              role="meter"
              aria-label={`${worker.workerId} simulated input`}
              aria-valuemin={0}
              aria-valuemax={snapshot.maximumInputGb}
              aria-valuenow={worker.totalInputGb}
              aria-valuetext={`${formatGb(worker.totalInputGb)} of simulated input`}
            >
              <span
                className="english-data-skew-lab__bar-segment english-data-skew-lab__bar-segment--routine"
                style={{ width: `${(worker.routineInputGb / snapshot.maximumInputGb) * 100}%` }}
              />
              <span
                className="english-data-skew-lab__bar-segment english-data-skew-lab__bar-segment--hot-key"
                style={{ width: `${(worker.hotKeyInputGb / snapshot.maximumInputGb) * 100}%` }}
              />
            </div>
            <small>
              {worker.routineInputGb > 0 ? `${formatGb(worker.routineInputGb)} other-key` : ''}
              {worker.routineInputGb > 0 && worker.hotKeyInputGb > 0 ? ' + ' : ''}
              {worker.hotKeyInputGb > 0 ? `${formatGb(worker.hotKeyInputGb)} hot-key` : ''}
            </small>
          </div>
        ))}
      </div>

      <dl className="english-data-skew-lab__metrics" aria-live="polite">
        <div>
          <dt>Average per worker</dt>
          <dd>{formatGb(snapshot.averageInputGb)}</dd>
        </div>
        <div>
          <dt>Largest worker</dt>
          <dd>
            {formatGb(snapshot.maximumInputGb)} · {snapshot.longestWorkerId}
          </dd>
        </div>
        <div>
          <dt>Largest ÷ average</dt>
          <dd>{numberFormat.format(snapshot.maximumToAverageRatio)}×</dd>
        </div>
      </dl>

      <p className="english-data-skew-lab__note" role="status" aria-live="polite">
        {plan === 'unsplit'
          ? 'Worker 4 owns the 680 GB hot key while the other workers receive 75–92 GB. The stage can wait for this straggler even when the average looks much smaller.'
          : 'The fixture’s 680 GB hot-key input is divided into four equal 170 GB buckets. Total input stays at 927 GB; real engines may distribute work differently and add merge overhead.'}
      </p>
    </div>
  )
}
