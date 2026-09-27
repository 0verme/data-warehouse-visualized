export type MicrobatchStrategyId = 'fixed-window' | 'checkpoint' | 'daily-rescan'
export type MicrobatchWriteMode = 'upsert' | 'append'
export const MICRO_BATCH_WINDOW_BOUNDARIES = ['10:04', '10:05', '10:06'] as const
export const MICRO_BATCH_LATE_ARRIVALS = ['10:08', '10:12'] as const
export type MicrobatchWindowBoundary = (typeof MICRO_BATCH_WINDOW_BOUNDARIES)[number]
export type MicrobatchLateArrival = (typeof MICRO_BATCH_LATE_ARRIVALS)[number]

export interface TransactionChange {
  id: string
  transactionId: string
  eventTime: string
  availableAt: string
  revision: number
  amount: number
  kind: 'insert' | 'update'
}

export interface MicrobatchCheckpoint {
  time: string
  id: string
}

export interface MicrobatchRunRecord {
  label: string
  scope: string
  scannedRows: number
  selectedChanges: readonly TransactionChange[]
  outputRowsAfter: number
}

export interface CheckpointBatchReplay {
  changes: readonly TransactionChange[]
  checkpointBefore: MicrobatchCheckpoint | null
  checkpointAfter: MicrobatchCheckpoint
}

export interface MicrobatchStrategyState {
  output: readonly TransactionChange[]
  checkpoint: MicrobatchCheckpoint | null
  scannedRows: number
  runs: readonly MicrobatchRunRecord[]
  lastCheckpointBatch?: CheckpointBatchReplay
}

export interface MicrobatchLabState {
  now: string
  windowBoundary: MicrobatchWindowBoundary
  lateArrivalTime: MicrobatchLateArrival
  sourceChanges: readonly TransactionChange[]
  writeMode: MicrobatchWriteMode
  hasRunFirstBatch: boolean
  hasInjectedLateChanges: boolean
  hasRunNextBatch: boolean
  strategies: Readonly<Record<MicrobatchStrategyId, MicrobatchStrategyState>>
}

export interface MicrobatchStrategyObservation {
  expectedTransactions: readonly TransactionChange[]
  currentOutput: readonly TransactionChange[]
  missingTransactionIds: readonly string[]
  staleTransactionIds: readonly string[]
  duplicateRows: number
}

const INITIAL_AS_OF = '10:06'
const DAY_START = '00:00'
const WINDOW_END = '10:10'
const NEXT_WINDOW_END = '10:15'

export const INITIAL_TRANSACTION_CHANGES: readonly TransactionChange[] = [
  {
    id: 'change-001-v1',
    transactionId: 'TX-1001',
    eventTime: '10:02',
    availableAt: '10:03',
    revision: 1,
    amount: 100,
    kind: 'insert',
  },
  {
    id: 'change-002-v1',
    transactionId: 'TX-1002',
    eventTime: '10:04',
    availableAt: '10:04',
    revision: 1,
    amount: 200,
    kind: 'insert',
  },
  {
    id: 'change-003-v1',
    transactionId: 'TX-1003',
    eventTime: '10:05',
    availableAt: '10:05',
    revision: 1,
    amount: 300,
    kind: 'insert',
  },
]

