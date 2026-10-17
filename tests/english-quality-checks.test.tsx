import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { QualityChecksLab } from '../src/components/english/QualityChecksLab'
import {
  QUALITY_RULE_COPY,
  QUALITY_SCENARIOS,
  buildQualityReference,
  checkViews,
  createQualityScenario,
  evaluateQualityScenario,
  releaseView,
} from '../src/features/english-quality/model'
import { QUALITY_RULE_IDS } from '../src/utils/data-quality'

const CJK = /[\u3400-\u9fff]/

function evaluationFor(
  scenario: (typeof QUALITY_SCENARIOS)[number]['id'],
  action: 'block' | 'quarantine' = 'block',
) {
  return evaluateQualityScenario(createQualityScenario(), scenario, action)
}

describe('English data quality checks model', () => {
  it('covers the eight teaching rules once each', () => {
    expect(QUALITY_RULE_COPY.map((rule) => rule.ruleId)).toEqual([
      QUALITY_RULE_IDS.grain,
      QUALITY_RULE_IDS.requiredFields,
      QUALITY_RULE_IDS.currency,
      QUALITY_RULE_IDS.branchReference,
      QUALITY_RULE_IDS.batchCompleteness,
      QUALITY_RULE_IDS.freshness,
      QUALITY_RULE_IDS.reconciliation,
      QUALITY_RULE_IDS.telemetryFormat,
    ])
    expect(new Set(QUALITY_RULE_COPY.map((rule) => rule.dimension)).size).toBe(8)
  })

  it('fails exactly the rule named by each broken-batch scenario', () => {
    for (const scenario of QUALITY_SCENARIOS) {
      const failed = checkViews(evaluationFor(scenario.id)).filter(
        (check) => check.status === 'fail',
      )
      expect(
        failed.map((check) => check.name),
        scenario.id,
      ).toEqual([scenario.expectedFailure])
      // The other seven checks still run and pass; the batch is evaluated as a whole.
      expect(checkViews(evaluationFor(scenario.id))).toHaveLength(8)
    }
  })

  it('blocks banking failures under every policy and only quarantines isolated telemetry records', () => {
    for (const scenario of QUALITY_SCENARIOS) {
      const blocked = releaseView(evaluationFor(scenario.id, 'block')).status
      const quarantined = releaseView(evaluationFor(scenario.id, 'quarantine')).status
      if (scenario.id === 'telemetry-invalid-records') {
        expect(blocked).toBe('blocked')
        expect(quarantined).toBe('quarantined')
        expect(releaseView(evaluationFor(scenario.id, 'quarantine')).quarantinedSamples).toBe(3)
      } else {
        expect(blocked).toBe('blocked')
        expect(quarantined).toBe('blocked')
      }
    }
  })

  it('reports observed and expected values without leaking the Chinese summaries', () => {
    const incomplete = checkViews(evaluationFor('batch-incomplete'))
    const completeness = incomplete.find(
      (check) => check.name === 'The expected account set arrived',
    )
    expect(completeness?.observed).toBe('7,000 accounts arrived')
    expect(completeness?.expected).toBe('10,000 accounts expected')

    const drift = checkViews(evaluationFor('balance-reconciliation-drift')).find(
      (check) => check.status === 'fail',
    )
    expect(drift?.observed).toBe('delta = -200,000,000')
    expect(drift?.expected).toBe('delta = 0')

    for (const scenario of QUALITY_SCENARIOS) {
      for (const policy of ['block', 'quarantine'] as const) {
        const evaluation = evaluationFor(scenario.id, policy)
        const strings = [
          ...checkViews(evaluation).flatMap((check) => [
            check.name,
            check.dimension,
            check.observed,
            check.expected,
            check.statusLabel,
          ]),
          ...Object.values(releaseView(evaluation)).flatMap((value) =>
            Array.isArray(value) ? value : [String(value)],
          ),
        ]
        for (const value of strings) {
          expect(CJK.test(value), `${scenario.id}/${policy}: ${value}`).toBe(false)
        }
      }
    }
  })

  it('produces a deterministic reference snapshot', () => {
    const first = buildQualityReference()
    const second = buildQualityReference()
    expect(first).toEqual(second)
    expect(first).toHaveLength(8)
    expect(first.every((row) => row.failed.length === 1)).toBe(true)
    expect(first.filter((row) => row.blockedUnderAnyPolicy === false)).toHaveLength(1)
  })

  it('renders the first broken batch with server-rendered checks', () => {
    const markup = renderToStaticMarkup(<QualityChecksLab />)

    expect(markup).toContain('One batch · eight checks · one release decision')
    expect(markup).toContain('Duplicate account/day row')
    expect(markup).toContain('Checks executed against the batch')
    expect(markup).toContain('One row per account per snapshot day')
    expect(markup).toContain('blocked')
    expect(markup).toContain('aria-live="polite"')
  })
})
