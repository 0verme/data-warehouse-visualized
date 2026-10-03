import { useState } from 'react'
import {
  getScenario,
  lineageNodes,
  scenarios,
  schedulerNodes,
  type FlowNode,
  type ScenarioId,
} from '../../features/english-lineage/model'

function NodeCard({
  node,
  state,
  note,
}: {
  node: FlowNode
  state: 'idle' | 'affected' | 'gap'
  note?: string
}) {
  return (
    <div className="lineage-lab__node" data-kind={node.kind} data-state={state}>
      <strong>{node.label}</strong>
      <span>{node.detail}</span>
      {note && <em>{note}</em>}
    </div>
  )
}

function Arrow({ label, state }: { label: string; state: 'idle' | 'affected' | 'gap' }) {
  return (
    <div className="lineage-lab__arrow" data-state={state}>
      <span aria-hidden="true">↓</span>
      <small>{label}</small>
    </div>
  )
}

export function LineageVsDependencyLab() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('baseline')
  const scenario = getScenario(scenarioId)

  const nodeState = (nodeId: string, affected: readonly string[], gap: readonly string[]) =>
    gap.includes(nodeId) ? 'gap' : affected.includes(nodeId) ? 'affected' : 'idle'

  const edgeState = (from: string, to: string, affected: readonly string[]) =>
    affected.includes(from) && affected.includes(to) ? 'affected' : 'idle'

  const [schedulerFirst, schedulerSecond] = schedulerNodes
  const lineageById = new Map(lineageNodes.map((node) => [node.id, node]))
  const mainChain = ['raw_orders', 'stg_orders', 'v_customer_orders', 'report_daily']
  const chainLabels = ['reads', 'reads', 'writes']
  const customersNode = lineageById.get('customers')
  const viewNode = lineageById.get('v_customer_orders')

  if (!schedulerFirst || !schedulerSecond || !customersNode || !viewNode) {
    return null
  }

  return (
    <section className="lineage-lab" aria-label="Data lineage vs task dependency lab">
      <div className="lineage-lab__toolbar">
        <div>
          <span className="lineage-lab__overline">One workflow · two graphs</span>
          <p aria-live="polite">
            Pick a scenario and compare what the scheduler graph and the data lineage graph each
            reveal.
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setScenarioId('baseline')}
        >
          Reset scenario
        </button>
      </div>

      <div className="lineage-lab__scenarios" role="group" aria-label="Scenario">
        {scenarios.map((item) => (
          <button
            className={`lineage-lab__scenario${item.id === scenarioId ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={item.id === scenarioId}
            key={item.id}
            onClick={() => setScenarioId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="lineage-lab__question" aria-live="polite">
        <strong>{scenario.label}:</strong> {scenario.question}
      </p>

      <div className="lineage-lab__graphs">
        <article className="lineage-lab__graph" data-graph="scheduler">
          <header>
            <span>Scheduler / task dependency</span>
            <strong>Who waits for whom</strong>
          </header>
          <div className="lineage-lab__flow">
            <NodeCard
              node={schedulerFirst}
              state={nodeState(
                schedulerFirst.id,
                scenario.schedulerAffected,
                scenario.schedulerGap,
              )}
            />
            <Arrow
              label="depends_on (declared)"
              state={edgeState(schedulerFirst.id, schedulerSecond.id, scenario.schedulerAffected)}
            />
            <NodeCard
              node={schedulerSecond}
              state={nodeState(
                schedulerSecond.id,
                scenario.schedulerAffected,
                scenario.schedulerGap,
              )}
              note={
                scenario.schedulerGap.includes(schedulerSecond.id)
                  ? 'no declared upstream'
                  : undefined
              }
            />
          </div>
          <p className="lineage-lab__missing">
            <strong>Not in this graph:</strong> <code>customers</code> is read by the view but has
            no declared <code>depends_on</code> edge to JOB_REPORT.
          </p>
        </article>

        <article className="lineage-lab__graph" data-graph="lineage">
          <header>
            <span>Data / SQL lineage</span>
            <strong>Which data produces which data</strong>
          </header>
          <div className="lineage-lab__flow">
            {mainChain.map((nodeId, index) => {
              const node = lineageById.get(nodeId)
              if (!node) return null
              return (
                <div className="lineage-lab__hop" key={nodeId}>
                  {index > 0 && (
                    <Arrow
                      label={chainLabels[index - 1] ?? 'reads'}
                      state={edgeState(mainChain[index - 1]!, nodeId, scenario.lineageAffected)}
                    />
                  )}
                  <NodeCard node={node} state={nodeState(nodeId, scenario.lineageAffected, [])} />
                </div>
              )
            })}
          </div>
          <div className="lineage-lab__branch">
            <NodeCard
              node={customersNode}
              state={nodeState(customersNode.id, scenario.lineageAffected, [])}
            />
            <span className="lineage-lab__branch-arrow" aria-hidden="true">
              reads →
            </span>
            <code>{viewNode.label}</code>
          </div>
        </article>
      </div>

      <div className="lineage-lab__conclusion" aria-live="polite">
        <strong>What this means for impact analysis</strong>
        <p>{scenario.conclusion}</p>
      </div>
    </section>
  )
}
