import type {
  DailyCounterpartyRelation,
  FirstSeenEvaluation,
  FirstSeenRecord,
  PerformanceDiagnosisData,
  PerformanceEvidence,
  PerformanceFileLayout,
  PerformanceScanLayoutData,
  PerformanceScanMode,
  PerformanceScanSnapshot,
  PerformanceSkewScenario,
  PerformanceSkewStrategy,
  PerformanceWorkerLoad,
  CounterpartyTransaction,
} from '../features/performance/types'

export interface PerformanceDiagnosisResult {
  selectedStage: PerformanceDiagnosisData['stages'][number] | undefined
  isPrimaryStage: boolean
  finding:
    | PerformanceDiagnosisData['findings'][PerformanceDiagnosisData['stages'][number]['id']]
    | undefined
}

export interface PerformanceFirstSeenUpdate {
  state: FirstSeenRecord[]
  evaluations: FirstSeenEvaluation[]
}

export interface PerformanceSkewResult {
  strategy: PerformanceSkewStrategy
  workerLoads: PerformanceWorkerLoad[]
  longestWorker: PerformanceWorkerLoad | undefined
  totalLoadGb: number
}

export function getDiagnosisResult(
  data: PerformanceDiagnosisData,
  stageId: PerformanceDiagnosisData['stages'][number]['id'] | undefined,
): PerformanceDiagnosisResult {
  const selectedStage = data.stages.find((stage) => stage.id === stageId)

  return {
    selectedStage,
    isPrimaryStage: selectedStage?.id === data.longestTask.stage,
    finding: selectedStage ? data.findings[selectedStage.id] : undefined,
  }
}

export function getScanSnapshot(
  data: PerformanceScanLayoutData,
  mode: PerformanceScanMode,
): PerformanceScanSnapshot {
  return data.scanSnapshots.find((snapshot) => snapshot.id === mode) ?? data.scanSnapshots[0]!
}

export function getFileLayout(data: PerformanceScanLayoutData, layout: PerformanceFileLayout) {
  return data.fileLayouts.find((snapshot) => snapshot.id === layout) ?? data.fileLayouts[0]!
}

export function getLongestWorker(
  workerLoads: readonly PerformanceWorkerLoad[],
): PerformanceWorkerLoad | undefined {
  return workerLoads.reduce<PerformanceWorkerLoad | undefined>(
    (longest, current) => (!longest || current.loadGb > longest.loadGb ? current : longest),
    undefined,
  )
}

const SKEW_LOADS_BY_STRATEGY: Readonly<
  Record<Exclude<PerformanceSkewStrategy, 'none'>, readonly number[]>
> = {
  'filter-early': [55, 51, 64, 420],
  'aggregate-early': [42, 39, 46, 260],
  'split-hot-key': [180, 170, 190, 215],
  'two-phase': [60, 58, 66, 210],
  redistribute: [155, 149, 162, 190],
}

export function getSkewStrategyResult(
  scenario: PerformanceSkewScenario,
  strategy: PerformanceSkewStrategy,
): PerformanceSkewResult {
  const loads =
    scenario.id === 'shuffle-key' && strategy !== 'none'
      ? (SKEW_LOADS_BY_STRATEGY[strategy] ?? scenario.workerLoads.map((worker) => worker.loadGb))
      : scenario.workerLoads.map((worker) => worker.loadGb)
  const workerLoads = scenario.workerLoads.map((worker, index) => ({
    ...worker,
    loadGb: loads[index] ?? worker.loadGb,
  }))

  return {
    strategy,
    workerLoads,
    longestWorker: getLongestWorker(workerLoads),
    totalLoadGb: workerLoads.reduce((total, worker) => total + worker.loadGb, 0),
  }
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right)
}

/** Collapse Transaction events into the daily customer-counterparty relation Grain. */
export function buildDailyCounterpartyRelations(
  transactions: readonly CounterpartyTransaction[],
): DailyCounterpartyRelation[] {
  const grouped = new Map<string, DailyCounterpartyRelation>()

  for (const transaction of transactions) {
    const key = `${transaction.businessDate}|${transaction.customerId}|${transaction.counterpartyId}`
    const current = grouped.get(key)
    if (current) {
      current.transactionCount += 1
      continue
    }

    grouped.set(key, {
      businessDate: transaction.businessDate,
      customerId: transaction.customerId,
      counterpartyId: transaction.counterpartyId,
      transactionCount: 1,
    })
  }

  return [...grouped.values()].sort(
    (left, right) =>
      compareText(left.businessDate, right.businessDate) ||
      compareText(left.customerId, right.customerId) ||
      compareText(left.counterpartyId, right.counterpartyId),
  )
}

