import { useMemo, useReducer, useState } from 'react'
import { createGrainErrorKernel } from '../../features/grain-error/steps'
import {
  createEnglishGrainErrorResult,
  englishGrainErrorDemo,
  englishGrainErrorStepSpecs,
  englishGrainOptions,
  getEnglishGrainOption,
  type EnglishGrainErrorStepId,
  type EnglishGrainId,
  type EnglishGrainOption,
} from '../../features/english-grain/model'
import type { TeachingTableRow } from '../../types'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
} from '../../utils/visualization-steps'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatCell(value: string | number | undefined): string {
  if (typeof value === 'number') {
    return currency.format(value)
  }

  return value ?? '—'
}

function DataTable({
  columns,
  rows,
  caption,
  tone,
}: {
  columns: readonly string[]
  rows: readonly TeachingTableRow[]
  caption: string
  tone?: 'wrong' | 'right'
}) {
  return (
    <div className="grain-lab__table-scroll">
      <table className="grain-lab__table" data-tone={tone}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column}>
                <code>{column}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={columns.map((column) => String(row[column] ?? '')).join('|')}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GrainPanel({ option }: { option: EnglishGrainOption }) {
  return (
    <div className="grain-lab__panel" aria-live="polite">
      <div className="grain-lab__facts">
        <div>
          <span>One row means</span>
          <strong>{option.statement}</strong>
          <p>{option.rowMeaning}</p>
        </div>
        <div>
          <span>Identity / primary key</span>
          <code>
            {option.identity} / {option.primaryKey}
          </code>
        </div>
        <div>
          <span>{option.amountLabel}</span>
          <strong>{currency.format(option.amountTotal)}</strong>
          <code>{option.amountField}</code>
        </div>
        <div>
          <span>Rows in this example</span>
          <strong>{option.rows.length}</strong>
        </div>
      </div>
      <div className="grain-lab__questions">
        <div>
          <span>This grain can answer</span>
          <ul>
            {option.canAnswer.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>It cannot answer directly</span>
          <ul>
            {option.cannotAnswer.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <DataTable
        columns={option.columns}
        rows={option.rows}
        caption={`${option.label} example rows`}
      />
    </div>
  )
}

function GrainErrorLab() {
  const result = useMemo(() => createEnglishGrainErrorResult(), [])
  const kernel = useMemo(
    () =>
      createGrainErrorKernel<EnglishGrainErrorStepId, typeof result>(
        result,
        englishGrainErrorStepSpecs,
      ),
    [result],
  )
  const [player, dispatch] = useReducer(
    applyVisualizationPlayerAction,
    kernel.size,
    createVisualizationPlayer,
  )
  const step = getCurrentVisualizationStep(player, kernel)
  const stepId = step.state.step
  const isJoined = stepId === 'joined'
  const isAggregated = stepId === 'aggregated'
  const isFixed = stepId === 'fixed'

  return (
    <section className="grain-lab__error" aria-labelledby="grain-error-title">
      <div className="grain-lab__section-heading">
        <div>
          <span className="grain-lab__overline">Wrong grain · join amplification</span>
          <h3 id="grain-error-title">Why can't the contract amount be summed after the join?</h3>
        </div>
        <p aria-live="polite">{step.description}</p>
      </div>
      <div className="grain-lab__flow" aria-label="Grain error path">
        <span className={isJoined ? 'is-current' : 'is-done'}>Contract grain</span>
        <i aria-hidden="true">→</i>
        <span className={isAggregated ? 'is-current' : ''}>Joined to disbursements</span>
        <i aria-hidden="true">→</i>
        <span className={isFixed ? 'is-current' : ''}>Back to contract grain</span>
      </div>
      <div className="grain-lab__models">
        <article className="grain-lab__model" data-tone="wrong">
          <div className="grain-lab__model-heading">
            <div>
              <span>Wrong model</span>
              <strong>One contract amount copied onto two disbursements</strong>
            </div>
            <code>{englishGrainErrorDemo.wrongMeasure}</code>
          </div>
          <DataTable
            columns={englishGrainErrorDemo.wrongColumns}
            rows={englishGrainErrorDemo.wrongRows}
            caption="Wrong join: the contract amount appears once per disbursement"
            tone="wrong"
          />
          <code className="grain-lab__sql">{englishGrainErrorDemo.wrongSql}</code>
        </article>
        {isFixed && (
          <article className="grain-lab__model" data-tone="right">
            <div className="grain-lab__model-heading">
              <div>
                <span>Fixed model</span>
                <strong>One row per contract before summing</strong>
              </div>
              <code>{englishGrainErrorDemo.fixedMeasure}</code>
            </div>
            <DataTable
              columns={englishGrainErrorDemo.fixedColumns}
              rows={englishGrainErrorDemo.fixedRows}
              caption="Fixed: the contract amount is summed at the contract grain"
              tone="right"
            />
            <code className="grain-lab__sql">{englishGrainErrorDemo.fixedSql}</code>
          </article>
        )}
      </div>
      <div className="grain-lab__actions">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={!isJoined}
          onClick={() => dispatch('next')}
        >
          Run SUM(contract_amount)
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={!isAggregated}
          onClick={() => dispatch('next')}
        >
          Fix: return to contract grain
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => dispatch('reset')}
        >
          Reset demo
        </button>
      </div>
      <div className="grain-lab__result" aria-live="polite">
        <div>
          <span>Actual contract amount</span>
          <strong>{currency.format(result.actualContractAmount)}</strong>
        </div>
        <div data-tone={isFixed ? 'right' : isAggregated ? 'wrong' : undefined}>
          <span>{isFixed ? 'SUM after the fix' : 'SUM over joined rows'}</span>
          <strong>
            {isJoined ? '—' : currency.format(isFixed ? result.fixedTotal : result.wrongTotal)}
          </strong>
        </div>
        <p>
          {isJoined && 'Look at the joined rows first, then run the aggregate.'}
          {isAggregated &&
            `Wrong grain → join amplification → wrong metric: the SUM is ${currency.format(result.wrongDifference)} too high.`}
          {isFixed &&
            `With one row per contract, the SUM returns to ${currency.format(result.fixedTotal)}.`}
        </p>
      </div>
    </section>
  )
}

export function GrainChooserLab() {
  const defaultOption =
    getEnglishGrainOption(englishGrainOptions, 'disbursement') ?? englishGrainOptions[0]
  const [selectedId, setSelectedId] = useState<EnglishGrainId>(defaultOption?.id ?? 'disbursement')
  const selectedOption = getEnglishGrainOption(englishGrainOptions, selectedId) ?? defaultOption

  if (!selectedOption) {
    return null
  }

  return (
    <section className="grain-lab" aria-label="Data warehouse grain lab">
      <div className="grain-lab__toolbar">
        <div>
          <span className="grain-lab__overline">One row · what does it represent?</span>
          <p aria-live="polite">
            Switch the grain and re-read the identity, the matching measure and the questions the
            table can answer.
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setSelectedId(defaultOption?.id ?? 'disbursement')}
        >
          Reset grain
        </button>
      </div>

      <div className="grain-lab__selector" aria-label="Grain options">
        {englishGrainOptions.map((option, index) => {
          const isSelected = option.id === selectedOption.id
          return (
            <button
              className={`grain-lab__option${isSelected ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={isSelected}
              key={option.id}
              onClick={() => setSelectedId(option.id)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{option.label}</strong>
              <small>
                {option.rows.length} rows · {option.identity}
              </small>
            </button>
          )
        })}
      </div>

      <GrainPanel option={selectedOption} />
      <GrainErrorLab />
    </section>
  )
}
