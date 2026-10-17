/**
 * English presentation layer for the pipeline failure recovery page.
 *
 * The engineering model lives in `src/features/dependency-reprocessing`
 * (Chinese teaching series #221). This module only:
 * - builds the deterministic incident scenario from that kernel;
 * - maps task / state / action semantics to English labels;
 * - exposes serializable reference data so the page and its tests can be
 *   checked without clicking the lab.
 *
 * It intentionally does not re-implement impact analysis, scheduling,
 * validation or consumer closure logic.
 */
import {
  createOdsValidationChecks,
  createReprocessingFixture,
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_SOURCE_INSTANCE_ID,
  REPROCESSING_TASK_IDS,
  type OdsValidationFixtureResult,
} from '../dependency-reprocessing/fixture'
import {
  analyzeReprocessingImpact,
  applyAffectedStopAndWait,
  applyReprocessingAction,
  classifyInstanceExecution,
  createRedoSchedule,
  evaluateDownstreamClosure,
  evaluateOdsValidation,
} from '../dependency-reprocessing/model'
import type {
  ConsumerEvidence,
  DownstreamClosure,
  ImpactAnalysis,
  OdsValidationResult,
  RedoSchedule,
  RedoScheduleItem,
  RedoScheduleResult,
  ReprocessingLayer,
  ReprocessingModel,
  ReprocessingTaskInstance,
  TaskInstanceState,
} from '../dependency-reprocessing/types'

export const RECOVERY_BUSINESS_DATE = REPROCESSING_INCIDENT_BUSINESS_DATE
export const RECOVERY_SOURCE_INSTANCE_ID = REPROCESSING_SOURCE_INSTANCE_ID

export const RECOVERY_PHASES = [
  'bad-input',
  'impact-discovery',
  'quiesce-running',
  'safe-rerun-plan',
  'ordered-replay',
  'validation',
  'consumer-notification',
] as const

export type RecoveryPhaseId = (typeof RECOVERY_PHASES)[number]

export const RECOVERY_PHASE_LABELS: Readonly<Record<RecoveryPhaseId, string>> = {
  'bad-input': 'Bad input',
  'impact-discovery': 'Impact discovery',
  'quiesce-running': 'Quiesce running work',
  'safe-rerun-plan': 'Safe rerun plan',
  'ordered-replay': 'Ordered replay',
  validation: 'Validation',
  'consumer-notification': 'Consumer notification',
}

/** English labels for the shared banking teaching task ids. */
export const RECOVERY_TASK_LABELS: Readonly<Record<string, string>> = {
  [REPROCESSING_TASK_IDS.ingestTransaction]: 'Load ODS_TRANSACTION partition',
  [REPROCESSING_TASK_IDS.ingestAccount]: 'Load ODS_ACCOUNT partition',
  [REPROCESSING_TASK_IDS.ingestCustomer]: 'Load ODS_CUSTOMER partition',
  [REPROCESSING_TASK_IDS.ingestMerchant]: 'Load ODS_MERCHANT partition',
  [REPROCESSING_TASK_IDS.checkTransactionCompleteness]: 'Check ODS_TRANSACTION completeness',
  [REPROCESSING_TASK_IDS.dwdTransactionDetail]: 'Build DWD transaction detail',
  [REPROCESSING_TASK_IDS.dwsMerchantTransaction]: 'Aggregate DWS merchant daily',
  [REPROCESSING_TASK_IDS.dwsChannelTransaction]: 'Aggregate DWS channel daily',
  [REPROCESSING_TASK_IDS.adsTransactionReport]: 'Publish ADS transaction report',
  [REPROCESSING_TASK_IDS.consumeTransactionReport]: 'Push transaction report',
  [REPROCESSING_TASK_IDS.deliverTransactionFile]: 'Deliver transaction file',
  [REPROCESSING_TASK_IDS.ingestBranch]: 'Load ODS_BRANCH partition',
  [REPROCESSING_TASK_IDS.dimBranch]: 'Build branch dimension',
  [REPROCESSING_TASK_IDS.adsBranchReport]: 'Publish ADS branch report',
  [REPROCESSING_TASK_IDS.consumeBranchReport]: 'Subscribe branch report',
}

export const RECOVERY_LAYER_LABELS: Readonly<Record<ReprocessingLayer, string>> = {
  ods: 'ODS',
  dwd: 'DWD',
  dws: 'DWS',
  ads: 'ADS',
  consumer: 'Consumer',
}

