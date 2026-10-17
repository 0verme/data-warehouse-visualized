import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContractChangeLab } from '../src/components/english/ContractChangeLab'
import {
  BASE_CONTRACT_FIELDS,
  CONTRACT_CHANGES,
  buildContractReference,
  contractChangeView,
  findContractChange,
  silentChanges,
} from '../src/features/english-contracts/model'

const CJK = /[\u3400-\u9fff]/

describe('English data contracts model', () => {
  it('describes the base dataset with field semantics and consumers', () => {
    expect(BASE_CONTRACT_FIELDS.map((field) => field.name)).toEqual([
      'account_id',
      'snapshot_date',
      'balance',
      'currency',
      'branch_id',
      'updated_at',
    ])
    for (const field of BASE_CONTRACT_FIELDS) {
      expect(field.semantics.length).toBeGreaterThan(10)
      expect(field.consumedBy.length).toBeGreaterThan(0)
    }
  })

  it('classifies each change by compatibility, detection point and consumer effect', () => {
    const byId = new Map(CONTRACT_CHANGES.map((change) => [change.id, change]))

    expect(byId.get('add-nullable-column')).toMatchObject({
      compatibility: 'compatible',
      consumerEffect: 'none',
    })
    expect(byId.get('unit-change')).toMatchObject({
      compatibility: 'silent-risk',
      detectedAt: 'not-until-wrong',
      consumerEffect: 'silent-wrong',
    })
    expect(byId.get('relax-nullability')).toMatchObject({
      compatibility: 'breaking',
      detectedAt: 'runtime',
      consumerEffect: 'partial-loss',
    })
    expect(byId.get('add-required-column')).toMatchObject({
      compatibility: 'breaking',
      detectedAt: 'contract-test',
      consumerEffect: 'loud-failure',
    })
    expect(silentChanges()).toEqual(['unit-change'])
  })

  it('gives every change an explicit producer action and process', () => {
    for (const change of CONTRACT_CHANGES) {
      const view = contractChangeView(change)
      expect(view.producerAction.length, change.id).toBeGreaterThan(20)
      expect(view.verdict.length, change.id).toBeGreaterThan(20)
      expect(view.requiredProcess.length, change.id).toBeGreaterThanOrEqual(2)
      expect(view.compatibilityLabel.length, change.id).toBeGreaterThan(0)
      expect(view.detectionLabel.length, change.id).toBeGreaterThan(0)
      expect(view.effectLabel.length, change.id).toBeGreaterThan(0)
    }
  })

  it('keeps every rendered string free of Chinese copy', () => {
    const strings = CONTRACT_CHANGES.flatMap((change) => {
      const view = contractChangeView(change)
      return [
        view.label,
        view.summary,
        view.field,
        view.before,
        view.after,
        view.compatibilityLabel,
        view.detectionLabel,
        view.effectLabel,
        view.producerAction,
        view.verdict,
        ...view.requiredProcess,
        ...BASE_CONTRACT_FIELDS.flatMap((field) => [field.semantics]),
      ]
    })
    for (const value of strings) {
      expect(CJK.test(value), value).toBe(false)
    }
  })

  it('produces a deterministic reference snapshot', () => {
    const first = buildContractReference()
    const second = buildContractReference()
    expect(first).toEqual(second)
    expect(first).toHaveLength(8)
    expect(first.filter((row) => row.compatibility === 'compatible')).toHaveLength(2)
    expect(findContractChange('unit-change').field).toBe('balance')
  })

  it('renders the default silent-risk change with server-rendered process', () => {
    const markup = renderToStaticMarkup(<ContractChangeLab />)

    expect(markup).toContain('One dataset · eight interface changes')
    expect(markup).toContain('Change the unit of a column')
    expect(markup).toContain('silent risk')
    expect(markup).toContain('not until a number is wrong')
    expect(markup).toContain('Required process')
    expect(markup).toContain('aria-live="polite"')
  })
})
