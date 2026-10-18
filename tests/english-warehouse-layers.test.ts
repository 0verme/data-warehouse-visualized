import { describe, expect, it } from 'vitest'
import { sqlTransformationLayersContent } from '../src/content/lessons/sql-and-transformation-layers'
import { warehouseLayersContent } from '../src/content/lessons/warehouse-layers'
import { getWarehouseLayersDecisionModel } from '../src/features/english-warehouse-layers/model'

const cjkOrReplacement = /[\u3400-\u9fff\uFFFD]/u

describe('English warehouse-layers decision model', () => {
  it('derives row counts and the published metric from the existing fixed lesson fixture', () => {
    const model = getWarehouseLayersDecisionModel()

    expect(model.fixedExample).toEqual({
      snapshotDate: '2026-09-30',
      sourceRows: 5,
      standardizedDetailRows: 4,
      groupedRows: 3,
      publishedMetricRows: 1,
      publishedMetricAmount: 300_000,
    })
  })

  it('distinguishes direct repeated work from shared responsibility stages', () => {
    const model = getWarehouseLayersDecisionModel()
    const single = model.plans.find(({ id }) => id === 'one-consumer')
    const two = model.plans.find(({ id }) => id === 'two-consumers')
    const many = model.plans.find(({ id }) => id === 'many-consumers')

    expect(single).toMatchObject({
      architecture: 'direct',
      consumers: [{ label: 'Loan-to-deposit report' }],
      repeatedWorkSlots: 3,
      sharedStages: [],
    })
    expect(two).toMatchObject({
      architecture: 'direct',
      consumers: [{ label: 'Daily ratio report' }, { label: 'Branch operations report' }],
      repeatedWorkSlots: 6,
      repeatedResponsibilities: [
        'Read the source snapshots',
        'Align branch identifiers',
        'Aggregate balances and apply the same ratio definition',
      ],
    })
    expect(many).toMatchObject({
      architecture: 'shared',
      consumers: [
        { label: 'Daily ratio report' },
        { label: 'Branch operations report' },
        { label: 'Management dashboard' },
        { label: 'Metrics API' },
      ],
      repeatedWorkSlots: 0,
      sharedStages: [
        { role: 'Staging', output: 'raw_core + raw_credit' },
        { role: 'Core', output: 'banking_detail' },
        { role: 'Mart', output: 'branch_ratio' },
      ],
    })
  })

  it('returns deterministic English-only presentation data without mutating lesson assets', () => {
    const warehouseBefore = JSON.stringify(warehouseLayersContent)
    const transformationBefore = JSON.stringify(sqlTransformationLayersContent)
    const first = getWarehouseLayersDecisionModel()
    const second = getWarehouseLayersDecisionModel()

    expect(first).toEqual(second)
    expect(JSON.stringify(first)).not.toMatch(cjkOrReplacement)
    expect(JSON.stringify(warehouseLayersContent)).toBe(warehouseBefore)
    expect(JSON.stringify(sqlTransformationLayersContent)).toBe(transformationBefore)
  })
})