export const RECOVERY_STATE_LABELS: Readonly<Record<TaskInstanceState, string>> = {
  waiting: 'waiting',
  ready: 'ready',
  running: 'running',
  stopping: 'stopping',
  stopped: 'stopped',
  success: 'success',
  failed: 'failed',
  blocked: 'blocked',
  skipped: 'skipped',
}

export const RECOVERY_REDO_ACTION_LABELS: Readonly<Record<RedoScheduleItem['action'], string>> = {
  'redo-executed': 'Recompute (already executed)',
  'redo-after-stop': 'Recompute after stop',
  'run-waiting': 'Run when dependencies are satisfied',
}

const ODS_CHECK_LABELS: Readonly<
  Record<string, { label: string; passDetail: string; failDetail: string }>
> = {
  'partition-arrived': {
    label: 'Partition file arrived and registered',
    passDetail:
      'The corrected file for the 2026-10-16 business date is registered in the arrival control table.',
    failDetail: 'No corrected file is registered for the incident partition yet.',
  },
  'row-count': {
    label: 'Row count matches the arrival control table',
    passDetail:
      'The corrected partition now matches the control table row count: the 576 missing transactions are present.',
    failDetail:
      'The corrected partition still contains fewer rows than the control table registered, so the gate stays closed.',
  },
  'transaction-identity': {
    label: 'transaction_id is present and unique',
    passDetail: 'Primary-key uniqueness check passed on the corrected partition.',
    failDetail: 'transaction_id is missing or duplicated on the corrected partition.',
  },
  'merchant-reference': {
    label: 'Merchant references resolve under the allowed LEFT JOIN',
    passDetail:
      'The merchant join is declared LEFT JOIN, so a missing merchant does not block the replay.',
    failDetail: 'Merchant reference resolution failed outside the allowed LEFT JOIN semantics.',
  },
}

export interface RecoveryInstanceView {
  instanceId: string
  taskId: string
  label: string
  layer: ReprocessingLayer
  layerLabel: string
  state: TaskInstanceState
  stateLabel: string
  executionClass: 'already-executed' | 'needs-stop' | 'not-yet-executed'
}

export interface RecoveryReference {
  businessDate: string
  sourceInstanceId: string
  sourceTable: string
  affectedCount: number
  redo: readonly RecoveryInstanceView[]
  stop: readonly RecoveryInstanceView[]
  waiting: readonly RecoveryInstanceView[]
  consumers: readonly RecoveryInstanceView[]
  untouchedTaskIds: readonly string[]
  replayOrder: readonly {
    order: number
    taskId: string
    label: string
    action: RedoScheduleItem['action']
    actionLabel: string
  }[]
  odsChecks: readonly { id: string; label: string; detail: string; passed: boolean }[]
  consumerRows: readonly {
    consumerId: string
    label: string
    requiredAction: string
    actionLabel: string
    confirmation: 'pending' | 'confirmed'
    note: string
  }[]
}

export function taskLabel(taskId: string): string {
  return RECOVERY_TASK_LABELS[taskId] ?? taskId
}

export function createRecoveryScenario(): {
  model: ReprocessingModel
  sourceInstanceId: string
  businessDate: string
} {
  return {
    model: createReprocessingFixture({ variant: 'mid-flight' }),
    sourceInstanceId: RECOVERY_SOURCE_INSTANCE_ID,
    businessDate: RECOVERY_BUSINESS_DATE,
  }
}

function toInstanceView(instance: ReprocessingTaskInstance): RecoveryInstanceView {
  const taskId = instance.taskId
  return {
    instanceId: instance.instanceId,
    taskId,
    label: taskLabel(taskId),
    layer: instanceLayer(taskId),
    layerLabel: RECOVERY_LAYER_LABELS[instanceLayer(taskId)],
    state: instance.state,
    stateLabel: RECOVERY_STATE_LABELS[instance.state],
    executionClass: classifyInstanceExecution(instance.state),
  }
}

const LAYER_BY_TASK_ID: Readonly<Record<string, ReprocessingLayer>> = {
  [REPROCESSING_TASK_IDS.ingestTransaction]: 'ods',
  [REPROCESSING_TASK_IDS.ingestAccount]: 'ods',
  [REPROCESSING_TASK_IDS.ingestCustomer]: 'ods',
  [REPROCESSING_TASK_IDS.ingestMerchant]: 'ods',
  [REPROCESSING_TASK_IDS.checkTransactionCompleteness]: 'ods',
  [REPROCESSING_TASK_IDS.dwdTransactionDetail]: 'dwd',
  [REPROCESSING_TASK_IDS.dwsMerchantTransaction]: 'dws',
  [REPROCESSING_TASK_IDS.dwsChannelTransaction]: 'dws',
  [REPROCESSING_TASK_IDS.adsTransactionReport]: 'ads',
  [REPROCESSING_TASK_IDS.consumeTransactionReport]: 'consumer',
  [REPROCESSING_TASK_IDS.deliverTransactionFile]: 'consumer',
  [REPROCESSING_TASK_IDS.ingestBranch]: 'ods',
  [REPROCESSING_TASK_IDS.dimBranch]: 'dwd',
  [REPROCESSING_TASK_IDS.adsBranchReport]: 'ads',
  [REPROCESSING_TASK_IDS.consumeBranchReport]: 'consumer',
}

