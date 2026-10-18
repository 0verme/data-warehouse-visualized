import { describe, expect, it } from 'vitest'
import { getOltpOlapAccessModel } from '../src/features/english-oltp-olap/model'

describe('English OLTP vs OLAP page-access fixture', () => {
  it('uses one fixed snapshot and an auditable equal-slot block definition', () => {
    const model = getOltpOlapAccessModel()

    expect(model.snapshotDate).toBe('2026-01-31')
    expect(model.rows).toHaveLength(8)
    expect(model.columns.map(({ id }) => id)).toEqual([
      'account_id',
      'branch',
      'product',
      'balance_cny',
    ])
    expect(model.rows.reduce((total, row) => total + row.balanceCny, 0)).toBe(28000)
    expect(model.scenarios.map(({ id }) => id)).toEqual(['point-update', 'analytical-scan'])
  })

  it('models a full-row point inspection as one row page or four column blocks', () => {
    const scenario = getOltpOlapAccessModel().scenarios[0]!

    expect(scenario.id).toBe('point-update')
    expect(scenario.result).toBe('A-105 · South · Savings · CN¥4,700.00')
    expect(scenario.rowLayout).toMatchObject({
      blockCount: 1,
      blocks: ['row page 03'],
      blockValueSlots: 8,
      slotsRead: 8,
      usefulValues: 4,
      readAmplification: 2,
    })
    expect(scenario.columnLayout).toMatchObject({
      blockCount: 4,
      blocks: [
        'account_id column block 01',
        'branch column block 01',
        'product column block 01',
        'balance_cny column block 01',
      ],
      blockValueSlots: 8,
      slotsRead: 32,
      usefulValues: 4,
      readAmplification: 8,
    })
    expect(scenario.note).toContain(
      'all write, logging, concurrency, and transaction costs are excluded',
    )
  })

  it('models the narrow aggregation as four row pages or one projected column block', () => {
    const scenario = getOltpOlapAccessModel().scenarios[1]!

    expect(scenario.id).toBe('analytical-scan')
    expect(scenario.result).toBe('CN¥28,000.00 across 8 accounts')
    expect(scenario.rowLayout).toMatchObject({
      blockCount: 4,
      blocks: ['row page 01', 'row page 02', 'row page 03', 'row page 04'],
      slotsRead: 32,
      usefulValues: 8,
      readAmplification: 4,
    })
    expect(scenario.columnLayout).toMatchObject({
      blockCount: 1,
      blocks: ['balance_cny column block 01'],
      slotsRead: 8,
      usefulValues: 8,
      readAmplification: 1,
    })
  })

  it('returns the same model on repeat evaluation without mutating the fixed fixture', () => {
    const first = getOltpOlapAccessModel()
    first.rows[0]!.balanceCny = 999999

    expect(getOltpOlapAccessModel()).toEqual(getOltpOlapAccessModel())
    expect(getOltpOlapAccessModel().rows[0]!.balanceCny).toBe(4200)
  })
})
