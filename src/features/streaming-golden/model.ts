import {
  STREAMING_ALLOWED_LATENESS_MS,
  STREAMING_GOLDEN_DELIVERIES,
  STREAMING_OFFLINE_CUTOFF,
  STREAMING_ON_TIME_WATERMARK,
  STREAMING_WINDOW_MINUTES,
} from './fixture'
import type {
  MicrobatchSnapshot,
  ReconciliationRow,
  StreamingAggregate,
  StreamingClockBasis,
  StreamingDelivery,
  StreamingDeliveryDecision,
  StreamingGoldenLessonSession,
  StreamingRecoveryEvidence,
  StreamingState,
  StreamingWindow,
  StreamingWindowLifecycle,
} from './types'

const FIVE_MINUTES_MS = STREAMING_WINDOW_MINUTES * 60 * 1000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const OLD_WINDOW_START = '2026-05-12T10:00:00+08:00'
const OLD_WINDOW_END = '2026-05-12T10:05:00+08:00'
const NEXT_WINDOW_START = OLD_WINDOW_END

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid fixed teaching timestamp: ${value}`)
  return parsed
}

function formatShanghaiTimestamp(value: number): string {
  return `${new Date(value + SHANGHAI_OFFSET_MS).toISOString().slice(0, 19)}+08:00`
}

export function getStreamingWindow(value: string): StreamingWindow {
  const start = Math.floor(timestamp(value) / FIVE_MINUTES_MS) * FIVE_MINUTES_MS
  return {
    start: formatShanghaiTimestamp(start),
    end: formatShanghaiTimestamp(start + FIVE_MINUTES_MS),
  }
}

export function getDeliveryWindow(
  delivery: StreamingDelivery,
  clock: StreamingClockBasis,
): StreamingWindow {
  const timestampField = {
    event_time: 'eventTime',
    arrival_time: 'arrivalTime',
    processing_time: 'processingTime',
  } as const
  return getStreamingWindow(delivery[timestampField[clock]])
}

export function createInitialStreamingState(): StreamingState {
  return {
    sourcePosition: 0,
    watermark: null,
    maxEventTimeSeen: null,
    seenTransactionIds: [],
    aggregates: [],
    decisions: [],
    sideOutputOffsets: [],
  }
}

function aggregateKey(
  aggregate: Pick<StreamingAggregate, 'branchId' | 'windowStart' | 'currency'>,
) {
  return `${aggregate.branchId}|${aggregate.windowStart}|${aggregate.currency}`
}

function sortAggregates(aggregates: readonly StreamingAggregate[]): StreamingAggregate[] {
  return [...aggregates].sort(
    (left, right) =>
      left.windowStart.localeCompare(right.windowStart) ||
      left.branchId.localeCompare(right.branchId),
  )
}

function updateAggregate(
  aggregates: readonly StreamingAggregate[],
  delivery: StreamingDelivery,
  window: StreamingWindow,
): StreamingAggregate[] {
  const incoming: StreamingAggregate = {
    branchId: delivery.branchId,
    windowStart: window.start,
    windowEnd: window.end,
    currency: delivery.currency,
    transactionIds: [delivery.transactionId],
    count: 1,
    amountCny: delivery.amountCny,
  }
  const key = aggregateKey(incoming)
  const current = aggregates.find((aggregate) => aggregateKey(aggregate) === key)

  if (!current) return sortAggregates([...aggregates, incoming])

  return sortAggregates(
    aggregates.map((aggregate) =>
      aggregateKey(aggregate) === key
        ? {
            ...aggregate,
            transactionIds: [...aggregate.transactionIds, delivery.transactionId],
            count: aggregate.count + 1,
            amountCny: aggregate.amountCny + delivery.amountCny,
          }
        : aggregate,
    ),
  )
}

export function getWindowLifecycle(
  windowEnd: string,
  watermark: string | null,
): StreamingWindowLifecycle {
  if (watermark === null || timestamp(watermark) < timestamp(windowEnd)) return 'OPEN'
  if (timestamp(watermark) < timestamp(windowEnd) + STREAMING_ALLOWED_LATENESS_MS) {
    return 'ALLOWED_LATE'
  }
  return 'FINAL'
}

export function isWindowEmitted(windowEnd: string, watermark: string | null): boolean {
  return watermark !== null && timestamp(watermark) >= timestamp(windowEnd)
}

export function advanceEventTimeWatermark(
  state: StreamingState,
  nextWatermark: string,
): StreamingState {
  if (state.watermark !== null && timestamp(nextWatermark) < timestamp(state.watermark)) {
    throw new Error('Event-time watermark must not move backwards')
  }
  return { ...state, watermark: nextWatermark }
}

export function processStreamingDelivery(
  state: StreamingState,
  delivery: StreamingDelivery,
): StreamingState {
  const window = getStreamingWindow(delivery.eventTime)
  const eventTimestamp = timestamp(delivery.eventTime)
  const priorMaximum = state.maxEventTimeSeen ? timestamp(state.maxEventTimeSeen) : null
  const isOutOfOrder = priorMaximum !== null && eventTimestamp < priorMaximum
  const isFinal = getWindowLifecycle(window.end, state.watermark) === 'FINAL'
  const isBusinessDuplicate = state.seenTransactionIds.includes(delivery.transactionId)

  let disposition: StreamingDeliveryDecision['disposition']
  let aggregates = state.aggregates
  let seenTransactionIds = state.seenTransactionIds
  let sideOutputOffsets = state.sideOutputOffsets

  if (isFinal) {
    disposition = 'too-late'
    sideOutputOffsets = [...sideOutputOffsets, delivery.offset]
  } else if (isBusinessDuplicate) {
    disposition = 'business-duplicate'
  } else {
    disposition = isWindowEmitted(window.end, state.watermark) ? 'revised' : 'accepted'
    aggregates = updateAggregate(aggregates, delivery, window)
    seenTransactionIds = [...seenTransactionIds, delivery.transactionId]
  }

  const decision: StreamingDeliveryDecision = {
    offset: delivery.offset,
    transactionId: delivery.transactionId,
    disposition,
    isOutOfOrder,
    window,
  }
  const maxEventTimeSeen =
    priorMaximum === null || eventTimestamp > priorMaximum
      ? delivery.eventTime
      : state.maxEventTimeSeen

  return {
    ...state,
    sourcePosition: Math.max(state.sourcePosition, delivery.offset),
    maxEventTimeSeen,
    seenTransactionIds,
    aggregates,
    decisions: [...state.decisions, decision],
    sideOutputOffsets,
  }
}

function aggregateUniqueDeliveries(
  deliveries: readonly StreamingDelivery[],
  cutoff?: string,
): StreamingAggregate[] {
  const eligible = cutoff
    ? deliveries.filter((delivery) => timestamp(delivery.arrivalTime) < timestamp(cutoff))
    : deliveries
  const seen = new Set<string>()
  let aggregates: StreamingAggregate[] = []

  for (const delivery of eligible) {
    if (seen.has(delivery.transactionId)) continue
    seen.add(delivery.transactionId)
    aggregates = updateAggregate(aggregates, delivery, getStreamingWindow(delivery.eventTime))
  }

  return aggregates
}

export function buildOfflineReference(
  deliveries: readonly StreamingDelivery[] = STREAMING_GOLDEN_DELIVERIES,
  cutoff = STREAMING_OFFLINE_CUTOFF,
): StreamingAggregate[] {
  return aggregateUniqueDeliveries(deliveries, cutoff)
}

export function buildT1BatchReference(): StreamingAggregate[] {
  return buildOfflineReference(STREAMING_GOLDEN_DELIVERIES, STREAMING_OFFLINE_CUTOFF)
}

export function buildMicrobatchSnapshots(): MicrobatchSnapshot[] {
  const runDefinitions = [
    { tick: '10:05:05', throughOffset: 4, watermark: STREAMING_ON_TIME_WATERMARK },
    { tick: '10:06:05', throughOffset: 5, watermark: STREAMING_ON_TIME_WATERMARK },
    { tick: '10:07:05', throughOffset: 7, watermark: STREAMING_ON_TIME_WATERMARK },
    { tick: '10:09:05', throughOffset: 8, watermark: '2026-05-12T10:07:00+08:00' },
  ] as const

  let state = createInitialStreamingState()
  let nextDeliveryIndex = 0

  return runDefinitions.map((run) => {
    const advancesBeforeDelivery = run.watermark !== state.watermark && run.throughOffset === 8
    if (advancesBeforeDelivery) {
      state = advanceEventTimeWatermark(state, run.watermark)
    }
    while (
      nextDeliveryIndex < STREAMING_GOLDEN_DELIVERIES.length &&
      STREAMING_GOLDEN_DELIVERIES[nextDeliveryIndex]!.offset <= run.throughOffset
    ) {
      state = processStreamingDelivery(state, STREAMING_GOLDEN_DELIVERIES[nextDeliveryIndex]!)
      nextDeliveryIndex += 1
    }
    if (run.watermark !== state.watermark) {
      state = advanceEventTimeWatermark(state, run.watermark)
    }

    const oldWindow = findAggregate(state.aggregates, 'HZ001', OLD_WINDOW_START)
    const nextWindow = findAggregate(state.aggregates, 'HZ001', NEXT_WINDOW_START)

    return {
      tick: run.tick,
      throughOffset: run.throughOffset,
      sourcePosition: state.sourcePosition,
      watermark: state.watermark!,
      oldWindowAmountCny: oldWindow?.amountCny ?? 0,
      nextWindowAmountCny: nextWindow?.amountCny ?? 0,
      sideOutputOffsets: [...state.sideOutputOffsets],
    }
  })
}

export function findAggregate(
  aggregates: readonly StreamingAggregate[],
  branchId: string,
  windowStart: string,
): StreamingAggregate | undefined {
  return aggregates.find(
    (aggregate) => aggregate.branchId === branchId && aggregate.windowStart === windowStart,
  )
}

export function buildReconciliationRows(
  online: StreamingState,
  offline: readonly StreamingAggregate[] = buildT1BatchReference(),
): ReconciliationRow[] {
  const keys = new Map<string, { online?: StreamingAggregate; offline?: StreamingAggregate }>()
  for (const aggregate of online.aggregates) {
    const key = aggregateKey(aggregate)
    keys.set(key, { ...keys.get(key), online: aggregate })
  }
  for (const aggregate of offline) {
    const key = aggregateKey(aggregate)
    keys.set(key, { ...keys.get(key), offline: aggregate })
  }

  return [...keys.values()]
    .map(({ online: onlineRow, offline: offlineRow }) => {
      const base = onlineRow ?? offlineRow!
      const onlineIds = new Set(onlineRow?.transactionIds ?? [])
      const differenceTransactionIds = (offlineRow?.transactionIds ?? []).filter(
        (transactionId) => !onlineIds.has(transactionId),
      )
      return {
        branchId: base.branchId,
        windowStart: base.windowStart,
        windowEnd: base.windowEnd,
        currency: base.currency,
        onlineCount: onlineRow?.count ?? 0,
        onlineAmountCny: onlineRow?.amountCny ?? 0,
        offlineCount: offlineRow?.count ?? 0,
        offlineAmountCny: offlineRow?.amountCny ?? 0,
        countDifference: (offlineRow?.count ?? 0) - (onlineRow?.count ?? 0),
        amountDifferenceCny: (offlineRow?.amountCny ?? 0) - (onlineRow?.amountCny ?? 0),
        differenceTransactionIds,
        onlineLifecycle: getWindowLifecycle(base.windowEnd, online.watermark),
      }
    })
    .sort(
      (left, right) =>
        left.windowStart.localeCompare(right.windowStart) ||
        left.branchId.localeCompare(right.branchId),
    )
}

export function buildStreamingRecoveryEvidence(): StreamingRecoveryEvidence {
  let checkpoint = createInitialStreamingState()
  for (const delivery of STREAMING_GOLDEN_DELIVERIES.slice(0, 4)) {
    checkpoint = processStreamingDelivery(checkpoint, delivery)
  }
  checkpoint = advanceEventTimeWatermark(checkpoint, STREAMING_ON_TIME_WATERMARK)

  let replayedState = checkpoint
  for (const delivery of STREAMING_GOLDEN_DELIVERIES.slice(4, 6)) {
    replayedState = processStreamingDelivery(replayedState, delivery)
  }

  const offsets = [5, 6]
  const firstAttemptAppendWrites = offsets.length
  const replayAppendWrites = offsets.length

  return {
    caseA: {
      sourcePosition: 6,
      operatorStateOffset: 4,
      skippedOffsets: [5, 6],
      missingTransactionIds: ['TX-005', 'TX-006'],
    },
    caseB: {
      sourcePosition: 4,
      operatorStateOffset: 4,
      replayedOffsets: offsets,
      appendWritesBeforeFailure: firstAttemptAppendWrites,
      appendWritesAfterReplay: firstAttemptAppendWrites + replayAppendWrites,
      duplicateAppendWrites: replayAppendWrites,
      upsertRowsByGrain: replayedState.aggregates.length,
      businessDuplicateOffset: 7,
      businessDuplicateTransactionId: 'TX-006',
    },
  }
}

export function buildCompletedStreamingState(): StreamingState {
  let state = createInitialStreamingState()
  for (const delivery of STREAMING_GOLDEN_DELIVERIES.slice(0, 4)) {
    state = processStreamingDelivery(state, delivery)
  }
  state = advanceEventTimeWatermark(state, STREAMING_ON_TIME_WATERMARK)
  for (const delivery of STREAMING_GOLDEN_DELIVERIES.slice(4, 7)) {
    state = processStreamingDelivery(state, delivery)
  }
  state = advanceEventTimeWatermark(state, '2026-05-12T10:07:00+08:00')
  return processStreamingDelivery(state, STREAMING_GOLDEN_DELIVERIES[7]!)
}

export function formatStreamingClock(value: string): string {
  return value.slice(11, 19)
}

export function formatStreamingWindow(window: StreamingWindow): string {
  return `[${window.start.slice(11, 16)}, ${window.end.slice(11, 16)})`
}

export function formatCurrency(amountCny: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(amountCny)
}

export function isStreamingLessonSessionComplete(state: StreamingGoldenLessonSession): boolean {
  return state.player.currentIndex === state.player.stepCount - 1
}