function instanceLayer(taskId: string): ReprocessingLayer {
  return LAYER_BY_TASK_ID[taskId] ?? 'ods'
}

export function viewInstances(
  model: ReprocessingModel,
  instanceIds: readonly string[],
): readonly RecoveryInstanceView[] {
  return instanceIds
    .map((instanceId) => model.instances.find((instance) => instance.instanceId === instanceId))
    .filter((instance): instance is ReprocessingTaskInstance => Boolean(instance))
    .map(toInstanceView)
}

/** Apply the stop / wait sequence to the running instance in the incident. */
export function quiesceIncident(
  model: ReprocessingModel,
  analysis: ImpactAnalysis,
  at = '2026-10-17 02:10:00',
) {
  return applyAffectedStopAndWait(model, analysis, at, {
    sideEffectDisposition:
      'Confirmed: no partial output files were made visible and no external push needs recalling',
  })
}

export function validationFor(outcome: OdsValidationFixtureResult): OdsValidationResult {
  return evaluateOdsValidation(RECOVERY_BUSINESS_DATE, createOdsValidationChecks(outcome))
}

export function englishOdsChecks(
  outcome: OdsValidationFixtureResult,
): readonly { id: string; label: string; detail: string; passed: boolean }[] {
  return createOdsValidationChecks(outcome).map((check) => {
    const english = ODS_CHECK_LABELS[check.id]
    return {
      id: check.id,
      label: english?.label ?? check.id,
      detail: check.passed ? (english?.passDetail ?? check.id) : (english?.failDetail ?? check.id),
      passed: check.passed,
    }
  })
}

export function englishValidationReason(validation: OdsValidationResult): string {
  if (validation.validated) return ''
  const failed = validation.checks.filter((check) => !check.passed)
  if (failed.length === 0) return 'No ODS checks are available, so replay cannot be released.'
  return `Replay is blocked until every source check passes: ${failed
    .map((check) => ODS_CHECK_LABELS[check.id]?.label ?? check.id)
    .join('; ')}.`
}

export function planFor(
  model: ReprocessingModel,
  analysis: ImpactAnalysis,
  validation: OdsValidationResult,
): RedoScheduleResult {
  return createRedoSchedule(model, analysis, {
    validation,
    simulatorPlanId: `RECOVERY-PLAN:${RECOVERY_BUSINESS_DATE}`,
  })
}

export function buildRecoveryReference(): RecoveryReference {
  const { model, sourceInstanceId, businessDate } = createRecoveryScenario()
  const analysis = analyzeReprocessingImpact(model, sourceInstanceId)
  const quiesce = quiesceIncident(model, analysis)
  const validation = validationFor('passed')
  const plan = planFor(quiesce.model, analysis, validation)
  const schedule = plan.status === 'ready' ? plan.schedule : null

  const redo = viewInstances(model, analysis.redoInstanceIds)
  const stop = viewInstances(model, analysis.stopRequiredInstanceIds)
  const waiting = viewInstances(model, analysis.waitingInstanceIds)
  const consumers = viewInstances(model, analysis.consumerInstanceIds)

  const replayOrder =
    schedule?.items.map((item, index) => ({
      order: index + 1,
      taskId: item.taskId,
      label: taskLabel(item.taskId),
      action: item.action,
      actionLabel: RECOVERY_REDO_ACTION_LABELS[item.action],
    })) ?? []

  const consumerRows = evaluateDownstreamClosure(createRecoveryConsumers()).rows.map((row) => ({
    consumerId: row.consumerId,
    label: row.label,
    requiredAction: row.requiredAction,
    actionLabel: englishActionLabel(row.requiredAction),
    confirmation: row.confirmation,
    note: englishConsumerNote(row.consumedOldResult, false, row.confirmation),
  }))

  return {
    businessDate,
    sourceInstanceId,
    sourceTable: 'ods_transaction',
    affectedCount: analysis.affectedInstanceIds.length,
    redo,
    stop,
    waiting,
    consumers,
    untouchedTaskIds: [
      REPROCESSING_TASK_IDS.ingestBranch,
      REPROCESSING_TASK_IDS.dimBranch,
      REPROCESSING_TASK_IDS.adsBranchReport,
    ],
    replayOrder,
    odsChecks: englishOdsChecks('passed'),
    consumerRows,
  }
}

