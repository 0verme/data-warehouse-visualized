/**
 * English teaching model for the pipeline observability page.
 *
 * Observability is about signals over time, not about one batch. The model
 * below builds deterministic seven-run timelines for common failure patterns
 * and evaluates each signal against a fixed threshold. The thresholds are
 * teaching defaults, not universal SLO numbers.
 */

export const OBSERVABILITY_SIGNAL_IDS = [
  'run-status',
  'latency',
  'freshness',
  'volume',
  'error-rate',
  'backlog',
] as const

export type ObservabilitySignalId = (typeof OBSERVABILITY_SIGNAL_IDS)[number]

export interface ObservabilitySignalMeta {
  id: ObservabilitySignalId
  label: string
  question: string
  healthyWhen: string
  alertWhen: string
  falsePositive: string
}

export const OBSERVABILITY_SIGNALS: readonly ObservabilitySignalMeta[] = [
  {
    id: 'run-status',
    label: 'Run status',
    question: 'Did the scheduled run finish successfully?',
    healthyWhen: 'every run ends in success',
    alertWhen: 'a run fails or is manually stopped',
    falsePositive: 'A retry hides a first failure; count attempts, not only the final status.',
  },
  {
    id: 'latency',
    label: 'Latency',
    question: 'How long does a run take compared with its normal duration?',
    healthyWhen: 'duration stays inside its usual band',
    alertWhen: 'duration drifts upward across several runs',
    falsePositive: 'A one-off big input or backfill makes a single slow run look like a trend.',
  },
  {
    id: 'freshness',
    label: 'Freshness',
    question: 'Does the produced data represent the business date it should?',
    healthyWhen: 'the output reaches the current business date',
    alertWhen: 'the output lags by one or more business dates',
    falsePositive: 'A weekend or holiday can legitimately delay the next business date.',
  },
  {
    id: 'volume',
    label: 'Volume',
    question: 'How many rows arrived compared with the expected set?',
    healthyWhen: 'row count stays near the control total',
    alertWhen: 'row count drops sharply or trends down',
    falsePositive: 'A genuine business change (closed accounts, new policy) moves the baseline.',
  },
  {
    id: 'error-rate',
    label: 'Invalid rows',
    question: 'How many produced rows failed a quality check?',
    healthyWhen: 'no rows fail the blocking checks',
    alertWhen: 'invalid rows appear in produced data',
    falsePositive: 'A strict rule can flag acceptable edge cases; tune the rule, not the alert.',
  },
  {
    id: 'backlog',
    label: 'Backlog',
    question: 'Is work waiting faster than it is being processed?',
    healthyWhen: 'the queue drains between runs',
    alertWhen: 'queue depth grows across consecutive runs',
    falsePositive: 'A planned bulk ingestion creates a temporary backlog that drains on schedule.',
  },
]

export interface RunPoint {
  run: number
  label: string
  runStatus: 'success' | 'failed'
  durationMin: number
  freshnessLagDays: number
  rows: number
  invalidRows: number
  backlog: number
}

export const OBSERVABILITY_THRESHOLDS = {
  latencyMinutes: 60,
  volumeRows: 9_000,
  backlogItems: 50,
} as const

const RUN_DATES = ['10-24', '10-25', '10-26', '10-27', '10-28', '10-29', '10-30'] as const

const HEALTHY_POINT = {
  runStatus: 'success' as const,
  durationMin: 42,
  freshnessLagDays: 0,
  rows: 10_120,
  invalidRows: 0,
  backlog: 0,
}

function buildSeries(overrides: readonly (Partial<RunPoint> | undefined)[]): readonly RunPoint[] {
  return RUN_DATES.map((date, index) => ({
    run: index + 1,
    label: `Run ${index + 1} · ${date}`,
    ...HEALTHY_POINT,
    ...(overrides[index] ?? {}),
  }))
}

export interface ObservabilityScenario {
  id: string
  label: string
  summary: string
  headline: string
  whyGreenDashboardMissedIt: string
  operatorNext: string
  points: readonly RunPoint[]
}

