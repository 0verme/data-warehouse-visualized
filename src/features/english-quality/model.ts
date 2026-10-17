/**
 * English presentation layer for the data quality checks page.
 *
 * The deterministic rule engine lives in `src/utils/data-quality.ts` and the
 * shared Banking Teaching Domain fixture in `src/features/data-quality`.
 * This module only:
 * - selects the failing-batch scenarios used by the English page;
 * - maps rules, dimensions, statuses and release decisions to English;
 * - exposes serializable reference data for the page and its tests.
 */
import {
  BANKING_DEPOSIT_BALANCE_DATE,
  BANKING_SCHEDULER_SCHEDULED_AT,
  bankingSchedulerVisualization,
} from '../scheduler/banking'
import {
  QUALITY_RULE_IDS,
  createDataQualityVisualization,
  createQualitySchedulerRun,
  createQualityTeachingModel,
  evaluateDataQuality,
} from '../../utils/data-quality'
import type {
  DataQualityVisualization,
  QualityAction,
  QualityCheckResult,
  QualityCheckStatus,
  QualityEvaluation,
  QualityReleaseStatus,
  QualityScenario,
} from '../data-quality/types'

export const QUALITY_CHECK_BUSINESS_DATE = BANKING_DEPOSIT_BALANCE_DATE

export interface QualityRuleCopy {
  ruleId: string
  name: string
  dimension: string
  question: string
  whatItProtects: string
}

export const QUALITY_RULE_COPY: readonly QualityRuleCopy[] = [
  {
    ruleId: QUALITY_RULE_IDS.grain,
    name: 'One row per account per snapshot day',
    dimension: 'Identity / grain',
    question: 'Why does one account appear twice on the same day?',
    whatItProtects: 'Any measure summed from the table',
  },
  {
    ruleId: QUALITY_RULE_IDS.requiredFields,
    name: 'Required fields are present',
    dimension: 'Field completeness',
    question: 'Can this record still identify an account, a day and a balance?',
    whatItProtects: 'Row-level usability of every record',
  },
  {
    ruleId: QUALITY_RULE_IDS.currency,
    name: 'currency is a registered code',
    dimension: 'Field semantics',
    question: 'Does currency = ??? still describe this balance?',
    whatItProtects: 'Every amount converted or compared by currency',
  },
  {
    ruleId: QUALITY_RULE_IDS.branchReference,
    name: 'branch_id resolves to a known branch',
    dimension: 'Referential integrity',
    question: 'Does this branch actually exist?',
    whatItProtects: 'Branch-level reporting and responsibility',
  },
  {
    ruleId: QUALITY_RULE_IDS.batchCompleteness,
    name: 'The expected account set arrived',
    dimension: 'Dataset completeness',
    question: '10,000 accounts were expected — why did only 7,000 arrive?',
    whatItProtects: 'Totals that silently shrink when rows are missing',
  },
  {
    ruleId: QUALITY_RULE_IDS.freshness,
    name: 'snapshot_date reaches the business date',
    dimension: 'Freshness',
    question: 'The job finished on time — why is the data still yesterday’s?',
    whatItProtects: 'Every report that assumes “today” means today',
  },
  {
    ruleId: QUALITY_RULE_IDS.reconciliation,
    name: 'DWD and DWS agree on the same scope',
    dimension: 'Cross-layer reconciliation',
    question: 'DWD holds 1,000,000,000 — why does DWS show 800,000,000?',
    whatItProtects: 'Agreement between the detail layer and the aggregate layer',
  },
  {
    ruleId: QUALITY_RULE_IDS.telemetryFormat,
    name: 'Telemetry records parse',
    dimension: 'Record format',
    question: 'A few independent events are broken — can they be isolated?',
    whatItProtects: 'Format-level usability of independent events',
  },
]

export interface QualityScenarioCopy {
  id: QualityScenario
  label: string
  batch: string
  expectedFailure: string
}

