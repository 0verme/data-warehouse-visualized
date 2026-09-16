import { useState } from 'react'
import type {
  LayerEvolutionConsumer,
  LayerEvolutionDemand,
  LayerEvolutionSource,
  LayerEvolutionStage,
  LayerEvolutionVisualization,
} from '../../types'

function SourceCard({ source }: { source: LayerEvolutionSource }) {
  return (
    <div className="layer-evolution__source">
      <strong>{source.label}</strong>
      <span>{source.detail}</span>
    </div>
  )
}

function ConsumerCard({ consumer, shared }: { consumer: LayerEvolutionConsumer; shared: boolean }) {
  return (
    <article className={`layer-evolution__consumer${shared ? ' is-shared' : ''}`}>
      <strong>{consumer.label}</strong>
      <span>{consumer.detail}</span>
      {!shared && <small>各自重复抽取、清洗和计算</small>}
    </article>
  )
}

function SharedStage({ stage }: { stage: LayerEvolutionStage }) {
  return (
    <article className="layer-evolution__stage">
      <div>
        <span>{stage.label}</span>
        <strong>{stage.title}</strong>
      </div>
      <p>{stage.detail}</p>
      <code>{stage.output}</code>
    </article>
  )
}

function DemandChoice({
  demand,
  selected,
  onSelect,
}: {
  demand: LayerEvolutionDemand
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      className={`layer-evolution__choice${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(demand.id)}
    >
      <span>{demand.label}</span>
      <strong>{demand.title}</strong>
    </button>
  )
}

export function LayerEvolutionLab({
  visualization,
}: {
  visualization: LayerEvolutionVisualization
}) {
  const [selectedDemandId, setSelectedDemandId] = useState(visualization.demands[0]?.id ?? '')
  const selectedDemand =
    visualization.demands.find((demand) => demand.id === selectedDemandId) ??
    visualization.demands[0]

  if (!selectedDemand) {
    return null
  }

  const isShared = selectedDemand.architecture === 'shared'

  return (
    <div className="layer-evolution-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">分层职责演变图</span>
          <p aria-live="polite">{selectedDemand.description}</p>
        </div>
      </div>

      <div className="layer-evolution__choices" role="group" aria-label="选择下游需求数量">
        {visualization.demands.map((demand) => (
          <DemandChoice
            key={demand.id}
            demand={demand}
            selected={demand.id === selectedDemand.id}
            onSelect={setSelectedDemandId}
          />
        ))}
      </div>

      <div className={`layer-evolution__diagram${isShared ? ' is-shared' : ' is-direct'}`}>
        <div className="layer-evolution__sources">
          <span className="layer-evolution__label">并列数据源</span>
          {visualization.sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>

        <div className="layer-evolution__connector" aria-hidden="true">
          <span />
          <strong>汇集</strong>
          <b>→</b>
        </div>

        {isShared ? (
          <>
            <div className="layer-evolution__shared-stages">
              <span className="layer-evolution__label">公共加工</span>
              {visualization.sharedStages.map((stage) => (
                <SharedStage key={stage.id} stage={stage} />
              ))}
            </div>
            <div className="layer-evolution__connector" aria-hidden="true">
              <span />
              <strong>复用</strong>
              <b>→</b>
            </div>
          </>
        ) : (
          <div className="layer-evolution__direct-work">
            <span className="layer-evolution__label">每个下游各自加工</span>
            <div className="layer-evolution__repeat-badge">
              同一套规则，被复制 {selectedDemand.consumers.length} 次
            </div>
          </div>
        )}

        <div className="layer-evolution__consumers">
          <span className="layer-evolution__label">下游使用</span>
          <div>
            {selectedDemand.consumers.map((consumer) => (
              <ConsumerCard key={consumer.id} consumer={consumer} shared={isShared} />
            ))}
          </div>
        </div>
      </div>

      <div className={`layer-evolution__work${isShared ? ' is-shared' : ''}`}>
        <span className="layer-evolution__work-label">
          {isShared ? '沉淀到公共位置的职责' : '每个下游都可能重复的工作'}
        </span>
        <ul>
          {selectedDemand.repeatedWork.map((work) => (
            <li key={work}>{work}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
