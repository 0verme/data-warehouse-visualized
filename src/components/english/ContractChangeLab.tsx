import { useMemo, useState } from 'react'
import {
  CONTRACT_CHANGES,
  contractChangeView,
  findContractChange,
  type ContractChangeId,
} from '../../features/english-contracts/model'

export function ContractChangeLab() {
  const [changeId, setChangeId] = useState<ContractChangeId>('unit-change')
  const view = useMemo(() => contractChangeView(findContractChange(changeId)), [changeId])

  return (
    <section className="contract-lab" aria-label="Data contract change lab">
      <div className="contract-lab__toolbar">
        <div>
          <span className="contract-lab__overline">One dataset · eight interface changes</span>
          <p aria-live="polite">
            Pick a producer change and see how it reaches the consumers: compatible, loud failure,
            or a silent wrong number.
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setChangeId('unit-change')}
        >
          Reset lab
        </button>
      </div>

      <div className="contract-lab__changes" role="group" aria-label="Producer change">
        {CONTRACT_CHANGES.map((change) => (
          <button
            className={`contract-lab__change${change.id === changeId ? ' is-selected' : ''}`}
            type="button"
            key={change.id}
            aria-pressed={change.id === changeId}
            onClick={() => setChangeId(change.id)}
          >
            {change.label}
          </button>
        ))}
      </div>

      <p className="contract-lab__summary" aria-live="polite">
        <strong>Producer change:</strong> {view.summary}
      </p>

      <div className="contract-lab__diff">
        <div>
          <span>Field</span>
          <strong>{view.field}</strong>
        </div>
        <div>
          <span>Before</span>
          <strong>{view.before}</strong>
        </div>
        <div>
          <span>After</span>
          <strong>{view.after}</strong>
        </div>
      </div>

      <div className="contract-lab__verdict" data-compatibility={view.compatibility}>
        <div className="contract-lab__badges">
          <span className="contract-lab__badge" data-kind="compatibility">
            {view.compatibilityLabel}
          </span>
          <span className="contract-lab__badge" data-kind="detection">
            detected: {view.detectionLabel}
          </span>
        </div>
        <strong>{view.verdict}</strong>
        <p>
          <span>Consumer effect:</span> {view.effectLabel}
        </p>
        <p>
          <span>Producer action:</span> {view.producerAction}
        </p>
      </div>

      <div className="contract-lab__process">
        <h4>Required process</h4>
        <ol>
          {view.requiredProcess.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </section>
  )
}
