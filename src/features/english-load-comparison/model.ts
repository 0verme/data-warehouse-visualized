import {
  createMicrobatchLabState,
  getCheckpointChanges,
  getLatestTransactionSnapshot,
  injectLateTransactionChanges,
  isInHalfOpenWindow,
  runInitialMicrobatch,
  type MicrobatchCheckpoint,
  type TransactionChange,
} from '../performance/microbatch'

export type LoadPlanId = 'full-load' | 'event-time-only' | 'arrival-cursor'

export interface LoadWindow {
  id: string
  label: string
  start: string
  end: string
}

export interface WindowAggregate {
  windowId: string
  label: string
  transactionCount: number
  amountTotal: number
}

export interface LoadPlanResult {
  id: LoadPlanId
  label: string
  description: string
  candidateChanges: readonly TransactionChange[]
  sourceRowsRecomputed: number
  windowsRecomputed: readonly string[]
  output: readonly WindowAggregate[]
  totalAmount: number
  equalsFullLoad: boolean
}

export interface IncrementalLoadComparison {
  initialAsOf: string
  finalAsOf: string
  initialCheckpoint: MicrobatchCheckpoint | null
  eventTimeWatermark: string
  sourceChanges: readonly TransactionChange[]
  lateChanges: readonly TransactionChange[]
  windows: readonly LoadWindow[]
  initialOutput: readonly WindowAggregate[]
  fullLoadOutput: readonly WindowAggregate[]
  plans: readonly LoadPlanResult[]
}

const WINDOWS: readonly LoadWindow[] = [
  { id: 'window-1', label: '10:00–10:05', start: '10:00', end: '10:05' },
  { id: 'window-2', label: '10:05–10:10', start: '10:05', end: '10:10' },
]

function aggregateChanges(changes: readonly TransactionChange[], asOf: string): WindowAggregate[] {
  const snapshot = getLatestTransactionSnapshot(changes, asOf)
  return WINDOWS.map((window) => {
    const transactions = snapshot.filter((change) =>
      isInHalfOpenWindow(change.eventTime, window.start, window.end),
    )
    return {
      windowId: window.id,
      label: window.label,
      transactionCount: transactions.length,
      amountTotal: transactions.reduce((total, transaction) => total + transaction.amount, 0),
    }
  })
}

function aggregateWindowChanges(
  changes: readonly TransactionChange[],
  asOf: string,
  window: LoadWindow,
): WindowAggregate {
  const snapshot = getLatestTransactionSnapshot(
    changes.filter((change) => isInHalfOpenWindow(change.eventTime, window.start, window.end)),
    asOf,
  )
  return {
    windowId: window.id,
    label: window.label,
    transactionCount: snapshot.length,
    amountTotal: snapshot.reduce((total, transaction) => total + transaction.amount, 0),
  }
}

function sameAggregates(
  left: readonly WindowAggregate[],
  right: readonly WindowAggregate[],
): boolean {
  return (
    left.length === right.length &&
    left.every((row, index) => {
      const other = right[index]
      return (
        other !== undefined &&
        row.windowId === other.windowId &&
        row.transactionCount === other.transactionCount &&
        row.amountTotal === other.amountTotal
      )
    })
  )
}

function sumAmounts(rows: readonly WindowAggregate[]): number {
  return rows.reduce((total, row) => total + row.amountTotal, 0)
}

export function buildIncrementalLoadComparison(): IncrementalLoadComparison {
  const firstRun = runInitialMicrobatch(createMicrobatchLabState())
  const afterLateChanges = injectLateTransactionChanges(firstRun)
  const initialCheckpoint = firstRun.strategies.checkpoint.checkpoint
  const initialOutput = aggregateChanges(firstRun.sourceChanges, firstRun.now)
  const fullLoadOutput = aggregateChanges(afterLateChanges.sourceChanges, afterLateChanges.now)
  const fullLoadRows = afterLateChanges.sourceChanges
  const fullLoadWindowLabels = WINDOWS.map((window) => window.label)

  const fullLoad: LoadPlanResult = {
    id: 'full-load',
    label: 'Full load',
    description: 'Read the complete bounded change fixture and rebuild both output windows.',
    candidateChanges: fullLoadRows,
    sourceRowsRecomputed: fullLoadRows.length,
    windowsRecomputed: fullLoadWindowLabels,
    output: fullLoadOutput,
    totalAmount: sumAmounts(fullLoadOutput),
    equalsFullLoad: true,
  }

  const newChanges = getCheckpointChanges(
    afterLateChanges.sourceChanges,
    initialCheckpoint,
    afterLateChanges.now,
  )
  const affectedWindowIds = new Set(
    newChanges.flatMap((change) =>
      WINDOWS.filter((window) =>
        isInHalfOpenWindow(change.eventTime, window.start, window.end),
      ).map((window) => window.id),
    ),
  )
  const affectedWindows = WINDOWS.filter((window) => affectedWindowIds.has(window.id))
  const rowsInAffectedWindows = afterLateChanges.sourceChanges.filter((change) =>
    affectedWindows.some((window) =>
      isInHalfOpenWindow(change.eventTime, window.start, window.end),
    ),
  )
  const correctedOutput = initialOutput.map((row) => {
    const affectedWindow = affectedWindows.find((window) => window.id === row.windowId)
    return affectedWindow
      ? aggregateWindowChanges(rowsInAffectedWindows, afterLateChanges.now, affectedWindow)
      : row
  })

  const arrivalCursor: LoadPlanResult = {
    id: 'arrival-cursor',
    label: 'Arrival cursor + affected window',
    description:
      'Read changes after the arrival cursor, identify their event-time windows, and rebuild each affected window from its complete input scope.',
    candidateChanges: newChanges,
    sourceRowsRecomputed: rowsInAffectedWindows.length,
    windowsRecomputed: affectedWindows.map((window) => window.label),
    output: correctedOutput,
    totalAmount: sumAmounts(correctedOutput),
    equalsFullLoad: sameAggregates(correctedOutput, fullLoadOutput),
  }

  const eventTimeWatermark = firstRun.sourceChanges.reduce(
    (latest, change) => (change.eventTime > latest ? change.eventTime : latest),
    '00:00',
  )
  const eventTimeOnlyCandidates = afterLateChanges.sourceChanges.filter(
    (change) => change.availableAt > firstRun.now && change.eventTime > eventTimeWatermark,
  )
  const eventTimeOnlyOutput = [...initialOutput]
  const eventTimeOnly: LoadPlanResult = {
    id: 'event-time-only',
    label: 'Event-time watermark only',
    description:
      'Select only newly available changes whose event time is beyond the prior event-time watermark.',
    candidateChanges: eventTimeOnlyCandidates,
    sourceRowsRecomputed: eventTimeOnlyCandidates.length,
    windowsRecomputed: [],
    output: eventTimeOnlyOutput,
    totalAmount: sumAmounts(eventTimeOnlyOutput),
    equalsFullLoad: sameAggregates(eventTimeOnlyOutput, fullLoadOutput),
  }

  return {
    initialAsOf: firstRun.now,
    finalAsOf: afterLateChanges.now,
    initialCheckpoint,
    eventTimeWatermark,
    sourceChanges: afterLateChanges.sourceChanges,
    lateChanges: newChanges,
    windows: WINDOWS,
    initialOutput,
    fullLoadOutput,
    plans: [fullLoad, eventTimeOnly, arrivalCursor],
  }
}
