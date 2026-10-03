/**
 * English teaching model for "data lineage vs task dependency".
 *
 * One workflow is described by two graphs:
 * - the scheduler graph: which job waits for which job;
 * - the data lineage graph: which data is read to produce which data.
 */

export type FlowNodeKind = 'job' | 'table' | 'view' | 'report'

export interface FlowNode {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly kind: FlowNodeKind
}

export interface FlowEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly label: string
}

export const schedulerNodes: readonly FlowNode[] = [
  {
    id: 'JOB_A',
    label: 'JOB_A',
    detail: 'loads stg_orders from raw_orders',
    kind: 'job',
  },
  {
    id: 'JOB_REPORT',
    label: 'JOB_REPORT',
    detail: 'writes report_daily from v_customer_orders',
    kind: 'job',
  },
]

export const schedulerEdges: readonly FlowEdge[] = [
  {
    id: 'sched-a-report',
    from: 'JOB_A',
    to: 'JOB_REPORT',
    label: 'depends_on (declared)',
  },
]

export const lineageNodes: readonly FlowNode[] = [
  { id: 'raw_orders', label: 'raw_orders', detail: 'source table', kind: 'table' },
  { id: 'stg_orders', label: 'stg_orders', detail: 'staging table', kind: 'table' },
  {
    id: 'v_customer_orders',
    label: 'v_customer_orders',
    detail: 'view: reads stg_orders + customers',
    kind: 'view',
  },
  { id: 'customers', label: 'customers', detail: 'loaded by another team', kind: 'table' },
  { id: 'report_daily', label: 'report_daily', detail: 'consumer report', kind: 'report' },
]

export const lineageEdges: readonly FlowEdge[] = [
  { id: 'lin-raw-stg', from: 'raw_orders', to: 'stg_orders', label: 'reads' },
  { id: 'lin-stg-view', from: 'stg_orders', to: 'v_customer_orders', label: 'reads' },
  {
    id: 'lin-cust-view',
    from: 'customers',
    to: 'v_customer_orders',
    label: 'reads (hidden by the view)',
  },
  { id: 'lin-view-report', from: 'v_customer_orders', to: 'report_daily', label: 'writes' },
]

export type ScenarioId = 'baseline' | 'late-customers' | 'rerun-job-a' | 'skip-report'

export interface Scenario {
  readonly id: ScenarioId
  readonly label: string
  readonly question: string
  readonly schedulerAffected: readonly string[]
  readonly schedulerGap: readonly string[]
  readonly lineageAffected: readonly string[]
  readonly conclusion: string
}

export const scenarios: readonly Scenario[] = [
  {
    id: 'baseline',
    label: 'Baseline',
    question: 'How does the workflow look before anything goes wrong?',
    schedulerAffected: [],
    schedulerGap: [],
    lineageAffected: [],
    conclusion:
      'The scheduler knows JOB_REPORT waits for JOB_A. The data lineage also shows that report_daily depends on customers through v_customer_orders. The two graphs already describe different facts.',
  },
  {
    id: 'late-customers',
    label: 'customers arrives late',
    question: 'Which graph shows the impact on report_daily?',
    schedulerAffected: [],
    schedulerGap: ['JOB_REPORT'],
    lineageAffected: ['customers', 'v_customer_orders', 'report_daily'],
    conclusion:
      'Only the lineage graph connects customers to report_daily. The scheduler graph has no declared dependency, so a scheduler-only impact analysis reports no upstream problem — even though the report contains stale customer attributes.',
  },
  {
    id: 'rerun-job-a',
    label: 'JOB_A must be rerun',
    question: 'Do both graphs agree on what is affected?',
    schedulerAffected: ['JOB_A', 'JOB_REPORT'],
    schedulerGap: [],
    lineageAffected: ['raw_orders', 'stg_orders', 'v_customer_orders', 'report_daily'],
    conclusion:
      'Both graphs agree that the report must be rebuilt after JOB_A. The scheduler tells you what to re-trigger; the lineage tells you which tables actually change. This is the case where the two views complement each other.',
  },
  {
    id: 'skip-report',
    label: 'JOB_REPORT is skipped',
    question: 'What does each graph reveal downstream?',
    schedulerAffected: ['JOB_REPORT'],
    schedulerGap: [],
    lineageAffected: ['v_customer_orders', 'report_daily'],
    conclusion:
      'The scheduler shows the job did not run. The lineage shows which data becomes stale as a result. Neither answer alone is enough: one is about execution, the other about data.',
  },
]

export function getScenario(id: ScenarioId): Scenario {
  return scenarios.find((scenario) => scenario.id === id) ?? scenarios[0]!
}
