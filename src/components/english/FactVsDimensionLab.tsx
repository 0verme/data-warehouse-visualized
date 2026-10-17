import { useMemo, useState } from 'react'
import {
  FACT_DIMENSION_SCENARIOS,
  buildFactDimensionReference,
  scenarioById,
  type FactDimensionScenarioId,
} from '../../features/english-modeling/model'

export function FactVsDimensionLab() {
  const [scenarioId, setScenarioId] = useState<FactDimensionScenarioId>('correct-measure')
  const scenario = useMemo(() => scenarioById(scenarioId), [scenarioId])
  const reference = useMemo(() => buildFactDimensionReference(), [])

  const resultRows =
    scenario.id === 'correct-measure' || scenario.id === 'duplicate-dimension-key'
      ? scenario.id === 'correct-measure'
        ? reference.correctRows
        : reference.duplicateRows
      : scenario.id === 'dimension-filter'
        ? [{ branch_name: 'East total', total_balance: reference.eastTotal }]
        : []
  const total =
    scenario.id === 'correct-measure'
      ? reference.correctTotal
      : scenario.id === 'duplicate-dimension-key'
        ? reference.duplicateTotal
        : scenario.id === 'dimension-filter'
          ? reference.eastTotal
          : 0

  return (
    <section className="fact-dim-lab" aria-label="Fact table vs dimension table lab">
      <div className="fact-dim-lab__toolbar">
        <div>
          <span className="fact-dim-lab__overline">One question · two roles</span>
          <p aria-live="polite">
            Pick a query attempt and see which table holds the measure, which one supplies the
            context, and what a duplicated dimension key does to the total.
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setScenarioId('correct-measure')}
        >
          Reset lab
        </button>
      </div>

      <div className="fact-dim-lab__scenarios" role="group" aria-label="Query attempt">
        {FACT_DIMENSION_SCENARIOS.map((item) => (
          <button
            className={`fact-dim-lab__scenario${item.id === scenarioId ? ' is-selected' : ''}`}
            type="button"
            key={item.id}
            aria-pressed={item.id === scenarioId}
            onClick={() => setScenarioId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="fact-dim-lab__question" aria-live="polite">
        <strong>Question:</strong> {scenario.question}
      </p>

      <div className="fact-dim-lab__plan">
        <div>
          <span>Measure from</span>
          <strong>{scenario.measureSource}</strong>
        </div>
        <div>
          <span>Context from</span>
          <strong>{scenario.contextSource}</strong>
        </div>
        <div>
          <span>Join key</span>
          <strong>{scenario.joinKey}</strong>
        </div>
      </div>

      <pre className="fact-dim-lab__sql">
        <code>{scenario.sql}</code>
      </pre>

      {scenario.id === 'measure-in-dimension' ? (
        <div className="english-callout" data-tone="warning">
          <strong>Role error, not a missing join</strong>
          <p>
            dim_account describes each account. It has no balance column because the balance is a
            fact that changes every business date. Reading a measure from a dimension is a model
            mistake that no join can fix.
          </p>
        </div>
      ) : (
        <div className="english-table-scroll">
          <table className="english-table fact-dim-lab__result">
            <caption>Result after the join</caption>
            <thead>
              <tr>
                <th scope="col">branch_name</th>
                <th scope="col">total_balance</th>
              </tr>
            </thead>
            <tbody>
              {resultRows.map((row) => (
                <tr
                  key={row.branch_name}
                  data-tone={scenario.tone === 'wrong' ? 'wrong' : undefined}
                >
                  <td>{row.branch_name}</td>
                  <td>{row.total_balance.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand total</td>
                <td data-tone={scenario.tone === 'wrong' ? 'wrong' : undefined}>
                  {total.toLocaleString('en-US')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="fact-dim-lab__verdict" data-tone={scenario.tone}>
        <strong>{scenario.rule}</strong>
        {scenario.id === 'duplicate-dimension-key' && (
          <p>
            The duplicated key added {reference.inflatedBy.toLocaleString('en-US')} of repeated
            balance: {reference.correctTotal.toLocaleString('en-US')} became{' '}
            {reference.duplicateTotal.toLocaleString('en-US')}. The fact rows did not change; the
            join multiplied them.
          </p>
        )}
      </div>
    </section>
  )
}
