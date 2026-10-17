import { useMemo, useState } from 'react'
import {
  OBSERVABILITY_SCENARIOS,
  OBSERVABILITY_SIGNALS,
  signalLabel,
  signalStatus,
  scenarioView,
  type ObservabilityScenario,
} from '../../features/english-observability/model'

function cellValue(
  signal: (typeof OBSERVABILITY_SIGNALS)[number]['id'],
  point: ObservabilityScenario['points'][number],
): string {
  switch (signal) {
    case 'run-status':
      return point.runStatus === 'failed' ? 'FAIL' : 'ok'
    case 'latency':
      return `${point.durationMin}m`
    case 'freshness':
      return point.freshnessLagDays === 0 ? 'current' : `+${point.freshnessLagDays}d`
    case 'volume':
      return `${(point.rows / 1000).toFixed(1)}k`
    case 'error-rate':
      return String(point.invalidRows)
    case 'backlog':
      return String(point.backlog)
  }
}

export function ObservabilitySignalsLab() {
  const [scenarioId, setScenarioId] = useState('stale-output')
  const scenario =
    OBSERVABILITY_SCENARIOS.find((item) => item.id === scenarioId) ?? OBSERVABILITY_SCENARIOS[0]
  const view = useMemo(() => scenarioView(scenario), [scenario])

  return (
    <section className="observability-lab" aria-label="Pipeline observability signals lab">
      <div className="observability-lab__toolbar">
        <div>
          <span className="observability-lab__overline">Seven runs · six signals · one story</span>
          <p aria-live="polite">
            Pick a failure pattern and find the first signal that moves — and why a green run status
            can hide it.
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setScenarioId('stale-output')}
        >
          Reset lab
        </button>
      </div>

      <div className="observability-lab__scenarios" role="group" aria-label="Failure pattern">
        {OBSERVABILITY_SCENARIOS.map((item) => (
          <button
            className={`observability-lab__scenario${item.id === scenarioId ? ' is-selected' : ''}`}
            type="button"
            key={item.id}
            aria-pressed={item.id === scenarioId}
            onClick={() => setScenarioId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="observability-lab__summary" aria-live="polite">
        <strong>{scenario.label}:</strong> {scenario.summary}
      </p>

      <div className="english-table-scroll">
        <table className="english-table observability-lab__timeline">
          <caption>Signal timeline across the seven runs</caption>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              {view.points.map((point) => (
                <th scope="col" key={point.run}>
                  {point.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OBSERVABILITY_SIGNALS.map((signal) => (
              <tr
                key={signal.id}
                data-first-fired={
                  view.firstSignal === signal.id && view.firstSignalRun
                    ? view.firstSignalRun
                    : undefined
                }
              >
                <th scope="row">{signal.label}</th>
                {view.points.map((point) => {
                  const status = signalStatus(signal.id, point)
                  return (
                    <td key={point.run} data-status={status}>
                      {cellValue(signal.id, point)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="observability-lab__verdict" data-has-signal={view.firstSignal !== null}>
        <strong>{view.headline}</strong>
        <p>
          <span>First signal</span>{' '}
          <em>
            {view.firstSignal
              ? `${signalLabel(view.firstSignal)} at run ${view.firstSignalRun}`
              : 'none'}
          </em>
        </p>
        <p>
          <span>Why the green dashboard can miss it</span> <em>{view.whyGreenDashboardMissedIt}</em>
        </p>
        <p>
          <span>What an operator does next</span> <em>{view.operatorNext}</em>
        </p>
      </div>
    </section>
  )
}
