import { describe, expect, it } from 'vitest'
import { skewData } from '../src/features/performance/banking'
import { getDataSkewSnapshot } from '../src/features/english-data-skew/model'

describe('English data-skew teaching model', () => {
  it('derives the long-tail baseline from the existing shuffle-skew fixture', () => {
    const snapshot = getDataSkewSnapshot('unsplit')

    expect(snapshot.workers.map(({ totalInputGb }) => totalInputGb)).toEqual([80, 75, 92, 680])
    expect(snapshot.totalInputGb).toBe(927)
    expect(snapshot.averageInputGb).toBe(231.75)
    expect(snapshot.maximumInputGb).toBe(680)
    expect(snapshot.maximumToAverageRatio).toBe(2.93)
    expect(snapshot.longestWorkerId).toBe('Worker 4')
  })

  it('splits only the simulated hot-key input while preserving total input', () => {
    const baseline = getDataSkewSnapshot('unsplit')
    const salted = getDataSkewSnapshot('salted')

    expect(salted.workers.map(({ totalInputGb }) => totalInputGb)).toEqual([250, 245, 262, 170])
    expect(salted.workers.map(({ hotKeyInputGb }) => hotKeyInputGb)).toEqual([170, 170, 170, 170])
    expect(salted.totalInputGb).toBe(baseline.totalInputGb)
    expect(salted.averageInputGb).toBe(baseline.averageInputGb)
    expect(salted.maximumInputGb).toBe(262)
    expect(salted.maximumToAverageRatio).toBe(1.13)
    expect(salted.longestWorkerId).toBe('Worker 3')
  })

  it('does not mutate the shared Chinese lesson fixture', () => {
    const before = JSON.stringify(skewData)

    getDataSkewSnapshot('unsplit')
    getDataSkewSnapshot('salted')

    expect(JSON.stringify(skewData)).toBe(before)
  })
})
