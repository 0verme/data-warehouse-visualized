import { describe, expect, it } from 'vitest'
import { metricSystemContent } from '../src/content/lessons/metric-system'
import { getLessonBySlug } from '../src/data/course'
import type { MetricConfig } from '../src/types'
import { calculateMetric, getIncludedOrders, getOrderContribution } from '../src/utils/metrics'

const visualization = metricSystemContent.visualization

if (!visualization || visualization.kind !== 'metric-definition') {
  throw new Error('指标测试需要 metric-definition visualization 数据')
}

const baseConfig: MetricConfig = {
  statusRule: 'paid',
  refundRule: 'gross',
  timeField: 'orderTime',
  grainMode: 'correct',
}

describe('指标口径实验', () => {
  it('课程元数据和订单数据已注册', () => {
    expect(getLessonBySlug('metric-system')).toMatchObject({
      title: '指标体系：同一个数字为什么不一样？',
      chapter: '04',
      order: 100,
      demo: 'metric-definition',
    })
    expect(visualization.targetDate).toBe('2026-09-13')
    expect(visualization.orders.map((order) => order.id)).toEqual(['O001', 'O002', 'O003', 'O004'])
  })

  it('paid 模式排除待支付订单', () => {
    const included = getIncludedOrders(visualization.orders, visualization.targetDate, baseConfig)

    expect(included.map((order) => order.id)).toEqual(['O001', 'O002', 'O003'])
    expect(
      calculateMetric(visualization, baseConfig).evaluations.find(
        (evaluation) => evaluation.order.id === 'O004',
      ),
    ).toMatchObject({ included: false, exclusionReason: 'not-paid', contribution: null })
  })

  it('统计所有订单模式会把 O004 加入下单日总额', () => {
    const result = calculateMetric(visualization, { ...baseConfig, statusRule: 'all' })

    expect(result.total).toBe(440)
    expect(result.evaluations.find((evaluation) => evaluation.order.id === 'O004')).toMatchObject({
      included: true,
      contribution: 60,
    })
  })

  it('退款口径在 O002 上区分 gross 和 net', () => {
    const order = visualization.orders.find((item) => item.id === 'O002')

    expect(order).toBeDefined()
    expect(getOrderContribution(order!, { ...baseConfig, refundRule: 'gross' })).toBe(200)
    expect(getOrderContribution(order!, { ...baseConfig, refundRule: 'net' })).toBe(160)
  })

  it('O003 的归属日期随时间字段变化', () => {
    const byOrderTime = getIncludedOrders(
      visualization.orders,
      visualization.targetDate,
      baseConfig,
    )
    const byPayTime = getIncludedOrders(visualization.orders, visualization.targetDate, {
      ...baseConfig,
      timeField: 'payTime',
    })

    expect(byOrderTime.map((order) => order.id)).toContain('O003')
    expect(byPayTime.map((order) => order.id)).not.toContain('O003')
    expect(
      calculateMetric(visualization, { ...baseConfig, timeField: 'payTime' }).evaluations.find(
        (evaluation) => evaluation.order.id === 'O003',
      ),
    ).toMatchObject({ included: false, exclusionReason: 'date-mismatch' })
  })

  it('支付时间 + 支付成功 + 扣除退款得到 260 元', () => {
    const result = calculateMetric(visualization, {
      statusRule: 'paid',
      refundRule: 'net',
      timeField: 'payTime',
      grainMode: 'correct',
    })

    expect(result.total).toBe(260)
    expect(
      result.evaluations
        .filter((evaluation) => evaluation.included)
        .map((evaluation) => evaluation.order.id),
    ).toEqual(['O001', 'O002'])
  })

  it('明细粒度直接 SUM 会重复 O001，回到订单粒度则保持 100 元', () => {
    const order = visualization.orders.find((item) => item.id === 'O001')

    expect(order).toBeDefined()
    expect(
      getOrderContribution(
        order!,
        { ...baseConfig, grainMode: 'duplicated' },
        visualization.detailRows,
      ),
    ).toBe(200)
    expect(
      getOrderContribution(
        order!,
        { ...baseConfig, grainMode: 'correct' },
        visualization.detailRows,
      ),
    ).toBe(100)
    expect(calculateMetric(visualization, { ...baseConfig, grainMode: 'duplicated' }).total).toBe(
      480,
    )
    expect(calculateMetric(visualization, baseConfig).total).toBe(380)
  })
})
