import { describe, expect, it } from 'vitest'
import { buildIncrementalLoadComparison } from '../src/features/english-load-comparison/model'

describe('English incremental versus full-load comparison', () => {
  it('uses the existing microbatch change fixture and exposes late arrivals after the first cutoff', () => {
    const comparison = buildIncrementalLoadComparison()

    expect(comparison.initialAsOf).toBe('10:06')
    expect(comparison.finalAsOf).toBe('10:10')
    expect(comparison.initialCheckpoint).toEqual({ time: '10:05', id: 'change-003-v1' })
    expect(comparison.sourceChanges).toHaveLength(5)
    expect(
      comparison.lateChanges.map(({ id, eventTime, availableAt }) => ({
        id,
        eventTime,
        availableAt,
      })),
    ).toEqual([
      { id: 'change-004-v1', eventTime: '10:04', availableAt: '10:08' },
      { id: 'change-001-v2', eventTime: '10:02', availableAt: '10:09' },
    ])
  })

  it('rebuilds all windows for the full reference and only the affected window incrementally', () => {
    const comparison = buildIncrementalLoadComparison()
    const fullLoad = comparison.plans.find(({ id }) => id === 'full-load')!
    const arrivalCursor = comparison.plans.find(({ id }) => id === 'arrival-cursor')!

    expect(fullLoad.sourceRowsRecomputed).toBe(5)
    expect(fullLoad.windowsRecomputed).toEqual(['10:00–10:05', '10:05–10:10'])
    expect(
      fullLoad.output.map(({ transactionCount, amountTotal }) => ({
        transactionCount,
        amountTotal,
      })),
    ).toEqual([
      { transactionCount: 3, amountTotal: 720 },
      { transactionCount: 1, amountTotal: 300 },
    ])
    expect(fullLoad.totalAmount).toBe(1020)

    expect(arrivalCursor.candidateChanges).toHaveLength(2)
    expect(arrivalCursor.sourceRowsRecomputed).toBe(4)
    expect(arrivalCursor.windowsRecomputed).toEqual(['10:00–10:05'])
    expect(arrivalCursor.output).toEqual(fullLoad.output)
    expect(arrivalCursor.totalAmount).toBe(fullLoad.totalAmount)
    expect(arrivalCursor.equalsFullLoad).toBe(true)
  })

  it('shows that an event-time-only watermark misses late changes', () => {
    const comparison = buildIncrementalLoadComparison()
    const eventTimeOnly = comparison.plans.find(({ id }) => id === 'event-time-only')!
    const fullLoad = comparison.plans.find(({ id }) => id === 'full-load')!

    expect(comparison.eventTimeWatermark).toBe('10:05')
    expect(eventTimeOnly.candidateChanges).toHaveLength(0)
    expect(eventTimeOnly.windowsRecomputed).toEqual([])
    expect(eventTimeOnly.totalAmount).toBe(600)
    expect(eventTimeOnly.output).not.toEqual(fullLoad.output)
    expect(eventTimeOnly.equalsFullLoad).toBe(false)
  })

  it('produces the same deterministic reference on repeated evaluation', () => {
    expect(buildIncrementalLoadComparison()).toEqual(buildIncrementalLoadComparison())
  })
})
