import { useState } from 'react'
import type { EtlEltFixture } from '../../features/english-etl-elt/model'
import {
  buildEtlEltPlacementModel,
  type RawRetentionMode,
} from '../../features/english-etl-elt/placement'

const RETENTION_OPTIONS: readonly { id: RawRetentionMode; label: string }[] = [
  { id: 'retain', label: 'Keep the raw snapshot' },
  { id: 'discard', label: 'Do not retain a raw copy' },
]

interface EtlVsEltPlacementLabProps {
  fixture: EtlEltFixture
}

export function EtlVsEltPlacementLab({ fixture }: EtlVsEltPlacementLabProps) {
  const [retention, setRetention] = useState<RawRetentionMode>('retain')
  const model = buildEtlEltPlacementModel(fixture, retention)

  return (
    <section
      className="english-etl-elt-lab"
      data-etl-elt-lab
      data-retention={model.retention}
      data-source-rows={model.rawRows}
      data-standardized-rows={model.standardizedRows}
      data-grouped-rows={model.groupedRows}
      data-published-rows={model.publishedRows}
      data-published-amount={model.publishedAmount}
      aria-labelledby="etl-elt-lab-title"
    >
      <header className="english-etl-elt-lab__header">
        <p className="english-etl-elt-lab__eyebrow">
          Fixed teaching fixture · transformation placement
        </p>
        <h3 id="etl-elt-lab-title">Where does the same transformation run?</h3>
        <p>
          Both paths use the same five-row deposit-balance snapshot and produce the same published
          metric. The comparison changes where transformation happens and what crosses the warehouse
          boundary—not the business result.
        </p>
      </header>

      <div className="english-etl-elt-lab__result" role="status" aria-live="polite">
        <span>Shared fixture result · {model.snapshotDate}</span>
        <strong>
          {model.publishedRows} published row · CNY {model.publishedAmount.toLocaleString('en-US')}
        </strong>
        <p>
          {model.rawRows} raw rows → {model.standardizedRows} standardized detail rows →{' '}
          {model.groupedRows} grouped rows → {model.publishedRows} metric row
        </p>
      </div>

      <div className="english-etl-elt-lab__retention">
        <div>
          <strong>After publishing, is the original extract retained?</strong>
          <p>
            This explicit policy controls whether the modeled five-row snapshot can be replayed.
          </p>
        </div>
        <div
          className="english-etl-elt-lab__controls"
          role="group"
          aria-label="Choose raw snapshot retention policy"
        >
          {RETENTION_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              data-retention-button={option.id}
              aria-pressed={retention === option.id}
              onClick={() => setRetention(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="english-etl-elt-lab__paths"
        role="group"
        aria-label="ETL and ELT transformation paths"
      >
        {model.paths.map((path) => (
          <article
            className="english-etl-elt-lab__path"
            data-placement-path={path.id}
            data-boundary-rows={path.boundaryRows}
            data-retained-raw-rows={path.rawRowsRetained}
            data-replay-available={path.replayAvailable}
            key={path.id}
          >
            <p className="english-etl-elt-lab__path-label">{path.label}</p>
            <h4>{path.transformLocation}</h4>
            <ol>
              {path.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <dl className="english-etl-elt-lab__metrics">
              <div>
                <dt>Rows across warehouse boundary</dt>
                <dd>{path.boundaryRows}</dd>
              </div>
              <div>
                <dt>Raw rows retained after publish</dt>
                <dd>{path.rawRowsRetained}</dd>
              </div>
            </dl>
            <p className="english-etl-elt-lab__boundary">{path.boundaryDescription}</p>
            <p className="english-etl-elt-lab__retained-at">
              <strong>Raw copy:</strong> {path.rawRetentionLocation}
            </p>
            <p className="english-etl-elt-lab__replay" role="status" aria-live="polite">
              <strong>
                {path.replayAvailable ? 'Replay source available' : 'Replay source not retained'}
              </strong>{' '}
              <span>{path.replayDescription}</span>
            </p>
          </article>
        ))}
      </div>

      <p className="english-etl-elt-lab__note">
        These are placement and retention choices in one fixed model, not engine-performance
        measurements. A source reread is reproducible only if the same source version remains
        available; ETL/ELT labels alone guarantee neither retention nor replay.
      </p>
    </section>
  )
}
