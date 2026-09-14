import { describe, expect, it } from 'vitest'
import {
  sqlAndTransformationContent,
  sqlTransformationDataset,
  sqlTransformationTaskContract,
  sqlTransformationVisualization,
} from '../src/content/lessons/sql-and-transformation'
import type { TransformationGrain } from '../src/features/sql-transformation/types'
import {
  appendLateData,
  buildOrderRows,
  canExecuteTransformationStep,
  createInitialTransformationState,
  deduplicateOrderEvents,
  deduplicatePaymentEvents,
  executeTransformationStep,
  getLayerSnapshots,
  getTableMetrics,
  getTransformationStepResult,
  isInDatePartition,
  selectTransformationGrain,
  selectTransformationStep,
  setTransformationPrediction,
} from '../src/utils/sql-transformation'

const dataset = sqlTransformationDataset

function getResult(
  grain: TransformationGrain,
  stepId: Parameters<typeof getTransformationStepResult>[2],
) {
  return getTransformationStepResult(dataset, grain, stepId)
}

describe('SQL 与数据加工实验', () => {
  it('课程元数据注册了正式的 SQL 工作台和 #12 任务契约', () => {
    expect(
      sqlAndTransformationContent.sections.some(
        (section) =>
          section.kind === 'visualization' && section.visualization.kind === 'sql-transformation',
      ),
    ).toBe(true)
    expect(sqlTransformationTaskContract).toMatchObject({
      taskId: 'transform.sales.daily.v1',
      inputTables: ['dws_sales_daily'],
      outputTable: 'ads_yesterday_sales',
      partition: { column: 'dt', value: '2026-09-13' },
      isIdempotent: true,
      supportsPartialRerun: true,
    })
    expect(sqlTransformationVisualization.taskContract).toBe(sqlTransformationTaskContract)
  })

  it('去重会把 O1002 的重复订单和支付事件各压成一条', () => {
    expect(deduplicateOrderEvents(dataset.orders)).toHaveLength(4)
    expect(deduplicatePaymentEvents(dataset.payments)).toHaveLength(3)

    const result = getResult('order', 'deduplicate')
    expect(result.input.rows).toHaveLength(5)
    expect(result.output.rows).toHaveLength(4)
    expect(result.changes.find((change) => change.key.includes('O1002'))).toMatchObject({
      kind: 'merged',
      beforeCount: 2,
      afterCount: 1,
    })
  })

  it('错误的多对多 JOIN 会把 O1002 变成 8 行并把昨日金额放大', () => {
    const result = getResult('order', 'wrong-join')
    const orderRows = result.output.rows.filter((row) => row.order_id === 'O1002')

    expect(orderRows).toHaveLength(8)
    expect(result.outputMetrics.targetAmount).toBe(1180)
    expect(result.evidence[0]).toMatchObject({
      kind: 'many-to-many',
      keys: ['O1002', '2 items × 2 payments × 2 refunds'],
    })
    expect(result.changes.find((change) => change.key.includes('O1002'))).toMatchObject({
      kind: 'duplicated',
      beforeCount: 2,
      afterCount: 8,
    })
  })

  it('修正 JOIN 后先聚合事件，昨日净销售额恢复为 370 元', () => {
    const result = getResult('order-item', 'fix-join')
    const dws = getResult('order-item', 'build-dws')
    const ads = getResult('order-item', 'build-ads')

    expect(result.output.rows).toHaveLength(5)
    expect(dws.output.rows).toEqual([
      {
        paid_date: '2026-09-13',
        order_count: 2,
        gross_amount: 400,
        refund_amount: 30,
        sales_amount: 370,
      },
      {
        paid_date: '2026-09-14',
        order_count: 1,
        gross_amount: 80,
        refund_amount: 0,
        sales_amount: 80,
      },
    ])
    expect(dws.outputMetrics.targetAmount).toBe(370)
    expect(ads.output.rows[0]).toMatchObject({ dt: '2026-09-13', sales_amount: 370 })
  })

  it('用户 LEFT JOIN 和支付日期会稳定保留 NULL 与时间边界', () => {
    const orderRows = buildOrderRows(dataset)
    const unknownUser = orderRows.find((row) => row.order_id === 'O1003')
    const unpaidOrder = orderRows.find((row) => row.order_id === 'O1004')

    expect(unknownUser).toMatchObject({ user_name: null, user_city: null, paid_date: '2026-09-14' })
    expect(unpaidOrder).toMatchObject({ payment_status: 'UNPAID', paid_at: null, paid_date: null })
    expect(isInDatePartition('2026-09-13 23:59:59', '2026-09-13')).toBe(true)
    expect(isInDatePartition('2026-09-14 00:00:00', '2026-09-13')).toBe(false)
    expect(isInDatePartition(null, '2026-09-13')).toBe(false)

    const dws = getResult('order', 'build-dws')
    expect(dws.output.rows.some((row) => row.paid_date === null)).toBe(false)
    expect(dws.evidence.map((item) => item.kind)).toContain('time-boundary')
  })

  it('错误 GROUP BY 会让目标日期从一行裂成三个商品行', () => {
    const result = getResult('order-item', 'wrong-group-by')

    expect(result.input.rows).toHaveLength(2)
    expect(result.outputMetrics.targetRowCount).toBe(3)
    expect(result.actualChange).toBe('increase')
    expect(result.evidence[0]?.kind).toBe('grain-mismatch')
  })

  it('迟到数据只更新业务日期分区，并且重复注入不会重复数据', () => {
    const result = getResult('order', 'late-data')
    const lateDataset = appendLateData(dataset)
    const appendedAgain = appendLateData(lateDataset)
    const lateAds = getLayerSnapshots(dataset, 'order', true).find(
      (snapshot) => snapshot.layer === 'ads',
    )

    expect(result.outputMetrics.targetAmount).toBe(420)
    expect(result.evidence[0]?.keys).toEqual(['O1005', '2026-09-13'])
    expect(appendedAgain.orders).toHaveLength(lateDataset.orders.length)
    expect(lateAds?.tables[0]?.rows[0]).toMatchObject({ dt: '2026-09-13', sales_amount: 420 })
  })

  it('目标粒度、预测和执行状态必须按顺序转换', () => {
    let state = createInitialTransformationState()

    expect(canExecuteTransformationStep(state)).toBe(false)
    state = selectTransformationGrain(state, 'order')
    state = setTransformationPrediction(state, 'decrease')
    expect(canExecuteTransformationStep(state)).toBe(true)

    state = executeTransformationStep(state)
    expect(state.completedStepIds).toEqual(['deduplicate'])
    expect(state.activeStepId).toBe('join-users')
    expect(selectTransformationStep(state, 'wrong-join')).toEqual(state)

    state = setTransformationPrediction(state, 'unchanged')
    state = executeTransformationStep(state)
    expect(state.completedStepIds).toEqual(['deduplicate', 'join-users'])
    expect(state.activeStepId).toBe('wrong-join')
  })

  it('表快照指标对 NULL 金额采用确定的 0，而不伪造数字', () => {
    const payments = getLayerSnapshots(dataset, 'order', false)[0]?.tables.find(
      (table) => table.id === 'ods-payments',
    )

    expect(payments).toBeDefined()
    expect(getTableMetrics(payments!, dataset.targetDate)).toMatchObject({
      rowCount: 4,
      amount: 780,
      amountColumn: 'amount',
    })
  })
})
