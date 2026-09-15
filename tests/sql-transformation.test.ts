import { describe, expect, it } from 'vitest'
import {
  sqlAndTransformationContent,
  sqlTransformationDataset,
  sqlTransformationTaskContract,
  sqlTransformationVisualization,
} from '../src/content/lessons/sql-and-transformation'
import { DEPOSIT_BALANCE_SCOPE, depositLateBalanceSnapshot } from '../src/data/deposit-balance'
import {
  appendLateBalanceSnapshot,
  buildDepositBalanceRows,
  buildWrongMediumJoinRows,
  canExecuteTransformationStep,
  createInitialTransformationState,
  deduplicateBalanceSnapshots,
  executeTransformationStep,
  getJoinFanoutAnalysis,
  getLayerSnapshots,
  getMissingDimensionGaps,
  getTableMetrics,
  getTransformationStepResult,
  isInDatePartition,
  selectTransformationGrain,
  selectTransformationStep,
  setTransformationPrediction,
} from '../src/utils/sql-transformation'

const dataset = sqlTransformationDataset

describe('SQL 与数据加工实验', () => {
  it('课程元数据注册了存款余额加工契约', () => {
    expect(
      sqlAndTransformationContent.sections.some(
        (section) =>
          section.kind === 'visualization' && section.visualization.kind === 'sql-transformation',
      ),
    ).toBe(true)
    expect(sqlTransformationTaskContract).toMatchObject({
      taskId: 'transform.deposit-balance.daily.v1',
      inputTables: [
        'ods_account_balance_snapshot',
        'dim_account',
        'dim_customer',
        'dim_product',
        'dim_branch',
      ],
      outputTable: 'ads_deposit_balance_daily',
      outputGrain: 'snapshot_date × branch × customer_scope × product_type × currency',
      businessDate: '2026-09-30',
      partition: { column: 'snapshot_date', value: '2026-09-30' },
      isIdempotent: true,
      supportsPartialRerun: true,
    })
    expect(sqlTransformationVisualization.taskContract).toBe(sqlTransformationTaskContract)
  })

  it('按账户和快照日取最新记录，RMB 进入 DWD 后统一为 CNY', () => {
    expect(deduplicateBalanceSnapshots(dataset.accountBalanceSnapshots)).toHaveLength(4)

    const result = getTransformationStepResult(dataset, 'clean-detail')
    expect(result.input.rows).toHaveLength(5)
    expect(result.output.rows).toHaveLength(4)
    expect(result.output.rows.find((row) => row.account_id === 'A001')).toMatchObject({
      balance: 100000,
      currency: 'CNY',
    })
    expect(result.output.rows.find((row) => row.account_id === 'A002')).toMatchObject({
      source_currency: 'RMB',
      currency: 'CNY',
    })
    expect(result.changes.find((change) => change.key.includes('A001'))).toMatchObject({
      kind: 'merged',
      beforeCount: 2,
      afterCount: 1,
    })
  })

  it('LEFT JOIN 保留缺失客户和产品的余额事实', () => {
    const rows = buildDepositBalanceRows(dataset)
    const gaps = getMissingDimensionGaps(dataset)

    expect(gaps).toEqual([
      { accountId: 'A003', missingDimensions: ['customer'] },
      { accountId: 'A004', missingDimensions: ['product'] },
    ])
    expect(rows.find((row) => row.account_id === 'A003')).toMatchObject({
      balance: 80000,
      customer_id: 'C404',
      customer_scope: null,
      missing_dimensions: 'customer',
    })
    expect(rows.find((row) => row.account_id === 'A004')).toMatchObject({
      balance: 50000,
      product_id: 'P404',
      product_type: null,
      missing_dimensions: 'product',
    })
    expect(isInDatePartition('2026-09-30 23:59:59', '2026-09-30')).toBe(true)
    expect(isInDatePartition('2026-10-01 00:00:00', '2026-09-30')).toBe(false)
    expect(isInDatePartition(null, '2026-09-30')).toBe(false)
  })

  it('一对多 AccountMedium Join 会复制 A001 并放大目标余额', () => {
    const result = getTransformationStepResult(dataset, 'join-fanout')
    const analysis = getJoinFanoutAnalysis(dataset)
    const a001Rows = result.output.rows.filter((row) => row.account_id === 'A001')

    expect(buildWrongMediumJoinRows(dataset)).toHaveLength(6)
    expect(a001Rows).toHaveLength(3)
    expect(analysis).toMatchObject({
      leftRows: 4,
      rightRows: 5,
      outputRows: 6,
      correctOutputRows: 4,
      correctTargetAmount: 300000,
      wrongTargetAmount: 500000,
    })
    expect(result.changes.find((change) => change.key.includes('A001'))).toMatchObject({
      kind: 'duplicated',
      beforeCount: 1,
      afterCount: 3,
    })
    expect(result.evidence[0]).toMatchObject({
      kind: 'one-to-many',
      keys: ['A001', '1 × 3 = 3', '100000 → 300000'],
    })
  })

  it('DWD → DWS → ADS 按指标维度聚合为 3 行和 1 行', () => {
    const dws = getTransformationStepResult(dataset, 'aggregate-layers')
    const ads = getTransformationStepResult(dataset, 'contract')

    expect(dws.output.rows).toHaveLength(3)
    expect(dws.outputMetrics.targetAmount).toBe(430000)
    expect(
      dws.output.rows.find(
        (row) =>
          row.branch_name === DEPOSIT_BALANCE_SCOPE.branchName &&
          row.customer_scope === DEPOSIT_BALANCE_SCOPE.customerScope,
      ),
    ).toMatchObject({ balance: 300000, product_type: '定期', currency: 'CNY' })
    expect(ads.output.rows).toHaveLength(1)
    expect(ads.output.rows[0]).toMatchObject({
      snapshot_date: '2026-09-30',
      metric_name: '存款余额',
      balance: 300000,
    })
  })

  it('迟到余额仍写回原业务日期，重复注入不会重复数据', () => {
    const legacyLateResult = getTransformationStepResult(dataset, 'order', 'late-data')
    const lateDataset = appendLateBalanceSnapshot(dataset, depositLateBalanceSnapshot)
    const appendedAgain = appendLateBalanceSnapshot(lateDataset, depositLateBalanceSnapshot)
    const lateAds = getLayerSnapshots(lateDataset).find((snapshot) => snapshot.layer === 'ads')

    expect(legacyLateResult.outputMetrics.targetAmount).toBe(340000)
    expect(lateDataset.accountBalanceSnapshots).toHaveLength(6)
    expect(appendedAgain.accountBalanceSnapshots).toHaveLength(6)
    expect(lateAds?.tables[0]?.rows[0]).toMatchObject({
      snapshot_date: '2026-09-30',
      balance: 340000,
    })
  })

  it('五个加工步骤按计划、清洗、Join、聚合、契约顺序执行', () => {
    let state = createInitialTransformationState()

    expect(canExecuteTransformationStep(state)).toBe(false)
    state = selectTransformationGrain(state, 'business-scope-day')
    state = setTransformationPrediction(state, 'unchanged')
    expect(canExecuteTransformationStep(state)).toBe(true)

    state = executeTransformationStep(state)
    expect(state.completedStepIds).toEqual(['plan'])
    expect(state.activeStepId).toBe('clean-detail')
    expect(selectTransformationStep(state, 'join-fanout')).toEqual(state)

    state = setTransformationPrediction(state, 'decrease')
    state = executeTransformationStep(state)
    state = setTransformationPrediction(state, 'increase')
    state = executeTransformationStep(state)
    state = setTransformationPrediction(state, 'decrease')
    state = executeTransformationStep(state)
    state = setTransformationPrediction(state, 'decrease')
    state = executeTransformationStep(state)

    expect(state.completedStepIds).toEqual([
      'plan',
      'clean-detail',
      'join-fanout',
      'aggregate-layers',
      'contract',
    ])
  })

  it('表快照指标对没有金额字段的指标卡采用确定的 0', () => {
    const definition = getLayerSnapshots(dataset)[0]?.tables.find(
      (table) => table.id === 'ods-account-balance-snapshots',
    )
    const plan = getTransformationStepResult(dataset, 'plan')

    expect(definition).toBeDefined()
    expect(getTableMetrics(definition!, dataset.targetDate)).toMatchObject({
      rowCount: 5,
      amount: 528000,
      amountColumn: 'balance',
    })
    expect(plan.inputMetrics.amount).toBe(0)
  })
})