export const OBSERVABILITY_SCENARIOS: readonly ObservabilityScenario[] = [
  {
    id: 'all-healthy',
    label: 'All healthy',
    summary: 'Seven normal runs: on time, complete, valid.',
    headline: 'Every signal stays inside its band for the whole window.',
    whyGreenDashboardMissedIt:
      'Nothing is hidden here — this is the baseline the other patterns deviate from.',
    operatorNext: 'Keep the baseline. A trend alert only works when normal is known.',
    points: buildSeries([]),
  },
  {
    id: 'latency-drift',
    label: 'Latency drift',
    summary: 'The run duration grows from 42 to 90 minutes while every run still succeeds.',
    headline:
      'Latency drifts upward and crosses its band at run 4, long before the SLA is breached.',
    whyGreenDashboardMissedIt:
      'Run status is green on every attempt; only the duration trend shows the problem.',
    operatorNext:
      'Check input growth, data skew and downstream waiting time before the SLA breach arrives.',
    points: buildSeries([
      { durationMin: 45 },
      { durationMin: 48 },
      { durationMin: 55 },
      { durationMin: 65 },
      { durationMin: 72 },
      { durationMin: 80 },
      { durationMin: 90 },
    ]),
  },
  {
    id: 'stale-output',
    label: 'Stale output',
    summary: 'The job succeeds, but the produced data still represents the previous business date.',
    headline: 'Freshness lags from run 4 while every run reports success.',
    whyGreenDashboardMissedIt:
      'The scheduler checks that the task arrived; it does not check what date the rows represent.',
    operatorNext:
      'Compare MAX(business_date) with the current business date; treat a lag as a data incident.',
    points: buildSeries([
      {},
      {},
      {},
      { freshnessLagDays: 1 },
      { freshnessLagDays: 1 },
      { freshnessLagDays: 2 },
      { freshnessLagDays: 2 },
    ]),
  },
  {
    id: 'volume-drop',
    label: 'Volume drop',
    summary: 'Valid rows arrive, but the count falls from ~10k to ~6k.',
    headline: 'Volume falls below the control band at run 4 with no failed run.',
    whyGreenDashboardMissedIt:
      'Six thousand valid rows look healthy if nobody compares them with the expected set.',
    operatorNext:
      'Compare against the expected account set, not against last run; missing rows have no error to alert on.',
    points: buildSeries([
      { rows: 10_080 },
      { rows: 9_950 },
      {},
      { rows: 6_200 },
      { rows: 6_100 },
      { rows: 6_050 },
      { rows: 5_980 },
    ]),
  },
  {
    id: 'invalid-rows',
    label: 'Partially invalid batch',
    summary: 'A few produced rows fail a blocking quality check; the job itself succeeds.',
    headline: 'Invalid rows appear at run 4 and disappear, but the batch was already published.',
    whyGreenDashboardMissedIt:
      'The pipeline is green; the quality failure lives in a separate signal that has to be watched.',
    operatorNext:
      'Keep the quality signal on the same timeline as run status, or the green run hides the bad batch.',
    points: buildSeries([{}, {}, {}, { invalidRows: 3 }, {}, {}, {}]),
  },
  {
    id: 'intermittent-failure',
    label: 'Intermittent failure',
    summary: 'Runs fail at run 3 and run 5, then recover without an operator change.',
    headline: 'Run status fails at run 3 and run 5; a single green run would hide the pattern.',
    whyGreenDashboardMissedIt:
      'Looking only at the latest run shows success; the failure rate lives across runs.',
    operatorNext:
      'Count failed attempts per window and inspect the retry history, not only the final status.',
    points: buildSeries([{}, {}, { runStatus: 'failed' }, {}, { runStatus: 'failed' }, {}, {}]),
  },
  {
    id: 'backlog-growth',
    label: 'Growing backlog',
    summary: 'Queue depth grows from 0 to 610 over seven runs.',
    headline: 'Backlog crosses its threshold at run 5 and keeps growing.',
    whyGreenDashboardMissedIt: 'Every run still succeeds; the queue simply never drains.',
    operatorNext:
      'Scale the worker or reduce the input rate before the queue reaches the freshness signal.',
    points: buildSeries([
      {},
      { backlog: 3 },
      { backlog: 12 },
      { backlog: 40 },
      { backlog: 110 },
      { backlog: 260 },
      { backlog: 610 },
    ]),
  },
  {
    id: 'upstream-late',
    label: 'Upstream arrives late',
    summary: 'A dependency is late, so the run waits; freshness follows.',
    headline: 'Latency rises at run 4 and freshness lags from the same run.',
    whyGreenDashboardMissedIt:
      'Waiting time is not an error; the run still ends successfully, just later and staler.',
    operatorNext:
      'Measure waiting time separately from compute time; fix the upstream SLA before the consumer notices.',
    points: buildSeries([
      {},
      { durationMin: 45 },
      { durationMin: 60 },
      { durationMin: 95, freshnessLagDays: 1 },
      { durationMin: 120, freshnessLagDays: 1 },
      { durationMin: 120, freshnessLagDays: 1 },
      { durationMin: 120, freshnessLagDays: 1 },
    ]),
  },
]

