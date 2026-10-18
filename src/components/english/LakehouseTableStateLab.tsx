import { useState } from 'react'
import { getEnglishLakehouseScenario } from '../../features/english-lakehouse/model'
import type {
  EnglishLakehouseFixture,
  EnglishLakehouseScenarioId,
} from '../../features/english-lakehouse/types'

const SCENARIOS: readonly { id: EnglishLakehouseScenarioId; label: string }[] = [
  { id: 'failed', label: 'Show failed batch' },
  { id: 'committed', label: 'Show committed v2' },
  { id: 'time-travel', label: 'Query historical v1' },
]

interface LakehouseTableStateLabProps {
  fixture: EnglishLakehouseFixture
}

export function LakehouseTableStateLab({ fixture }: LakehouseTableStateLabProps) {
  const [scenarioId, setScenarioId] = useState<EnglishLakehouseScenarioId>('failed')
  const model = getEnglishLakehouseScenario(fixture, scenarioId)

  return (
    <section
      className="english-lakehouse-lab"
      data-lakehouse-lab
      data-scenario={model.id}
      data-published-version={model.publishedVersion}
      data-query-version={model.queryTargetVersion}
      data-written-files={model.fileBatch.written}
      data-committed-files={model.fileBatch.committed}
      aria-labelledby="lakehouse-lab-title"
    >
      <header className="english-lakehouse-lab__header">
        <p className="english-lakehouse-lab__eyebrow">
          Fixed teaching fixture · read-only table-state model
        </p>
        <h3 id="lakehouse-lab-title">What does the reader see?</h3>
        <p>
          Select a precomputed view of one table update. These controls do not write files or change
          a live table.
        </p>
      </header>

      <div
        className="english-lakehouse-lab__controls"
        role="group"
        aria-label="Choose a table-state scenario"
      >
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            data-scenario-button={scenario.id}
            aria-pressed={scenarioId === scenario.id}
            onClick={() => setScenarioId(scenario.id)}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <div
        className="english-lakehouse-lab__result"
        role="status"
        aria-live="polite"
        data-scenario-result={model.id}
      >
        <p className="english-lakehouse-lab__result-title">{model.title}</p>
        <p>{model.summary}</p>
        <dl className="english-lakehouse-lab__versions">
          <div>
            <dt>Current published pointer</dt>
            <dd data-current-pointer>{`v${model.publishedVersion}`}</dd>
          </div>
          <div>
            <dt>This query targets</dt>
            <dd data-query-target>{`v${model.queryTargetVersion}`}</dd>
          </div>
          <div>
            <dt>Files in the shown update</dt>
            <dd>
              {model.fileBatch.written} written · {model.fileBatch.committed} committed of{' '}
              {model.fileBatch.attempted}
            </dd>
          </div>
        </dl>
      </div>

      <ol className="english-lakehouse-lab__chain" aria-label="Table state visibility chain">
        <li data-lakehouse-stage="files">
          <strong>Data files</strong> <span>{model.fileMessage}</span>
        </li>
        <li data-lakehouse-stage="metadata">
          <strong>Table metadata</strong> <span>{model.metadataMessage}</span>
        </li>
        <li data-lakehouse-stage="pointer">
          <strong>Published pointer</strong> <span>{model.pointerMessage}</span>
        </li>
        <li data-lakehouse-stage="reader">
          <strong>Reader</strong> <span>{model.readerMessage}</span>
        </li>
      </ol>

      <div className="english-lakehouse-lab__table-scroll">
        <table className="english-lakehouse-lab__table">
          <caption>
            {`${fixture.tableName} · reader view v${model.readerSnapshot.version} · snapshot ${model.readerSnapshot.id}`}
          </caption>
          <thead>
            <tr>
              {model.readerSnapshot.columns.map((column) => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.readerSnapshot.rows.map((row) => (
              <tr key={String(row.event_id)}>
                {model.readerSnapshot.columns.map((column) => (
                  <td key={column}>{row[column] === null ? '—' : String(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="english-lakehouse-lab__note">
        The file count and sample rows are separate views in this fixture; they do not imply one
        file per row. A commit result is scoped to this modeled table update and does not describe a
        transaction across multiple tables or systems.
      </p>
    </section>
  )
}