export function createRecoveryConsumers(
  confirmed: Readonly<Record<string, boolean>> = {},
): readonly ConsumerEvidence[] {
  const adsInstance = `${REPROCESSING_TASK_IDS.adsTransactionReport}@${RECOVERY_BUSINESS_DATE}`
  return [
    {
      consumerId: `${REPROCESSING_TASK_IDS.consumeTransactionReport}@${RECOVERY_BUSINESS_DATE}`,
      label: 'Transaction report push (interface)',
      kind: 'interface',
      consumedInstanceId: adsInstance,
      consumedNewResult: false,
      confirmation: confirmed[REPROCESSING_TASK_IDS.consumeTransactionReport]
        ? 'confirmed'
        : 'pending',
    },
    {
      consumerId: `${REPROCESSING_TASK_IDS.deliverTransactionFile}@${RECOVERY_BUSINESS_DATE}`,
      label: 'Transaction file delivery',
      kind: 'file',
      consumedInstanceId: adsInstance,
      consumedNewResult: false,
      confirmation: confirmed[REPROCESSING_TASK_IDS.deliverTransactionFile]
        ? 'confirmed'
        : 'pending',
    },
  ]
}

export function englishActionLabel(action: string): string {
  switch (action) {
    case 'reload':
      return 'Reload the new result'
    case 'refresh':
      return 'Refresh the cached report'
    case 'correct':
      return 'Correct and resubmit'
    default:
      return 'No action required'
  }
}

function englishConsumerNote(
  consumedOldResult: boolean,
  consumedNewResult: boolean,
  confirmation: 'pending' | 'confirmed',
): string {
  if (consumedOldResult) {
    return 'This consumer loaded the pre-recovery result for the business date.'
  }
  if (consumedNewResult && confirmation === 'pending') {
    return 'The consumer has loaded the new result and confirmation is still pending.'
  }
  if (consumedNewResult) {
    return 'The consumer has loaded the new result and confirmed it.'
  }
  return 'This consumer has not loaded any result for the business date yet.'
}

export function englishClosureSummary(closure: DownstreamClosure): {
  openCount: number
  allConfirmed: boolean
  headline: string
} {
  const openCount = closure.pendingConfirmationCount
  if (closure.allConfirmed) {
    return {
      openCount: 0,
      allConfirmed: true,
      headline: 'Every affected consumer has loaded the new result and confirmed it.',
    }
  }
  return {
    openCount,
    allConfirmed: false,
    headline: `${openCount} consumer${
      openCount === 1 ? '' : 's'
    } still hold the pre-recovery result; recovery is not closed yet.`,
  }
}

/**
 * Replay the schedule in dependency order using the shared kernel actions.
 * Deterministic: the same schedule always produces the same end state.
 */
export function replaySchedule(
  model: ReprocessingModel,
  schedule: RedoSchedule,
  at = '2026-10-17 02:20:00',
): ReprocessingModel {
  const [datePart, timePart = '02:20:00'] = at.split(' ')
  const [hour = 2, minute = 20] = timePart.split(':').map(Number)
  const stamp = (offsetMinutes: number, seconds: number): string => {
    const total = hour * 60 + minute + offsetMinutes
    const nextHour = Math.floor(total / 60) % 24
    const nextMinute = total % 60
    return `${datePart} ${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(
      2,
      '0',
    )}:${String(seconds).padStart(2, '0')}`
  }
  let next = model
  schedule.items.forEach((item, index) => {
    next = applyReprocessingAction(next, {
      type: 'start-redo',
      instanceId: item.instanceId,
      at: stamp(index, 0),
    })
    next = applyReprocessingAction(next, {
      type: 'complete-redo',
      instanceId: item.instanceId,
      at: stamp(index, 30),
    })
  })
  return next
}

export function countByState(
  model: ReprocessingModel,
  instanceIds: readonly string[],
): Readonly<Record<TaskInstanceState, number>> {
  const counts: Record<TaskInstanceState, number> = {
    waiting: 0,
    ready: 0,
    running: 0,
    stopping: 0,
    stopped: 0,
    success: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
  }
  for (const instanceId of instanceIds) {
    const instance = model.instances.find((candidate) => candidate.instanceId === instanceId)
    if (!instance) continue
    counts[instance.state] += 1
  }
  return counts
}
