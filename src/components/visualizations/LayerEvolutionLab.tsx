import { useState } from 'react'
import { LayerNetworkEvolution, type NetworkEvolutionStage } from './LayerNetworkEvolution'
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

const evolutionPhases: readonly {
  id: 'ideal' | NetworkEvolutionStage
  label: string
  description: string
}[] = [
  {
    id: 'ideal',
    label: '理想结构',
    description:
      '理想分层是划分职责的设计工具，不是运行多年的系统必然保持的样子。中间汇总是否存在，取决于是否有重复复用价值。',
  },
  {
    id: 'accumulated',
    label: '多年叠加',
    description:
      '历史需求、系统迁移和临时交付会逐步增加依赖与出口；图中的链路是示意，不代表所有团队都会经历同一条路径。',
  },
  {
    id: 'governance',
    label: '渐进治理',
    description:
      '不因图形不整齐就全量重构：新增链路可以先约定边界，存量按风险排序，并在有收益的改动中逐步收敛。',
  },
]

export function LayerEvolutionLab({
  visualization,
}: {
  visualization: LayerEvolutionVisualization
}) {
  const [selectedPhaseId, setSelectedPhaseId] =
    useState<(typeof evolutionPhases)[number]['id']>('ideal')
  const [selectedDemandId, setSelectedDemandId] = useState(
    visualization.demands.find((demand) => demand.id === 'many-consumers')?.id ??
      visualization.demands[0]?.id ??
      '',
  )
  const selectedDemand =
    visualization.demands.find((demand) => demand.id === selectedDemandId) ??
    visualization.demands[0]
  const selectedPhase =
    evolutionPhases.find((phase) => phase.id === selectedPhaseId) ?? evolutionPhases[0]

  if (!selectedDemand) {
    return null
  }

  const isShared = selectedDemand.architecture === 'shared'
  const networkStage = selectedPhase.id === 'ideal' ? null : selectedPhase.id

  return (
    <div className="layer-evolution-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">分层职责与生产演进</span>
          <p aria-live="polite">{selectedPhase.description}</p>
        </div>
      </div>

      <div
        className="layer-evolution__choices layer-evolution__phase-choices"
        role="group"
        aria-label="架构演进阶段"
      >
        {evolutionPhases.map((phase) => (
          <button
            aria-pressed={phase.id === selectedPhase.id}
            className={`layer-evolution__choice${phase.id === selectedPhase.id ? ' is-selected' : ''}`}
            key={phase.id}
            onClick={() => setSelectedPhaseId(phase.id)}
            type="button"
          >
            <span>阶段</span>
            <strong>{phase.label}</strong>
          </button>
        ))}
      </div>

      {networkStage === null ? (
        <>
          <p className="layer-evolution__demand-description" aria-live="polite">
            {selectedDemand.description}
          </p>
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
        </>
      ) : (
        <LayerNetworkEvolution stage={networkStage} />
      )}
    </div>
  )
}
