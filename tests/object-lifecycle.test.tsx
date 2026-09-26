import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ObjectLifecycleLab } from '../src/components/visualizations/ObjectLifecycleLab'
import {
  createInitialObjectLifecycleSelection,
  getObjectLifecycleSnapshot,
  reduceObjectLifecycleSelection,
} from '../src/features/object-lifecycle/model'

describe('object lifecycle deterministic teaching model', () => {
  it('normal success: both strategies can produce complete data but differ in object identity', () => {
    const recreated = getObjectLifecycleSnapshot('drop-ctas', 'success')
    const fixed = getObjectLifecycleSnapshot('fixed-table', 'success')

    expect(recreated).toMatchObject({
      runStatus: 'SUCCESS',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 新对象代次 #02',
      schema: '从 SELECT 结果推导为 Schema v1。',
    })
    expect(fixed).toMatchObject({
      runStatus: 'SUCCESS',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
      schema: '维持预先声明的 Schema v1。',
    })
    expect(recreated.visibleData).toContain('完整的新结果')
    expect(fixed.visibleData).toContain('完整的新结果')
  })

  it('failure after object creation leaves an object but does not equate existence with release', () => {
    for (const strategy of ['drop-ctas', 'fixed-table'] as const) {
      const result = getObjectLifecycleSnapshot(strategy, 'after-create-failure')
      expect(result).toMatchObject({ runStatus: 'FAILED · 后续校验', targetExists: true })
      expect(result.visibleData).toContain('未通过校验')
      expect(result.conclusion).toContain('数据')
    }
  })

  it('write failure distinguishes a missing recreated object from an existing fixed object', () => {
    const recreated = getObjectLifecycleSnapshot('drop-ctas', 'insert-failure')
    const fixed = getObjectLifecycleSnapshot('fixed-table', 'insert-failure')

    expect(recreated).toMatchObject({
      runStatus: 'FAILED · CTAS',
      targetExists: false,
      objectIdentity: '目标名暂时没有对象',
    })
    expect(fixed).toMatchObject({
      runStatus: 'FAILED · INSERT',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
    })
    expect(recreated.transactionNote).toContain('DDL 包在事务里')
    expect(fixed.transactionNote).toContain('数据库可能恢复旧数据')
  })

  it('schema change is inferred by CTAS but requires a planned migration for a fixed table', () => {
    const recreated = getObjectLifecycleSnapshot('drop-ctas', 'schema-change')
    const fixed = getObjectLifecycleSnapshot('fixed-table', 'schema-change')

    expect(recreated).toMatchObject({
      runStatus: 'SUCCESS · Schema v2',
      targetExists: true,
      schema: '从 SELECT 推导为 Schema v2（新增 account_count）。',
    })
    expect(fixed).toMatchObject({
      runStatus: 'BLOCKED · Schema mismatch',
      targetExists: true,
      schema: '目标仍为 Schema v1；需先计划迁移到 Schema v2。',
    })
  })

  it('retry can restore data while identity continuity differs', () => {
    const recreated = getObjectLifecycleSnapshot('drop-ctas', 'retry')
    const fixed = getObjectLifecycleSnapshot('fixed-table', 'retry')

    expect(recreated).toMatchObject({
      runStatus: 'RETRY SUCCESS · Attempt 2',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 新对象代次 #03',
    })
    expect(fixed).toMatchObject({
      runStatus: 'RETRY SUCCESS · Attempt 2',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
    })
    expect(recreated.conclusion).toContain('对象缺口')
    expect(fixed.conclusion).toContain('不等于结果自动幂等')
  })

  it('keeps catalog, permissions, lineage and concurrent-reader observations conditional', () => {
    for (const strategy of ['drop-ctas', 'fixed-table'] as const) {
      const result = getObjectLifecycleSnapshot(strategy, 'success')
      const labels = result.observations.map((item) => item.label)
      expect(labels).toContain('Metadata')
      expect(labels).toContain('权限')
      expect(labels).toContain('Dependency')
      expect(labels).toContain('Lineage / observability')
      expect(labels).toContain('并发读者 / jobs')
      expect(result.transactionNote).toContain('数据库')
    }
  })

  it('selection transitions update strategy/event and reset to the deterministic initial state', () => {
    const initial = createInitialObjectLifecycleSelection()
    const changedStrategy = reduceObjectLifecycleSelection(initial, {
      type: 'select-strategy',
      strategy: 'fixed-table',
    })
    const changedEvent = reduceObjectLifecycleSelection(changedStrategy, {
      type: 'select-event',
      event: 'insert-failure',
    })

    expect(initial).toEqual({ strategy: 'drop-ctas', event: 'success' })
    expect(changedEvent).toEqual({ strategy: 'fixed-table', event: 'insert-failure' })
    expect(reduceObjectLifecycleSelection(changedEvent, { type: 'reset' })).toEqual(initial)
    expect(
      reduceObjectLifecycleSelection(initial, { type: 'select-event', event: 'success' }),
    ).toBe(initial)
  })

  it('renders both strategies, event controls, comparison and reset in the initial state', () => {
    const markup = renderToStaticMarkup(<ObjectLifecycleLab />)

    expect(markup).toContain('data-object-lifecycle-strategy="drop-ctas"')
    expect(markup).toContain('data-object-lifecycle-event="success"')
    expect(markup).toContain('DROP TABLE ads_deposit_balance_daily')
    expect(markup).toContain('TRUNCATE TABLE ads_deposit_balance_daily')
    expect(markup).toContain('正常成功')
    expect(markup).toContain('Schema stability')
    expect(markup).toContain('重置实验')
    expect(markup).toContain('依数据库实现而异')
  })
})
