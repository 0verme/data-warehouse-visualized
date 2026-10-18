import { useState } from 'react'
import type {
  OltpOlapWorkloadId,
  OltpOlapWorkloadScenario,
} from '../../features/english-oltp-olap/model'

const WORKLOAD_ORDER: readonly OltpOlapWorkloadId[] = ['point-update', 'analytical-scan']

export function OltpVsOlapAccessLab({
  scenarios,
}: {
  scenarios: readonly OltpOlapWorkloadScenario[]
}) {
  const [selectedId, setSelectedId] = useState<OltpOlapWorkloadId>('point-update')
  const scenario = scenarios.find(({ id }) => id === selectedId) ?? scenarios[0]

  if (!scenario) return null

  const layouts = [
    { id: 'row', label: 'Row-oriented layout', estimate: scenario.rowLayout },
    { id: 'column', label: 'Column-oriented layout', estimate: scenario.columnLayout },
  ] as const

  return (
    <section
      className="english-oltp-olap-lab"
      data-access-lab
      data-workload={scenario.id}
      data-row-blocks={scenario.rowLayout.blockCount}
      data-column-blocks={scenario.columnLayout.blockCount}
      aria-labelledby="access-lab-title"
    >
      <header className="english-oltp-olap-lab__header">
        <p className="english-oltp-olap-lab__eyebrow">Deterministic page-access fixture</p>
        <h3 id="access-lab-title">What does this request need to read?</h3>
        <p>
          Choose one access pattern. Both layouts use equal-sized blocks with eight value slots; the
          comparison changes which values share a block, not the data or request.
        </p>
      </header>

      <div className="english-oltp-olap-lab__controls" role="group" aria-label="Choose a workload">
        {WORKLOAD_ORDER.map((id) => {
          const option = scenarios.find((candidate) => candidate.id === id)
          if (!option) return null

          return (
            <button
              key={id}
              type="button"
              data-workload-button={id}
              aria-pressed={scenario.id === id}
              onClick={() => setSelectedId(id)}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="english-oltp-olap-lab__request" aria-live="polite">
        <div>
          <span>Request</span>
          <strong>{scenario.title}</strong>
          <p>{scenario.request}</p>
        </div>
        <div>
          <span>Checkable fixture result</span>
          <strong>{scenario.result}</strong>
        </div>
      </div>

      <div
        className="english-oltp-olap-lab__comparison"
        role="group"
        aria-label="Modeled block reads"
      >
        {layouts.map(({ id, label, estimate }) => (
          <article
            className="english-oltp-olap-lab__layout"
            key={id}
            data-layout={id}
            data-block-count={estimate.blockCount}
            data-slots-read={estimate.slotsRead}
            data-useful-values={estimate.usefulValues}
            data-read-amplification={estimate.readAmplification}
          >
            <h4>{label}</h4>
            <dl className="english-oltp-olap-lab__metrics">
              <div>
                <dt>Blocks read</dt>
                <dd>{estimate.blockCount}</dd>
              </div>
              <div>
                <dt>Value slots touched</dt>
                <dd>{estimate.slotsRead}</dd>
              </div>
              <div>
                <dt>Requested values</dt>
                <dd>{estimate.usefulValues}</dd>
              </div>
              <div>
                <dt>Modeled read amplification</dt>
                <dd>{estimate.readAmplification}×</dd>
              </div>
            </dl>
            <details>
              <summary>See the block IDs</summary>
              <ul>
                {estimate.blocks.map((block) => (
                  <li key={block}>
                    <code>{block}</code>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>

      <p className="english-oltp-olap-lab__note" role="status" aria-live="polite">
        {scenario.note} Amplification is modeled slots touched divided by useful projected values.
      </p>
    </section>
  )
}
