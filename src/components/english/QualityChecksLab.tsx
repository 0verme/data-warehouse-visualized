import { useMemo, useState } from 'react'
import type { QualityAction, QualityScenario } from '../../features/data-quality/types'
import {
  QUALITY_RELEASE_POLICIES,
  QUALITY_SCENARIOS,
  checkViews,
  createQualityScenario,
  evaluateQualityScenario,
  releaseView,
} from '../../features/english-quality/model'

export function QualityChecksLab() {
  const [scenario, setScenario] = useState<QualityScenario>('duplicate-grain')
  const [policy, setPolicy] = useState<QualityAction>('block')

  const visualization = useMemo(() => createQualityScenario(), [])
  const evaluation = useMemo(
    () => evaluateQualityScenario(visualization, scenario, policy),
    [visualization, scenario, policy],
  )
  const checks = checkViews(evaluation)
  const release = releaseView(evaluation)
  const scenarioCopy = QUALITY_SCENARIOS.find((item) => item.id === scenario)
  const failedChecks = checks.filter((check) => check.status === 'fail')

  return (
    <section className="quality-lab" aria-label="Data quality checks lab">
      <div className="quality-lab__toolbar">
        <div>
          <span className="quality-lab__overline">
            One batch · eight checks · one release decision
          </span>
          <p aria-live="polite">
            Pick a broken batch, then switch the release policy and watch which checks fail and
            whether the partition is published.
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => {
            setScenario('duplicate-grain')
            setPolicy('block')
          }}
        >
          Reset lab
        </button>
      </div>

      <div className="quality-lab__scenarios" role="group" aria-label="Broken batch">
        {QUALITY_SCENARIOS.map((item) => (
          <button
            className={`quality-lab__scenario${item.id === scenario ? ' is-selected' : ''}`}
            type="button"
            key={item.id}
            aria-pressed={item.id === scenario}
            onClick={() => setScenario(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="quality-lab__batch" aria-live="polite">
        <strong>Batch problem:</strong> {scenarioCopy?.batch}
      </p>

      <div className="english-table-scroll">
        <table className="english-table quality-lab__checks">
          <caption>Checks executed against the batch</caption>
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Dimension</th>
              <th scope="col">Status</th>
              <th scope="col">Observed</th>
              <th scope="col">Expected</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={check.ruleId} data-tone={check.status === 'fail' ? 'wrong' : undefined}>
                <td>{check.name}</td>
                <td>{check.dimension}</td>
                <td>
                  <span className="quality-lab__status" data-status={check.status}>
                    {check.statusLabel}
                  </span>
                </td>
                <td>{check.observed}</td>
                <td>{check.expected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="quality-lab__policies" role="group" aria-label="Release policy">
        {QUALITY_RELEASE_POLICIES.map((item) => (
          <button
            className={`quality-lab__policy${item.id === policy ? ' is-selected' : ''}`}
            type="button"
            key={item.id}
            aria-pressed={item.id === policy}
            onClick={() => setPolicy(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>

      <div className="quality-lab__release" data-status={release.status} aria-live="polite">
        <div className="quality-lab__release-head">
          <span
            className="quality-lab__status"
            data-status={release.status === 'released' ? 'pass' : 'fail'}
          >
            {release.statusLabel}
          </span>
          <strong>{release.headline}</strong>
        </div>
        <ul>
          <li>
            <span>Failed checks</span>{' '}
            <strong>
              {failedChecks.length === 0
                ? 'none'
                : failedChecks.map((check) => check.name).join('; ')}
            </strong>
          </li>
          <li>
            <span>Affected outputs</span>{' '}
            <strong>
              {release.affectedOutputs.length === 0 ? 'none' : release.affectedOutputs.join(', ')}
            </strong>
          </li>
          <li>
            <span>Quarantined records</span>{' '}
            <strong>{release.quarantinedSamples.toLocaleString('en-US')}</strong>
          </li>
          <li>
            <span>Next step</span> <strong>{release.nextStep}</strong>
          </li>
        </ul>
      </div>
    </section>
  )
}
