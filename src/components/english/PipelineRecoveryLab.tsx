import { useMemo, useState } from 'react'
import {
  RECOVERY_PHASES,
  RECOVERY_PHASE_LABELS,
  RECOVERY_REDO_ACTION_LABELS,
  createRecoveryConsumers,
  createRecoveryScenario,
  englishClosureSummary,
  englishOdsChecks,
  englishValidationReason,
  planFor,
  quiesceIncident,
  replaySchedule,
  validationFor,
  viewInstances,
  type RecoveryInstanceView,
} from '../../features/english-recovery/model'
import {
  analyzeReprocessingImpact,
  evaluateDownstreamClosure,
} from '../../features/dependency-reprocessing/model'

function InstanceList({ items }: { items: readonly RecoveryInstanceView[] }) {
  if (items.length === 0) {
    return <p className="recovery-lab__empty">None in this group.</p>
  }
  return (
    <ul className="recovery-lab__instances">
      {items.map((instance) => (
        <li key={instance.instanceId} data-state={instance.state}>
          <span className="recovery-lab__layer">{instance.layerLabel}</span>
          <strong>{instance.label}</strong>
          <span className="recovery-lab__state">{instance.stateLabel}</span>
        </li>
      ))}
    </ul>
  )
}

export function PipelineRecoveryLab() {
  const [phase, setPhase] = useState(0)
  const [odsFixed, setOdsFixed] = useState(false)
  const [replayed, setReplayed] = useState(false)
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})

  const { model, sourceInstanceId } = useMemo(() => createRecoveryScenario(), [])
  const analysis = useMemo(
    () => analyzeReprocessingImpact(model, sourceInstanceId),
    [model, sourceInstanceId],
  )
  const quiesce = useMemo(() => quiesceIncident(model, analysis), [model, analysis])
  const validation = useMemo(() => validationFor(odsFixed ? 'passed' : 'failed'), [odsFixed])
  const checks = useMemo(() => englishOdsChecks(odsFixed ? 'passed' : 'failed'), [odsFixed])
  const plan = useMemo(
    () => planFor(quiesce.model, analysis, validation),
    [quiesce, analysis, validation],
  )
  const schedule = plan.status === 'ready' ? plan.schedule : null
  const replayedModel = useMemo(
    () => (replayed && schedule ? replaySchedule(quiesce.model, schedule) : null),
    [replayed, quiesce, schedule],
  )
  const closure = useMemo(
    () => evaluateDownstreamClosure(createRecoveryConsumers(confirmed)),
    [confirmed],
  )
  const closureSummary = englishClosureSummary(closure)

  const phaseId = RECOVERY_PHASES[phase] ?? 'bad-input'
  const redo = viewInstances(model, analysis.redoInstanceIds)
  const stop = viewInstances(model, analysis.stopRequiredInstanceIds)
  const waiting = viewInstances(model, analysis.waitingInstanceIds)
  const canAdvance =
    phaseId !== 'safe-rerun-plan' || (validation.validated && plan.status === 'ready')
  const showReplayResult = phaseId === 'validation' || phaseId === 'consumer-notification'
  const finalSuccess = replayedModel
    ? viewInstances(replayedModel, analysis.affectedInstanceIds)
    : []

  const reset = () => {
    setPhase(0)
    setOdsFixed(false)
    setReplayed(false)
    setConfirmed({})
  }

  return (
    <section className="recovery-lab" aria-label="Pipeline failure recovery lab">
      <div className="recovery-lab__toolbar">
        <div>
          <span className="recovery-lab__overline">One incident · seven recovery states</span>
          <p aria-live="polite">
            Business date 2026-10-16. Move through the recovery states and watch which instances
            stop, which are recomputed, and what the consumers still hold.
          </p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          Reset lab
        </button>
      </div>

      <div className="recovery-lab__phases" role="group" aria-label="Recovery state">
        {RECOVERY_PHASES.map((id, index) => (
          <button
            className={`recovery-lab__phase${index === phase ? ' is-selected' : ''}`}
            type="button"
            key={id}
            aria-pressed={index === phase}
            onClick={() => setPhase(index)}
          >
            <span>{index + 1}</span>
            {RECOVERY_PHASE_LABELS[id]}
          </button>
        ))}
      </div>

      <div className="recovery-lab__body">
        {phaseId === 'bad-input' && (
          <div className="recovery-lab__view" data-phase="bad-input">
            <h3>The bad input is already downstream</h3>
            <p>
              The load for business date <code>2026-10-16</code> registered 12,480 rows in the
              arrival control table, but the partition contains 11,904 — 576 transactions never
              arrived, and one arrived with the wrong amount. By the time the correction is
              available, the DWD detail has already succeeded and the merchant aggregate is still
              running.
            </p>
            <div className="english-table-scroll">
              <table className="english-table">
                <caption>Synthetic control-table evidence for the incident partition</caption>
                <thead>
                  <tr>
                    <th scope="col">Check</th>
                    <th scope="col">Control table</th>
                    <th scope="col">Partition</th>
                    <th scope="col">Observable effect</th>
                  </tr>
                </thead>
                <tbody>
                  <tr data-tone="wrong">
                    <td>Row count</td>
                    <td>12,480</td>
                    <td>11,904</td>
                    <td>576 transactions missing</td>
                  </tr>
                  <tr data-tone="wrong">
                    <td>
                      <code>TX-90488</code> amount
                    </td>
                    <td>
                      <code>480.00</code>
                    </td>
                    <td>
                      <code>400.00</code>
                    </td>
                    <td>Merchant and channel totals are understated</td>
                  </tr>
                  <tr data-tone="right">
                    <td>
                      <code>transaction_id</code> uniqueness
                    </td>
                    <td>unique</td>
                    <td>unique</td>
                    <td>No duplicate-key signal to alert on</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="recovery-lab__note">
              The run history looks healthy: every finished instance is <code>success</code>. The
              failure is in the data, not in the job status.
            </p>
          </div>
        )}

        {phaseId === 'impact-discovery' && (
          <div className="recovery-lab__view" data-phase="impact-discovery">
            <h3>Follow lineage and scheduler edges, not task names</h3>
            <p>
              The closure starts at the polluted partition and follows two edge types: SQL lineage
              (including <code>LEFT JOIN</code>) and declared scheduler dependencies. The result is
              8 instances on the incident business date: 4 already executed, 1 still running, 3 not
              yet started.
            </p>
            <div className="recovery-lab__groups">
              <article data-tone="risk">
                <h4>Stop or block first · {stop.length}</h4>
                <InstanceList items={stop} />
              </article>
              <article>
                <h4>Recompute after validation · {redo.length}</h4>
                <InstanceList items={redo} />
              </article>
              <article>
                <h4>Waiting for dependencies · {waiting.length}</h4>
                <InstanceList items={waiting} />
              </article>
            </div>
            <p>
              The completeness check has no SQL lineage to <code>ods_transaction</code>, but it is
              still affected because it declares a scheduler dependency on the load. A branch chain
              that reads another source is <strong>not</strong> affected: <code>ingest.branch</code>
              , <code>transform.dim-branch</code> and <code>publish.ads-branch-report</code> stay
              untouched, and so does every instance for business date <code>2026-10-15</code>.
            </p>
          </div>
        )}

        {phaseId === 'quiesce-running' && (
          <div className="recovery-lab__view" data-phase="quiesce-running">
            <h3>Stop the running instance before replaying anything</h3>
            <p>
              The merchant aggregate is still running and will read the corrupted DWD result. It
              must go through <code>running → stopping → stopped → waiting</code> before the replay
              plan can start.
            </p>
            <InstanceList
              items={stop.map((instance) => ({
                ...instance,
                state: 'running',
                stateLabel: 'running',
              }))}
            />
            <div className="english-callout" data-tone="info">
              <strong>Side effects are part of the stop</strong>
              <p>
                Confirm that no partial file was made visible and no external push needs recalling.
                A stopped task is quiesced, not recovered: it now waits for the replay.
              </p>
            </div>
            <p className="recovery-lab__note">
              Quiesce result: {quiesce.stoppedInstanceIds.length} stopped,{' '}
              {quiesce.blockedInstanceIds.length} blocked before first execution, 0 unaffected
              instances touched.
            </p>
          </div>
        )}

        {phaseId === 'safe-rerun-plan' && (
          <div className="recovery-lab__view" data-phase="safe-rerun-plan">
            <h3>Validate the corrected source before releasing the replay</h3>
            <p>
              A rerun is only safe once the source of the bad input is fixed and checked. Switch the
              partition state and watch the gate open or stay closed.
            </p>
            <div className="recovery-lab__gate" role="group" aria-label="Corrected source state">
              <button
                className={`recovery-lab__gate-option${!odsFixed ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={!odsFixed}
                onClick={() => setOdsFixed(false)}
              >
                Partition still incomplete
              </button>
              <button
                className={`recovery-lab__gate-option${odsFixed ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={odsFixed}
                onClick={() => setOdsFixed(true)}
              >
                Partition corrected and re-validated
              </button>
            </div>
            <ul className="recovery-lab__checks">
              {checks.map((check) => (
                <li key={check.id} data-passed={check.passed}>
                  <strong>
                    {check.passed ? 'PASS' : 'FAIL'} · {check.label}
                  </strong>
                  <span>{check.detail}</span>
                </li>
              ))}
            </ul>
            {plan.status === 'blocked' ? (
              <div className="english-callout" data-tone="warning">
                <strong>Replay blocked</strong>
                <p>{englishValidationReason(validation)}</p>
              </div>
            ) : (
              <div className="english-table-scroll">
                <table className="english-table">
                  <caption>Replay plan in dependency order</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Task</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.schedule.items.map((item, index) => (
                      <tr key={item.instanceId}>
                        <td>{index + 1}</td>
                        <td>{item.taskId}</td>
                        <td>{RECOVERY_REDO_ACTION_LABELS[item.action]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {phaseId === 'ordered-replay' && (
          <div className="recovery-lab__view" data-phase="ordered-replay">
            <h3>Replay upstream first, then let each branch converge once</h3>
            <p>
              The schedule sorts the affected instances by declared dependencies and SQL lineage.
              Two branches meet at the ADS report; the report runs once after both branches have
              been recomputed.
            </p>
            <ol className="recovery-lab__order">
              {(schedule?.items ?? []).map((item, index) => (
                <li key={item.instanceId} data-done={replayed}>
                  <span>{index + 1}</span>
                  <strong>{item.taskId}</strong>
                  <em>{RECOVERY_REDO_ACTION_LABELS[item.action]}</em>
                </li>
              ))}
            </ol>
            <button
              className="button button--primary button--small"
              type="button"
              disabled={!schedule || replayed}
              onClick={() => setReplayed(true)}
            >
              Replay the plan in order
            </button>
            {replayed && (
              <p className="recovery-lab__note" aria-live="polite">
                Replayed {schedule?.items.length ?? 0} instances. Each recomputed instance now ends
                in <code>success</code> — for the recomputed business date only.
              </p>
            )}
          </div>
        )}

        {phaseId === 'validation' && (
          <div className="recovery-lab__view" data-phase="validation">
            <h3>Verify the result, and expect a second correction to invalidate it</h3>
            {replayed ? (
              <>
                <p>
                  All 8 affected instances are successful again. The previous business date and the
                  unrelated branch chain were never restarted.
                </p>
                <InstanceList
                  items={finalSuccess.map((instance) => ({
                    ...instance,
                    state: 'success',
                    stateLabel: 'success',
                  }))}
                />
              </>
            ) : (
              <p>
                The replay has not been executed in this lab run. Go back to the ordered replay
                state and run the plan.
              </p>
            )}
            <div className="english-callout" data-tone="info">
              <strong>Instance success is not recovery</strong>
              <p>
                If the corrected partition turns out to be wrong again, the recomputed{' '}
                <code>success</code> instances for 2026-10-16 must be invalidated back to{' '}
                <code>waiting</code> — the history stays, the result does not.
              </p>
            </div>
          </div>
        )}

        {phaseId === 'consumer-notification' && (
          <div className="recovery-lab__view" data-phase="consumer-notification">
            <h3>Close the loop with the consumers that read the old result</h3>
            <p>
              Two consumers already loaded the pre-recovery ADS result. Recomputing the table does
              not update them: each needs an explicit reload or refresh and a confirmation.
            </p>
            <ul className="recovery-lab__consumers">
              {closure.rows.map((row) => (
                <li key={row.consumerId} data-consumed={row.consumedOldResult}>
                  <div>
                    <strong>{row.label}</strong>
                    <span>
                      {row.consumedOldResult
                        ? 'Loaded the pre-recovery result'
                        : 'Waiting for a result'}
                    </span>
                  </div>
                  <span className="recovery-lab__action">{row.actionLabel}</span>
                  <button
                    className="button button--quiet button--small"
                    type="button"
                    disabled={row.confirmation === 'confirmed'}
                    onClick={() =>
                      setConfirmed((current) => ({
                        ...current,
                        [row.consumerId.split('@')[0] ?? row.consumerId]: true,
                      }))
                    }
                  >
                    {row.confirmation === 'confirmed' ? 'Confirmed' : 'Confirm reload'}
                  </button>
                </li>
              ))}
            </ul>
            <p className="recovery-lab__note" aria-live="polite">
              {closureSummary.headline}
            </p>
            {showReplayResult && !closureSummary.allConfirmed && (
              <p className="recovery-lab__note">
                The transaction branch is internally consistent again, but the recovery is still
                open while a consumer holds the old number.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="recovery-lab__footer">
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={phase === 0}
          onClick={() => setPhase((current) => Math.max(0, current - 1))}
        >
          Back
        </button>
        <span className="recovery-lab__progress">
          State {phase + 1} / {RECOVERY_PHASES.length}: {RECOVERY_PHASE_LABELS[phaseId]}
        </span>
        <button
          className="button button--primary button--small"
          type="button"
          disabled={phase === RECOVERY_PHASES.length - 1 || !canAdvance}
          onClick={() => setPhase((current) => Math.min(RECOVERY_PHASES.length - 1, current + 1))}
        >
          Next
        </button>
      </div>
    </section>
  )
}
