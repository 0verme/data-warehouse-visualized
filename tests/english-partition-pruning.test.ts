import { describe, expect, it } from 'vitest'
import { scanLayoutData } from '../src/features/performance/banking'
import { getPartitionPruningSnapshot } from '../src/features/english-partition-pruning/model'

describe('English partition-pruning teaching model', () => {
  it('uses the shared fixture for a direct typed date range', () => {
    const snapshot = getPartitionPruningSnapshot('typed-range')

    expect(snapshot).toEqual({
      shape: 'typed-range',
      totalPartitions: 1095,
      scannedPartitions: 30,
      skippedPartitions: 1065,
      scanBytes: '82 TB',
      fileCount: 240_000,
    })
  })

  it('keeps the wrapped-key contrast illustrative and conservative', () => {
    const snapshot = getPartitionPruningSnapshot('wrapped-key')

    expect(snapshot).toEqual({
      shape: 'wrapped-key',
      totalPartitions: 1095,
      scannedPartitions: 1095,
      skippedPartitions: 0,
      scanBytes: '3.0 PB',
      fileCount: 8_760_000,
    })
  })

  it('does not mutate the shared lesson fixture', () => {
    const before = JSON.stringify(scanLayoutData)

    getPartitionPruningSnapshot('typed-range')
    getPartitionPruningSnapshot('wrapped-key')

    expect(JSON.stringify(scanLayoutData)).toBe(before)
  })
})