export const QUALITY_SCENARIOS: readonly QualityScenarioCopy[] = [
  {
    id: 'duplicate-grain',
    label: 'Duplicate account/day row',
    batch: 'The same account and snapshot day appear twice.',
    expectedFailure: 'One row per account per snapshot day',
  },
  {
    id: 'missing-required-field',
    label: 'balance is missing',
    batch: 'One row has no balance value at all.',
    expectedFailure: 'Required fields are present',
  },
  {
    id: 'invalid-currency',
    label: 'currency = ???',
    batch: 'The field has a value that is not a registered currency code.',
    expectedFailure: 'currency is a registered code',
  },
  {
    id: 'missing-branch-reference',
    label: 'Unknown branch B9999',
    batch: 'An account carries a branch id that is not in the branch reference set.',
    expectedFailure: 'branch_id resolves to a known branch',
  },
  {
    id: 'batch-incomplete',
    label: '10,000 expected, 7,000 arrived',
    batch: 'Every arrived row is valid, but 3,000 accounts are simply missing.',
    expectedFailure: 'The expected account set arrived',
  },
  {
    id: 'stale-snapshot',
    label: 'Latest snapshot date is still 09-29',
    batch: 'The job succeeded, but the output still represents the previous day.',
    expectedFailure: 'snapshot_date reaches the business date',
  },
  {
    id: 'balance-reconciliation-drift',
    label: 'DWD 1,000,000,000 vs DWS 800,000,000',
    batch: 'The detail layer and the aggregate layer disagree on the same scope.',
    expectedFailure: 'DWD and DWS agree on the same scope',
  },
  {
    id: 'telemetry-invalid-records',
    label: '3 invalid telemetry records',
    batch: 'Three independent events carry invalid JSON payloads.',
    expectedFailure: 'Telemetry records parse',
  },
]

export const QUALITY_STATUS_COPY: Readonly<
  Record<QualityCheckStatus, { label: string; tone: 'pass' | 'warn' | 'fail' }>
> = {
  pass: { label: 'pass', tone: 'pass' },
  warn: { label: 'warning', tone: 'warn' },
  fail: { label: 'fail', tone: 'fail' },
}

export const QUALITY_RELEASE_COPY: Readonly<
  Record<QualityReleaseStatus, { label: string; headline: string; nextStep: string }>
> = {
  released: {
    label: 'released',
    headline: 'Every check passed; the partition continues downstream.',
    nextStep: 'Publish the partition and let the downstream jobs run normally.',
  },
  blocked: {
    label: 'blocked',
    headline: 'A blocking check failed; the partition is not published.',
    nextStep:
      'Do not publish. Fix the failed rows at the source, re-run the producing task and validate again.',
  },
  quarantined: {
    label: 'quarantined',
    headline: 'The failing records are isolated and the valid records continue.',
    nextStep:
      'Publish the valid rows, keep the failing rows in quarantine and keep the alert open until they are cleared.',
  },
}

export const QUALITY_RELEASE_POLICIES: readonly {
  id: QualityAction
  label: string
  detail: string
}[] = [
  {
    id: 'block',
    label: 'Block on any failure',
    detail: 'One failed check stops the whole partition, whatever its scope.',
  },
  {
    id: 'quarantine',
    label: 'Quarantine isolated records',
    detail:
      'Isolated records can be quarantined; failures that affect shared business meaning still block.',
  },
]

export function createQualityScenario(): DataQualityVisualization {
  const schedulerRun = createQualitySchedulerRun(
    bankingSchedulerVisualization.tasks,
    QUALITY_CHECK_BUSINESS_DATE,
    'happy-path',
    BANKING_SCHEDULER_SCHEDULED_AT,
  )
  return createDataQualityVisualization(schedulerRun, 'rules', createQualityTeachingModel())
}

export function evaluateQualityScenario(
  visualization: DataQualityVisualization,
  scenario: QualityScenario,
  action: QualityAction = 'block',
): QualityEvaluation {
  return evaluateDataQuality(visualization, { scenario, action })
}

export interface QualityCheckView {
  ruleId: string
  name: string
  dimension: string
  status: QualityCheckStatus
  statusLabel: string
  observed: string
  expected: string
  violations: number
  evaluatedRows: number
  failedRows: number | null
}

export interface QualityReleaseView {
  action: QualityAction
  actionLabel: string
  status: QualityReleaseStatus
  statusLabel: string
  headline: string
  nextStep: string
  failed: readonly string[]
  warnings: readonly string[]
  affectedOutputs: readonly string[]
  quarantinedSamples: number
}

