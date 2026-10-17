import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ObservabilitySignalsLab } from '../src/components/english/ObservabilitySignalsLab'
import {
  OBSERVABILITY_SCENARIOS,
  OBSERVABILITY_SIGNALS,
  buildObservabilityReference,
  firedSignals,
  firstFiredRun,
  scenarioView,
} from '../src/features/english-observability/model'

const CJK = /[\u3400-\u9fff]/

function scenario(id: string) {
  const found = OBSERVABILITY_SCENARIOS.find((item) => item.id === id)
  if (!found) throw new Error(`missing scenario ${id}`)
  return found
}

describe('English pipeline observability model', () => {
  it('keeps seven runs and six signals for every pattern', () => {
    expect(OBSERVABILITY_SIGNALS).toHaveLength(6)
    for (const item of OBSERVABILITY_SCENARIOS) {
      expect(item.points, item.id).toHaveLength(7)
      expect(item.points.map((point) => point.run)).toEqual([1, 2, 3, 4, 5, 6, 7])
    }
  })

  it('fires no signal for the healthy baseline', () => {
    const healthy = scenario('all-healthy')
    expect(firedSignals(healthy)).toEqual([])
    expect(scenarioView(healthy).firstSignal).toBeNull()
  })

  it('finds the first moving signal for each failure pattern', () => {
    expect(firstFiredRun(scenario('latency-drift'), 'latency')).toBe(4)
    expect(firstFiredRun(scenario('stale-output'), 'freshness')).toBe(4)
    expect(firstFiredRun(scenario('volume-drop'), 'volume')).toBe(4)
    expect(firstFiredRun(scenario('invalid-rows'), 'error-rate')).toBe(4)
    expect(firstFiredRun(scenario('intermittent-failure'), 'run-status')).toBe(3)
    expect(firstFiredRun(scenario('backlog-growth'), 'backlog')).toBe(5)
    expect(firstFiredRun(scenario('upstream-late'), 'latency')).toBe(4)
    expect(firstFiredRun(scenario('upstream-late'), 'freshness')).toBe(4)
  })

  it('shows patterns where run status never fails but data is still broken', () => {
    for (const id of [
      'latency-drift',
      'stale-output',
      'volume-drop',
      'invalid-rows',
      'backlog-growth',
    ]) {
      const item = scenario(id)
      expect(
        item.points.every((point) => point.runStatus === 'success'),
        id,
      ).toBe(true)
      expect(firedSignals(item).length, id).toBeGreaterThan(0)
    }
  })

  it('keeps every rendered string free of Chinese copy', () => {
    const strings = OBSERVABILITY_SCENARIOS.flatMap((item) => [
      item.label,
      item.summary,
      item.headline,
      item.whyGreenDashboardMissedIt,
      item.operatorNext,
      ...item.points.map((point) => point.label),
    ])
    for (const signal of OBSERVABILITY_SIGNALS) {
      strings.push(
        signal.label,
        signal.question,
        signal.healthyWhen,
        signal.alertWhen,
        signal.falsePositive,
      )
    }
    for (const value of strings) {
      expect(CJK.test(value), value).toBe(false)
    }
  })

  it('produces a deterministic reference snapshot', () => {
    const first = buildObservabilityReference()
    const second = buildObservabilityReference()
    expect(first).toEqual(second)
    expect(first).toHaveLength(8)
    expect(first.find((row) => row.id === 'all-healthy')?.firstSignal).toBeNull()
    expect(first.find((row) => row.id === 'intermittent-failure')?.runStatusEverFailed).toBe(true)
  })

  it('renders the stale-output pattern with server-rendered signals', () => {
    const markup = renderToStaticMarkup(<ObservabilitySignalsLab />)

    expect(markup).toContain('Seven runs · six signals · one story')
    expect(markup).toContain('Stale output')
    expect(markup).toContain('Freshness at run 4')
    expect(markup).toContain('Signal timeline across the seven runs')
    expect(markup).toContain('aria-live="polite"')
  })
})
