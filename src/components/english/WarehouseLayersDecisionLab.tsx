import { useState } from 'react'
import type {
  WarehouseLayerDemandId,
  WarehouseLayerPlanView,
} from '../../features/english-warehouse-layers/model'

export function WarehouseLayersDecisionLab({
  plans,
}: {
  plans: readonly WarehouseLayerPlanView[]
}) {
  const [selectedId, setSelectedId] = useState<WarehouseLayerDemandId>('two-consumers')
  const selectedPlan = plans.find(({ id }) => id === selectedId) ?? plans[0]

  if (!selectedPlan) return null

  return (
    <section
      className="english-warehouse-layers-lab"
      data-layer-lab
      data-layer-demand={selectedPlan.id}
      data-layer-architecture={selectedPlan.architecture}
      data-layer-consumer-count={selectedPlan.consumers.length}
      data-layer-repeated-work-slots={selectedPlan.repeatedWorkSlots}
      data-layer-shared-stage-count={selectedPlan.sharedStages.length}
      aria-labelledby="layer-lab-title"
    >
      <div className="english-warehouse-layers-lab__header">
        <div>
          <p className="english-warehouse-layers-lab__eyebrow">
            Fixed teaching fixture · architecture choices
          </p>
          <h3 id="layer-lab-title">Does this workload need a shared boundary?</h3>
          <p>
            Select how many products consume the same branch-level ratio definition. The diagram
            counts repeated responsibility slots or shared stages—not elapsed time or a performance
            gain.
          </p>
        </div>
      </div>

      <div
        className="english-warehouse-layers-lab__controls"
        role="group"
        aria-label="Choose the number of consumers"
      >
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            data-layer-demand-button={plan.id}
            aria-pressed={selectedPlan.id === plan.id}
            onClick={() => setSelectedId(plan.id)}
          >
            {plan.label}
          </button>
        ))}
      </div>

      <div
        className="english-warehouse-layers-lab__diagram"
        role="group"
        aria-label={selectedPlan.title}
      >
        <div
          className="english-warehouse-layers-lab__sources"
          role="list"
          aria-label="Source systems"
        >
          {selectedPlan.sourceSystems.map((source) => (
            <div className="english-warehouse-layers-lab__node" key={source.id} role="listitem">
              <span>Source</span>
              <strong>{source.label}</strong>
              <small>{source.detail}</small>
            </div>
          ))}
        </div>

        <span className="english-warehouse-layers-lab__arrow" aria-hidden="true">
          →
        </span>

        {selectedPlan.architecture === 'shared' ? (
          <ol
            className="english-warehouse-layers-lab__stages"
            aria-label="Shared layer responsibilities"
          >
            {selectedPlan.sharedStages.map((stage) => (
              <li
                className="english-warehouse-layers-lab__stage"
                data-layer-stage={stage.id}
                key={stage.id}
              >
                <span>{stage.role}</span>
                <strong>{stage.title}</strong>
                <p>{stage.detail}</p>
                <code>{stage.output}</code>
              </li>
            ))}
          </ol>
        ) : (
          <div
            className="english-warehouse-layers-lab__direct-work"
            data-layer-repeated-work
            role="list"
            aria-label="Responsibilities repeated by each consumer"
          >
            {selectedPlan.consumers.map((consumer) => (
              <section
                className="english-warehouse-layers-lab__work-copy"
                data-layer-work-copy={consumer.id}
                key={consumer.id}
                role="listitem"
              >
                <span>Independent path</span>
                <strong>{consumer.label}</strong>
                <ol>
                  {selectedPlan.repeatedResponsibilities.map((responsibility) => (
                    <li key={responsibility}>{responsibility}</li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        <span className="english-warehouse-layers-lab__arrow" aria-hidden="true">
          →
        </span>

        {selectedPlan.architecture === 'shared' ? (
          <div
            className="english-warehouse-layers-lab__consumers"
            role="list"
            aria-label="Downstream consumers"
          >
            {selectedPlan.consumers.map((consumer) => (
              <div
                className="english-warehouse-layers-lab__consumer"
                key={consumer.id}
                role="listitem"
              >
                {consumer.label}
              </div>
            ))}
          </div>
        ) : (
          <div className="english-warehouse-layers-lab__direct-summary">
            <strong>{selectedPlan.consumers.length} separate outputs</strong>
            <span>Each path carries its own copy of the responsibilities.</span>
          </div>
        )}
      </div>

      <dl className="english-warehouse-layers-lab__metrics" aria-live="polite">
        <div>
          <dt>Consumers</dt>
          <dd>{selectedPlan.consumers.length}</dd>
        </div>
        <div>
          <dt>
            {selectedPlan.architecture === 'shared' ? 'Shared stages' : 'Repeated work slots'}
          </dt>
          <dd>
            {selectedPlan.architecture === 'shared'
              ? selectedPlan.sharedStages.length
              : selectedPlan.repeatedWorkSlots}
          </dd>
        </div>
        <div>
          <dt>Path shape</dt>
          <dd>{selectedPlan.architecture === 'shared' ? 'Shared' : 'Direct'}</dd>
        </div>
      </dl>

      <p className="english-warehouse-layers-lab__note" role="status" aria-live="polite">
        {selectedPlan.note}
      </p>
    </section>
  )
}
