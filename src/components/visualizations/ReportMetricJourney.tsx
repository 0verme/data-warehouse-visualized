import { useState } from 'react'
import type { ReportMetricJourneyStep, ReportMetricJourneyVisualization } from '../../types'

function JourneyStepButton({
  step,
  index,
  selected,
  onSelect,
}: {
  step: ReportMetricJourneyStep
  index: number
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <button
        className={`report-journey__step${selected ? ' is-selected' : ''}`}
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(step.id)}
      >
        <span>{String(index + 1).padStart(2, '0')}</span>
        <strong>{step.label}</strong>
        {step.value && <code>{step.value}</code>}
      </button>
    </li>
  )
}

export function ReportMetricJourney({
  visualization,
}: {
  visualization: ReportMetricJourneyVisualization
}) {
  const [selectedStepId, setSelectedStepId] = useState(visualization.steps[0]?.id ?? '')
  const selectedStep =
    visualization.steps.find((step) => step.id === selectedStepId) ?? visualization.steps[0]

  if (!selectedStep) {
    return null
  }

  return (
    <div className="report-journey">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">报表数字的数据旅程</span>
          <p aria-live="polite">当前查看：{selectedStep.title}</p>
        </div>
        <code className="report-journey__formula">{visualization.formula}</code>
      </div>

      <ol className="report-journey__steps" aria-label={`${visualization.metricLabel}的产生步骤`}>
        {visualization.steps.map((step, index) => (
          <JourneyStepButton
            key={step.id}
            step={step}
            index={index}
            selected={step.id === selectedStep.id}
            onSelect={setSelectedStepId}
          />
        ))}
      </ol>

      <section className="report-journey__detail" aria-live="polite">
        <div className="report-journey__detail-index">{selectedStep.label}</div>
        <div>
          <span className="report-journey__detail-kicker">当前步骤</span>
          <h3>{selectedStep.title}</h3>
          <p>{selectedStep.detail}</p>
        </div>
        {selectedStep.value && <strong>{selectedStep.value}</strong>}
      </section>

      <div className="report-journey__result">
        <span>{visualization.metricLabel}</span>
        <strong>{visualization.result}</strong>
      </div>
    </div>
  )
}