function createLateTransactionChanges(lateArrivalTime: MicrobatchLateArrival): TransactionChange[] {
  const updateArrivalTime = formatTime(toMinutes(lateArrivalTime) + 1)
  return [
    {
      id: 'change-004-v1',
      transactionId: 'TX-1004',
      eventTime: '10:04',
      availableAt: lateArrivalTime,
      revision: 1,
      amount: 400,
      kind: 'insert',
    },
    {
      id: 'change-001-v2',
      transactionId: 'TX-1001',
      eventTime: '10:02',
      availableAt: updateArrivalTime,
      revision: 2,
      amount: 120,
      kind: 'update',
    },
  ]
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

function formatTime(minutes: number): string {
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
}

function getFixedWindows(windowBoundary: MicrobatchWindowBoundary) {
  return [
    { start: '10:00', end: windowBoundary },
    { start: windowBoundary, end: WINDOW_END },
  ] as const
}

function compareTime(left: string, right: string): number {
  return toMinutes(left) - toMinutes(right)
}

function compareChangeCursor(
  change: Pick<TransactionChange, 'availableAt' | 'id'>,
  cursor: MicrobatchCheckpoint,
): number {
  return compareTime(change.availableAt, cursor.time) || change.id.localeCompare(cursor.id)
}

function compareSourceOrder(left: TransactionChange, right: TransactionChange): number {
  return compareTime(left.availableAt, right.availableAt) || left.id.localeCompare(right.id)
}

function compareVersion(left: TransactionChange, right: TransactionChange): number {
  return compareTime(left.availableAt, right.availableAt) || left.revision - right.revision
}

function createEmptyStrategyState(): MicrobatchStrategyState {
  return { output: [], checkpoint: null, scannedRows: 0, runs: [] }
}

export function createMicrobatchLabState(
  writeMode: MicrobatchWriteMode = 'upsert',
  options: {
    windowBoundary?: MicrobatchWindowBoundary
    lateArrivalTime?: MicrobatchLateArrival
  } = {},
): MicrobatchLabState {
  return {
    now: INITIAL_AS_OF,
    windowBoundary: options.windowBoundary ?? '10:05',
    lateArrivalTime: options.lateArrivalTime ?? '10:08',
    sourceChanges: INITIAL_TRANSACTION_CHANGES,
    writeMode,
    hasRunFirstBatch: false,
    hasInjectedLateChanges: false,
    hasRunNextBatch: false,
    strategies: {
      'fixed-window': createEmptyStrategyState(),
      checkpoint: createEmptyStrategyState(),
      'daily-rescan': createEmptyStrategyState(),
    },
  }
}

export function setMicrobatchWindowBoundary(
  state: MicrobatchLabState,
  windowBoundary: MicrobatchWindowBoundary,
): MicrobatchLabState {
  return state.hasRunFirstBatch ? state : { ...state, windowBoundary }
}

export function setMicrobatchLateArrival(
  state: MicrobatchLabState,
  lateArrivalTime: MicrobatchLateArrival,
): MicrobatchLabState {
  return state.hasRunFirstBatch ? state : { ...state, lateArrivalTime }
}

function getAvailableChanges(
  changes: readonly TransactionChange[],
  asOf: string,
): TransactionChange[] {
  return changes
    .filter((change) => compareTime(change.availableAt, asOf) <= 0)
    .sort(compareSourceOrder)
}

export function isInHalfOpenWindow(time: string, start: string, end: string): boolean {
  return compareTime(time, start) >= 0 && compareTime(time, end) < 0
}

export function getFixedWindowChanges(
  changes: readonly TransactionChange[],
  start: string,
  end: string,
  asOf: string,
): TransactionChange[] {
  return getAvailableChanges(changes, asOf).filter((change) =>
    isInHalfOpenWindow(change.eventTime, start, end),
  )
}

export function getCheckpointChanges(
  changes: readonly TransactionChange[],
  checkpoint: MicrobatchCheckpoint | null,
  asOf: string,
): TransactionChange[] {
  return getAvailableChanges(changes, asOf).filter(
    (change) => checkpoint === null || compareChangeCursor(change, checkpoint) > 0,
  )
}

export function getLatestTransactionSnapshot(
  changes: readonly TransactionChange[],
  asOf: string,
): TransactionChange[] {
  const latestById = new Map<string, TransactionChange>()

  for (const change of getAvailableChanges(changes, asOf)) {
    const current = latestById.get(change.transactionId)
    if (!current || compareVersion(change, current) > 0) {
      latestById.set(change.transactionId, change)
    }
  }

  return [...latestById.values()].sort((left, right) =>
    left.transactionId.localeCompare(right.transactionId),
  )
}

function applyOutput(
  output: readonly TransactionChange[],
  changes: readonly TransactionChange[],
  writeMode: MicrobatchWriteMode,
): TransactionChange[] {
  if (writeMode === 'append') {
    return [...output, ...changes]
  }

  const latestById = new Map(output.map((change) => [change.transactionId, change]))
  for (const change of [...changes].sort(compareSourceOrder)) {
    const current = latestById.get(change.transactionId)
    if (current && compareVersion(change, current) < 0) {
      continue
    }
    latestById.set(change.transactionId, change)
  }

  return [...latestById.values()].sort((left, right) =>
    left.transactionId.localeCompare(right.transactionId),
  )
}

function createRunRecord(
  label: string,
  scope: string,
  selectedChanges: readonly TransactionChange[],
  outputRowsAfter: number,
): MicrobatchRunRecord {
  return {
    label,
    scope,
    scannedRows: selectedChanges.length,
    selectedChanges,
    outputRowsAfter,
  }
}

function getLastCheckpoint(changes: readonly TransactionChange[]): MicrobatchCheckpoint | null {
  const last = [...changes].sort(compareSourceOrder).at(-1)
  return last ? { time: last.availableAt, id: last.id } : null
}

function updateStrategy(
  current: MicrobatchStrategyState,
  changes: readonly TransactionChange[],
  writeMode: MicrobatchWriteMode,
  record: Omit<MicrobatchRunRecord, 'scannedRows' | 'selectedChanges' | 'outputRowsAfter'>,
  checkpoint = current.checkpoint,
  lastCheckpointBatch = current.lastCheckpointBatch,
): MicrobatchStrategyState {
  const output = applyOutput(current.output, changes, writeMode)
  const run = createRunRecord(record.label, record.scope, changes, output.length)

  return {
    output,
    checkpoint,
    scannedRows: current.scannedRows + run.scannedRows,
    runs: [...current.runs, run],
    ...(lastCheckpointBatch ? { lastCheckpointBatch } : {}),
  }
}

export function runInitialMicrobatch(state: MicrobatchLabState): MicrobatchLabState {
  if (state.hasRunFirstBatch) return state

  const fixedWindows = getFixedWindows(state.windowBoundary)
  const fixedChanges = fixedWindows.flatMap(({ start, end }) =>
    getFixedWindowChanges(state.sourceChanges, start, end, state.now),
  )
  const checkpointChanges = getCheckpointChanges(state.sourceChanges, null, state.now)
  const dailyChanges = getLatestTransactionSnapshot(state.sourceChanges, state.now)
  const checkpoint = getLastCheckpoint(checkpointChanges)
  const empty = state.strategies

  return {
    ...state,
    hasRunFirstBatch: true,
    strategies: {
      'fixed-window': updateStrategy(empty['fixed-window'], fixedChanges, state.writeMode, {
        label: '第一次微批',
        scope: `${fixedWindows[0].start}–${fixedWindows[0].end} + ${fixedWindows[1].start}–${fixedWindows[1].end}（左闭右开）`,
      }),
      checkpoint: updateStrategy(
        empty.checkpoint,
        checkpointChanges,
        state.writeMode,
        { label: '第一次增量读取', scope: `变更游标 > 起点，≤ ${state.now}` },
        checkpoint,
        {
          changes: checkpointChanges,
          checkpointBefore: null,
          checkpointAfter: checkpoint ?? { time: state.now, id: '∅' },
        },
      ),
      'daily-rescan': updateStrategy(empty['daily-rescan'], dailyChanges, state.writeMode, {
        label: '第一次当日重扫',
        scope: `${DAY_START} → ${state.now}`,
      }),
    },
  }
}

export function injectLateTransactionChanges(state: MicrobatchLabState): MicrobatchLabState {
  if (!state.hasRunFirstBatch || state.hasInjectedLateChanges) return state

  const lateChanges = createLateTransactionChanges(state.lateArrivalTime)
  const latestAvailableAt = lateChanges.at(-1)!.availableAt
  return {
    ...state,
    now: formatTime(toMinutes(latestAvailableAt) + 1),
    sourceChanges: [...state.sourceChanges, ...lateChanges],
    hasInjectedLateChanges: true,
  }
}

export function runNextMicrobatch(state: MicrobatchLabState): MicrobatchLabState {
  if (!state.hasInjectedLateChanges || state.hasRunNextBatch) return state

  const current = state.strategies
  const fixedChanges = getFixedWindowChanges(
    state.sourceChanges,
    WINDOW_END,
    NEXT_WINDOW_END,
    state.now,
  )
  const checkpointChanges = getCheckpointChanges(
    state.sourceChanges,
    current.checkpoint.checkpoint,
    state.now,
  )
  const checkpointAfter = getLastCheckpoint(checkpointChanges) ?? current.checkpoint.checkpoint
  const dailyChanges = getLatestTransactionSnapshot(state.sourceChanges, state.now)
  const checkpointBefore = current.checkpoint.checkpoint
  const lastCheckpointBatch =
    checkpointAfter && checkpointChanges.length > 0
      ? { changes: checkpointChanges, checkpointBefore, checkpointAfter }
      : current.checkpoint.lastCheckpointBatch

  return {
    ...state,
    hasRunNextBatch: true,
    strategies: {
      'fixed-window': updateStrategy(current['fixed-window'], fixedChanges, state.writeMode, {
        label: '只运行下一窗口',
        scope: `${WINDOW_END}–${NEXT_WINDOW_END}（左闭右开）`,
      }),
      checkpoint: updateStrategy(
        current.checkpoint,
        checkpointChanges,
        state.writeMode,
        {
          label: '读取 checkpoint 之后的变更',
          scope: checkpointBefore
            ? `严格晚于 (${checkpointBefore.time}, ${checkpointBefore.id})，不超过 ${state.now}`
            : `从起点开始，不超过 ${state.now}`,
        },
        checkpointAfter,
        lastCheckpointBatch,
      ),
      'daily-rescan': updateStrategy(current['daily-rescan'], dailyChanges, state.writeMode, {
        label: '再次扫描当日快照',
        scope: `${DAY_START} → ${state.now}`,
      }),
    },
  }
}

export function backfillFixedWindows(state: MicrobatchLabState): MicrobatchLabState {
  if (!state.hasInjectedLateChanges) return state

  const fixedWindows = getFixedWindows(state.windowBoundary)
  const changes = fixedWindows.flatMap(({ start, end }) =>
    getFixedWindowChanges(state.sourceChanges, start, end, state.now),
  )
  const current = state.strategies['fixed-window']

  return {
    ...state,
    strategies: {
      ...state.strategies,
      'fixed-window': updateStrategy(current, changes, state.writeMode, {
        label: '补跑受影响窗口',
        scope: `重开 ${fixedWindows[0].start}–${fixedWindows[0].end} + ${fixedWindows[1].start}–${fixedWindows[1].end}`,
      }),
    },
  }
}

export function repeatDailyRescan(state: MicrobatchLabState): MicrobatchLabState {
  if (!state.hasInjectedLateChanges) return state

  const changes = getLatestTransactionSnapshot(state.sourceChanges, state.now)
  const current = state.strategies['daily-rescan']

  return {
    ...state,
    strategies: {
      ...state.strategies,
      'daily-rescan': updateStrategy(current, changes, state.writeMode, {
        label: '再次重扫当日',
        scope: `${DAY_START} → ${state.now}`,
      }),
    },
  }
}

export function simulateCheckpointRetry(state: MicrobatchLabState): MicrobatchLabState {
  const current = state.strategies.checkpoint
  const batch = current.lastCheckpointBatch
  if (!batch || batch.changes.length === 0) return state

  const output = applyOutput(current.output, batch.changes, state.writeMode)
  const run = createRunRecord(
    '模拟 checkpoint 未持久化后的 retry',
    `从 ${batch.checkpointBefore ? `${batch.checkpointBefore.time} / ${batch.checkpointBefore.id}` : '起点'} 重读 ${batch.changes.length} 条；成功后推进到 ${batch.checkpointAfter.time} / ${batch.checkpointAfter.id}`,
    batch.changes,
    output.length,
  )

  return {
    ...state,
    strategies: {
      ...state.strategies,
      checkpoint: {
        ...current,
        output,
        // The first write succeeded but the cursor was not persisted. The retry
        // re-reads the same batch; the durable cursor advances only after success.
        checkpoint: batch.checkpointAfter,
        scannedRows: current.scannedRows + run.scannedRows,
        runs: [...current.runs, run],
      },
    },
  }
}

export function getMicrobatchObservation(
  state: MicrobatchLabState,
  strategyId: MicrobatchStrategyId,
): MicrobatchStrategyObservation {
  const strategy = state.strategies[strategyId]
  const expectedTransactions = getLatestTransactionSnapshot(state.sourceChanges, state.now)
  const latestOutput = getLatestTransactionSnapshot(strategy.output, state.now)
  const latestById = new Map(latestOutput.map((row) => [row.transactionId, row]))
  const expectedById = new Map(expectedTransactions.map((row) => [row.transactionId, row]))
  const missingTransactionIds = expectedTransactions
    .filter((row) => !latestById.has(row.transactionId))
    .map((row) => row.transactionId)
  const staleTransactionIds = expectedTransactions
    .filter((row) => {
      const output = latestById.get(row.transactionId)
      return output !== undefined && compareVersion(output, row) < 0
    })
    .map((row) => row.transactionId)
  const counts = new Map<string, number>()
  for (const row of strategy.output) {
    counts.set(row.transactionId, (counts.get(row.transactionId) ?? 0) + 1)
  }
  const duplicateRows = [...counts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  )

  return {
    expectedTransactions: [...expectedById.values()],
    currentOutput: latestOutput,
    missingTransactionIds,
    staleTransactionIds,
    duplicateRows,
  }
}

export function formatMicrobatchCheckpoint(checkpoint: MicrobatchCheckpoint | null): string {
  return checkpoint ? `${checkpoint.time} / ${checkpoint.id}` : '尚未建立'
}
