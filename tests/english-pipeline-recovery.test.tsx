import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PipelineRecoveryLab } from '../src/components/english/PipelineRecoveryLab'
import {
  buildRecoveryReference,
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
} from '../src/features/english-recovery/model'
import { REPROCESSING_TASK_IDS } from '../src/features/dependency-reprocessing/fixture'
import {
  analyzeReprocessingImpact,
  evaluateDownstreamClosure,
} from '../src/features/dependency-reprocessing/model'

function scenarioWithAnalysis() {
  const { model, sourceInstanceId } = createRecoveryScenario()
  return { model, analysis: analyzeReprocessingImpact(model, sourceInstanceId) }
}

function createRecoveryClosure(confirmed: Readonly<Record<string, boolean>>) {
  return evaluateDownstreamClosure(createRecoveryConsumers(confirmed))
}

describe('English pipeline failure recovery model', () => {
  it('computes the impact closure for the incident business date only', () => {
    const { model, analysis } = scenarioWithAnalysis()

    expect(analysis.affectedInstanceIds).toHaveLength(8)
    expect(analysis.affectedInstanceIds.every((id) => id.endsWith('@2026-10-16'))).toBe(true)
    expect(analysis.affectedInstanceIds).not.toContain(
      `${REPROCESSING_TASK_IDS.ingestTransaction}@2026-10-15`,
    )
    expect(analysis.unaffectedInstanceIds).toContain(
      `${REPROCESSING_TASK_IDS.adsBranchReport}@2026-10-16`,
    )

    expect(analysis.redoInstanceIds).toHaveLength(4)
    expect(analysis.stopRequiredInstanceIds).toEqual([
      `${REPROCESSING_TASK_IDS.dwsMerchantTransaction}@2026-10-16`,
    ])
    expect(analysis.waitingInstanceIds).toHaveLength(3)
    expect(analysis.consumerInstanceIds).toHaveLength(2)

    // The completeness check has no SQL lineage to ods_transaction, but the
    // scheduler dependency still puts it in the closure.
    expect(analysis.evidence).toContainEqual(
      expect.objectContaining({
        fromInstanceId: `${REPROCESSING_TASK_IDS.ingestTransaction}@2026-10-16`,
        toInstanceId: `${REPROCESSING_TASK_IDS.checkTransactionCompleteness}@2026-10-16`,
        kind: 'scheduler',
      }),
    )
    expect(viewInstances(model, analysis.redoInstanceIds)[0]?.label).toBe(
      'Load ODS_TRANSACTION partition',
    )
  })

  it('stops the running aggregate and leaves every affected instance non-running', () => {
    const { model, analysis } = scenarioWithAnalysis()
    const { model: quiesced, stoppedInstanceIds } = quiesceIncident(model, analysis)

    expect(stoppedInstanceIds).toEqual([
      `${REPROCESSING_TASK_IDS.dwsMerchantTransaction}@2026-10-16`,
    ])
    const remaining = viewInstances(quiesced, analysis.affectedInstanceIds)
    expect(
      remaining.some((instance) => ['running', 'stopping', 'ready'].includes(instance.state)),
    ).toBe(false)
    // A running instance goes through stopping and stopped before waiting.
    const merchant = viewInstances(quiesced, [
      `${REPROCESSING_TASK_IDS.dwsMerchantTransaction}@2026-10-16`,
    ])[0]
    expect(merchant?.state).toBe('waiting')
    expect(
      quiesced.instances
        .find((instance) => instance.instanceId === merchant?.instanceId)
        ?.logs.map((log) => log.event),
    ).toEqual(['scheduled', 'started', 'stop-requested', 'stopped', 'waiting'])
  })

  it('blocks the replay plan until every corrected-source check passes', () => {
    const { model, analysis } = scenarioWithAnalysis()
    const { model: quiesced } = quiesceIncident(model, analysis)

    const failed = planFor(quiesced, analysis, validationFor('failed'))
    expect(failed.status).toBe('blocked')
    expect(englishValidationReason(validationFor('failed'))).toContain(
      'Row count matches the arrival control table',
    )
    expect(englishOdsChecks('failed').filter((check) => !check.passed)).toHaveLength(1)
    expect(englishOdsChecks('passed').every((check) => check.passed)).toBe(true)
    expect(englishOdsChecks('passed').find((check) => check.id === 'row-count')?.detail).toContain(
      'now matches the control table',
    )
    expect(englishOdsChecks('failed').find((check) => check.id === 'row-count')?.detail).toContain(
      'still contains fewer rows',
    )

    const ready = planFor(quiesced, analysis, validationFor('passed'))
    expect(ready.status).toBe('ready')
    if (ready.status !== 'ready') throw new Error('expected a ready plan')
    expect(ready.schedule.items.map((item) => item.taskId)).toEqual([
      REPROCESSING_TASK_IDS.ingestTransaction,
      REPROCESSING_TASK_IDS.checkTransactionCompleteness,
      REPROCESSING_TASK_IDS.dwdTransactionDetail,
      REPROCESSING_TASK_IDS.dwsMerchantTransaction,
      REPROCESSING_TASK_IDS.dwsChannelTransaction,
      REPROCESSING_TASK_IDS.adsTransactionReport,
      REPROCESSING_TASK_IDS.consumeTransactionReport,
      REPROCESSING_TASK_IDS.deliverTransactionFile,
    ])
    expect(ready.schedule.items.filter((item) => item.action === 'redo-executed')).toHaveLength(4)
  })

  it('replays the plan in dependency order and ends with every affected instance successful', () => {
    const { model, analysis } = scenarioWithAnalysis()
    const { model: quiesced } = quiesceIncident(model, analysis)
    const plan = planFor(quiesced, analysis, validationFor('passed'))
    if (plan.status !== 'ready') throw new Error('expected a ready plan')

    const replayed = replaySchedule(quiesced, plan.schedule)
    const affected = viewInstances(replayed, analysis.affectedInstanceIds)
    expect(affected.every((instance) => instance.state === 'success')).toBe(true)

    const runOrder = replayed.instances
      .filter((instance) => instance.instanceId.endsWith('@2026-10-16'))
      .flatMap((instance) => instance.logs)
      .filter((log) => log.event === 'started' && log.source === 'reprocessing')
    expect(runOrder.length).toBeGreaterThan(0)
  })

  it('closes recovery only after consumers confirm the new result', () => {
    const pending = englishClosureSummary(createRecoveryClosure({}))
    expect(pending.allConfirmed).toBe(false)
    expect(pending.openCount).toBe(2)

    const closed = englishClosureSummary(
      createRecoveryClosure({
        [REPROCESSING_TASK_IDS.consumeTransactionReport]: true,
        [REPROCESSING_TASK_IDS.deliverTransactionFile]: true,
      }),
    )
    expect(closed.allConfirmed).toBe(true)
    expect(closed.openCount).toBe(0)
  })

  it('produces a deterministic reference snapshot', () => {
    const first = buildRecoveryReference()
    const second = buildRecoveryReference()
    expect(first).toEqual(second)
    expect(first.affectedCount).toBe(8)
    expect(first.redo).toHaveLength(4)
    expect(first.stop).toHaveLength(1)
    expect(first.waiting).toHaveLength(3)
    expect(first.consumers).toHaveLength(2)
    expect(first.replayOrder.map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(first.consumerRows.map((row) => row.consumerId)).toEqual([
      `${REPROCESSING_TASK_IDS.consumeTransactionReport}@2026-10-16`,
      `${REPROCESSING_TASK_IDS.deliverTransactionFile}@2026-10-16`,
    ])
  })

  it('renders the first recovery state with server-rendered evidence', () => {
    const markup = renderToStaticMarkup(<PipelineRecoveryLab />)

    expect(markup).toContain('One incident')
    expect(markup).toContain('The bad input is already downstream')
    expect(markup).toContain('12,480')
    expect(markup).toContain('11,904')
    expect(markup).toContain('Bad input')
    expect(markup).toContain('Consumer notification')
    expect(markup).toContain('aria-live="polite"')
  })
})