export function signalStatus(signal: ObservabilitySignalId, point: RunPoint): 'ok' | 'warn' {
  switch (signal) {
    case 'run-status':
      return point.runStatus === 'failed' ? 'warn' : 'ok'
    case 'latency':
      return point.durationMin > OBSERVABILITY_THRESHOLDS.latencyMinutes ? 'warn' : 'ok'
    case 'freshness':
      return point.freshnessLagDays > 0 ? 'warn' : 'ok'
    case 'volume':
      return point.rows < OBSERVABILITY_THRESHOLDS.volumeRows ? 'warn' : 'ok'
    case 'error-rate':
      return point.invalidRows > 0 ? 'warn' : 'ok'
    case 'backlog':
      return point.backlog > OBSERVABILITY_THRESHOLDS.backlogItems ? 'warn' : 'ok'
  }
}

export function firstFiredRun(
  scenario: ObservabilityScenario,
  signal: ObservabilitySignalId,
): number | null {
  for (const point of scenario.points) {
    if (signalStatus(signal, point) === 'warn') return point.run
  }
  return null
}

export function firedSignals(scenario: ObservabilityScenario): readonly ObservabilitySignalId[] {
  return OBSERVABILITY_SIGNAL_IDS.filter((signal) => firstFiredRun(scenario, signal) !== null)
}

export interface ObservabilityScenarioView {
  id: string
  label: string
  summary: string
  headline: string
  whyGreenDashboardMissedIt: string
  operatorNext: string
  firstSignal: ObservabilitySignalId | null
  firstSignalRun: number | null
  fired: readonly ObservabilitySignalId[]
  points: readonly RunPoint[]
}

export function scenarioView(scenario: ObservabilityScenario): ObservabilityScenarioView {
  const fired = firedSignals(scenario)
  const firstSignal = fired[0] ?? null
  return {
    id: scenario.id,
    label: scenario.label,
    summary: scenario.summary,
    headline: scenario.headline,
    whyGreenDashboardMissedIt: scenario.whyGreenDashboardMissedIt,
    operatorNext: scenario.operatorNext,
    firstSignal,
    firstSignalRun: firstSignal ? firstFiredRun(scenario, firstSignal) : null,
    fired,
    points: scenario.points,
  }
}

export function signalLabel(signal: ObservabilitySignalId): string {
  return OBSERVABILITY_SIGNALS.find((meta) => meta.id === signal)?.label ?? signal
}

export interface ObservabilityReferenceRow {
  id: string
  label: string
  firstSignal: ObservabilitySignalId | null
  firstSignalRun: number | null
  runStatusEverFailed: boolean
}

export function buildObservabilityReference(): readonly ObservabilityReferenceRow[] {
  return OBSERVABILITY_SCENARIOS.map((scenario) => {
    const view = scenarioView(scenario)
    return {
      id: scenario.id,
      label: scenario.label,
      firstSignal: view.firstSignal,
      firstSignalRun: view.firstSignalRun,
      runStatusEverFailed: scenario.points.some((point) => point.runStatus === 'failed'),
    }
  })
}