export function checkView(check: QualityCheckResult): QualityCheckView {
  const copy = QUALITY_RULE_COPY.find((rule) => rule.ruleId === check.ruleId)
  const { observed, expected } = englishObservation(check)
  return {
    ruleId: check.ruleId,
    name: copy?.name ?? check.ruleId,
    dimension: copy?.dimension ?? '—',
    status: check.status,
    statusLabel: QUALITY_STATUS_COPY[check.status].label,
    observed,
    expected,
    violations: check.violationCount,
    evaluatedRows: check.evaluatedRowCount,
    failedRows: check.failedRows ?? null,
  }
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? singular : plural}`
}

/** English observed/expected copy built from structured values, never from the Chinese summaries. */
function englishObservation(check: QualityCheckResult): { observed: string; expected: string } {
  switch (check.ruleId) {
    case QUALITY_RULE_IDS.grain:
      return {
        observed: formatCount(check.violationCount, 'duplicate row'),
        expected: '0 duplicate rows',
      }
    case QUALITY_RULE_IDS.requiredFields:
      return {
        observed: formatCount(check.violationCount, 'row') + ' with a missing required field',
        expected: '0 incomplete rows',
      }
    case QUALITY_RULE_IDS.batchCompleteness: {
      const arrived = check.evaluatedRowCount
      const expectedTotal = arrived + check.violationCount
      return {
        observed: `${arrived.toLocaleString('en-US')} accounts arrived`,
        expected: `${expectedTotal.toLocaleString('en-US')} accounts expected`,
      }
    }
    case QUALITY_RULE_IDS.reconciliation: {
      const match = String(check.observed).match(/-?\d+/)
      const delta = match ? Number(match[0]) : check.observedValue
      return {
        observed: `delta = ${delta.toLocaleString('en-US')}`,
        expected: 'delta = 0',
      }
    }
    case QUALITY_RULE_IDS.telemetryFormat:
      return {
        observed: formatCount(check.violationCount, 'invalid record'),
        expected: '0 invalid records',
      }
    case QUALITY_RULE_IDS.branchReference:
      return {
        observed: check.violationCount === 0 ? 'all rows resolve' : String(check.observed),
        expected: String(check.expected),
      }
    default:
      return { observed: String(check.observed), expected: String(check.expected) }
  }
}

export function checkViews(evaluation: QualityEvaluation): readonly QualityCheckView[] {
  return evaluation.checks.map(checkView)
}

export function releaseView(evaluation: QualityEvaluation): QualityReleaseView {
  const decision = evaluation.releaseDecision
  const copy = QUALITY_RELEASE_COPY[decision.status]
  const policy = QUALITY_RELEASE_POLICIES.find((item) => item.id === evaluation.action)
  return {
    action: evaluation.action,
    actionLabel: policy?.label ?? evaluation.action,
    status: decision.status,
    statusLabel: copy.label,
    headline: copy.headline,
    nextStep: copy.nextStep,
    failed: decision.failedRuleIds.map(ruleName),
    warnings: decision.warningRuleIds.map(ruleName),
    affectedOutputs: decision.affectedOutputs,
    quarantinedSamples: decision.quarantinedSampleCount,
  }
}

export function ruleName(ruleId: string): string {
  return QUALITY_RULE_COPY.find((rule) => rule.ruleId === ruleId)?.name ?? ruleId
}

export interface QualityReferenceRow {
  scenario: QualityScenario
  label: string
  failed: readonly string[]
  warnings: readonly string[]
  status: QualityReleaseStatus
  blockedUnderAnyPolicy: boolean
}

export function buildQualityReference(): readonly QualityReferenceRow[] {
  const visualization = createQualityScenario()
  return QUALITY_SCENARIOS.map((scenario) => {
    const blocked = evaluateQualityScenario(visualization, scenario.id, 'block')
    const quarantined = evaluateQualityScenario(visualization, scenario.id, 'quarantine')
    return {
      scenario: scenario.id,
      label: scenario.label,
      failed: blocked.releaseDecision.failedRuleIds.map(ruleName),
      warnings: blocked.releaseDecision.warningRuleIds.map(ruleName),
      status: blocked.releaseDecision.status,
      blockedUnderAnyPolicy: quarantined.releaseDecision.status === 'blocked',
    }
  })
}

export function evaluateAllScenarios(
  scenario: QualityScenario,
  action: QualityAction,
): QualityEvaluation {
  return evaluateQualityScenario(createQualityScenario(), scenario, action)
}