function earliestDate(left: string, right: string): string {
  return left < right ? left : right
}

/** Apply one business day's deduplicated relations to the incremental first-seen state. */
export function applyFirstSeenState(
  existing: readonly FirstSeenRecord[],
  dailyRelations: readonly DailyCounterpartyRelation[],
  businessDate: string,
): PerformanceFirstSeenUpdate {
  const state = existing.map((record) => ({ ...record }))
  const evaluations: FirstSeenEvaluation[] = []
  const relationRows = dailyRelations
    .filter((relation) => relation.businessDate === businessDate)
    .sort(
      (left, right) =>
        compareText(left.customerId, right.customerId) ||
        compareText(left.counterpartyId, right.counterpartyId),
    )

  for (const relation of relationRows) {
    const index = state.findIndex(
      (record) =>
        record.customerId === relation.customerId &&
        record.counterpartyId === relation.counterpartyId,
    )
    const current = index >= 0 ? state[index] : undefined
    const nextFirstSeenDate = current
      ? earliestDate(current.firstSeenDate, relation.businessDate)
      : relation.businessDate
    const isFirstSeen = !current || nextFirstSeenDate !== current.firstSeenDate

    if (current) {
      if (isFirstSeen) {
        state[index] = { ...current, firstSeenDate: nextFirstSeenDate }
      }
    } else {
      state.push({
        customerId: relation.customerId,
        counterpartyId: relation.counterpartyId,
        firstSeenDate: relation.businessDate,
      })
    }

    evaluations.push({
      relation,
      isFirstSeen,
      firstSeenDate: nextFirstSeenDate,
      action: isFirstSeen ? 'write' : 'keep',
    })
  }

  state.sort(
    (left, right) =>
      compareText(left.customerId, right.customerId) ||
      compareText(left.counterpartyId, right.counterpartyId),
  )

  return { state, evaluations }
}

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Return the inclusive fixed window used by the recent-30-day feature. */
export function getRecent30DayWindow(businessDate: string): { start: string; end: string } {
  const start = toUtcDate(businessDate)
  start.setUTCDate(start.getUTCDate() - 29)
  return { start: formatDate(start), end: businessDate }
}

export function getHistoricalCounterpartyCount(
  firstSeen: readonly FirstSeenRecord[],
  customerId: string,
  businessDate: string,
): number {
  return new Set(
    firstSeen
      .filter((record) => record.customerId === customerId && record.firstSeenDate <= businessDate)
      .map((record) => record.counterpartyId),
  ).size
}

/** Count distinct counterparties only inside the named fixed 30-day window. */
export function getRecent30DayCounterpartyCount(
  relations: readonly DailyCounterpartyRelation[],
  customerId: string,
  businessDate: string,
): number {
  const window = getRecent30DayWindow(businessDate)

  return new Set(
    relations
      .filter(
        (relation) =>
          relation.customerId === customerId &&
          relation.businessDate >= window.start &&
          relation.businessDate <= window.end,
      )
      .map((relation) => relation.counterpartyId),
  ).size
}

export function buildCustomerDayFeature(
  firstSeen: readonly FirstSeenRecord[],
  relations: readonly DailyCounterpartyRelation[],
  customerId: string,
  businessDate: string,
) {
  return {
    customerId,
    businessDate,
    historicalCounterpartyCount: getHistoricalCounterpartyCount(
      firstSeen,
      customerId,
      businessDate,
    ),
    recent30DayCounterpartyCount: getRecent30DayCounterpartyCount(
      relations,
      customerId,
      businessDate,
    ),
  }
}

/** Repair first_seen with an earlier business date carried by a late Transaction. */
export function repairLateFirstSeen(
  existing: readonly FirstSeenRecord[],
  transaction: CounterpartyTransaction,
): FirstSeenRecord[] {
  const relation: DailyCounterpartyRelation = {
    businessDate: transaction.businessDate,
    customerId: transaction.customerId,
    counterpartyId: transaction.counterpartyId,
    transactionCount: 1,
  }
  return applyFirstSeenState(existing, [relation], transaction.businessDate).state
}

export function formatPerformanceNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

export function formatPerformanceGb(value: number): string {
  return `${formatPerformanceNumber(value)} GB`
}

export function getEvidenceValue(evidence: readonly PerformanceEvidence[], label: string): string {
  return evidence.find((item) => item.label === label)?.value ?? '—'
}
