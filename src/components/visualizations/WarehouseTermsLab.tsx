import { useState } from 'react'
import type {
  WarehouseTermDefinition,
  WarehouseTermScenario,
  WarehouseTermsVisualization,
} from '../../types'

function TermCard({ term }: { term: WarehouseTermDefinition }) {
  return (
    <article className="warehouse-terms__term-card">
      <div className="warehouse-terms__term-topline">
        <span>{term.term}</span>
      </div>
      <div className="warehouse-terms__term-solve">
        <span>解决什么问题</span>
        <p>{term.solves}</p>
      </div>
      <div className="warehouse-terms__term-definition">
        <span>中文含义</span>
        <strong>{term.chinese}</strong>
      </div>
      <div className="warehouse-terms__term-full-name">
        <span>英文全称</span>
        <code>{term.fullName}</code>
      </div>
      <span className="warehouse-terms__relation">{term.relation}</span>
    </article>
  )
}

function ScenarioButton({
  scenario,
  selected,
  onSelect,
}: {
  scenario: WarehouseTermScenario
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      className={`warehouse-terms__scenario${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(scenario.id)}
    >
      <span>{scenario.label}</span>
      <strong>{scenario.prompt}</strong>
    </button>
  )
}

export function WarehouseTermsLab({
  visualization,
}: {
  visualization: WarehouseTermsVisualization
}) {
  const [selectedScenarioId, setSelectedScenarioId] = useState(visualization.scenarios[0]?.id ?? '')
  const selectedScenario =
    visualization.scenarios.find((scenario) => scenario.id === selectedScenarioId) ??
    visualization.scenarios[0]

  if (!selectedScenario) {
    return null
  }

  const groups = [...new Set(visualization.terms.map((term) => term.group))]
  const getTerm = (id: WarehouseTermDefinition['id']) =>
    visualization.terms.find((term) => term.id === id)

  return (
    <div className="warehouse-terms">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">术语翻译台</span>
          <p aria-live="polite">先看它在实际链路里解决什么问题，再记住英文全称。</p>
        </div>
      </div>

      <div className="warehouse-terms__groups">
        {groups.map((group) => {
          const terms = visualization.terms.filter((term) => term.group === group)
          const groupLabel = terms[0]?.groupLabel ?? group
          return (
            <section className="warehouse-terms__group" key={group}>
              <div className="warehouse-terms__group-heading">
                <span>{groupLabel}</span>
                <p>
                  {terms.length === 1 ? '它描述一个位置或职责。' : '它们描述同一类问题的不同做法。'}
                </p>
              </div>
              <div className="warehouse-terms__term-grid">
                {terms.map((term) => (
                  <TermCard key={term.id} term={term} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <section
        className="warehouse-terms__scenarios"
        aria-labelledby="warehouse-terms-scenario-title"
      >
        <div className="warehouse-terms__scenario-heading">
          <div>
            <span className="eyebrow eyebrow--small">放回具体场景</span>
            <h3 id="warehouse-terms-scenario-title">这句话更接近哪个术语？</h3>
          </div>
          <p>选择一句工程现场的话，查看它为什么归到这个类别。</p>
        </div>
        <div className="warehouse-terms__scenario-list">
          {visualization.scenarios.map((scenario) => (
            <ScenarioButton
              key={scenario.id}
              scenario={scenario}
              selected={scenario.id === selectedScenario.id}
              onSelect={setSelectedScenarioId}
            />
          ))}
        </div>
        <div className="warehouse-terms__answer" aria-live="polite">
          <span className="warehouse-terms__answer-label">判断结果</span>
          <strong>{selectedScenario.answerLabel}</strong>
          <p>{selectedScenario.explanation}</p>
          <div>
            {selectedScenario.answerTermIds.map((termId) => {
              const term = getTerm(termId)
              return term ? <code key={term.id}>{term.term}</code> : null
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
