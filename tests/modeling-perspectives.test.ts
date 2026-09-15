import { describe, expect, it } from 'vitest'
import {
  buildModelingPerspectiveView,
  getModelingPerspectiveComparison,
  MODELING_ORDER_CASE,
  MODELING_PERSPECTIVE_IDS,
} from '../src/utils/modeling-perspectives'

describe('建模组织视角对照', () => {
  it('三种 perspective 都能完整生成自己的数据流与职责信息', () => {
    const views = MODELING_PERSPECTIVE_IDS.map(buildModelingPerspectiveView)

    expect(views).toHaveLength(3)
    expect(views.map((view) => view.stages.length)).toEqual([4, 3, 4])
    expect(
      views.every(
        (view) =>
          view.transformationOwner &&
          view.qualityResponsibility &&
          view.consumerBoundary &&
          view.stages.every(
            (stage) =>
              stage.label &&
              stage.responsibility &&
              stage.output &&
              stage.grain &&
              stage.owner &&
              stage.quality &&
              stage.consumer,
          ),
      ),
    ).toBe(true)
  })

  it('切换视角不会改变同一份订单案例 identity', () => {
    const views = MODELING_PERSPECTIVE_IDS.map(buildModelingPerspectiveView)

    expect(new Set(views.map((view) => view.caseId))).toEqual(new Set([MODELING_ORDER_CASE.id]))
    expect(MODELING_ORDER_CASE.rows).toHaveLength(3)
    expect(MODELING_ORDER_CASE.rows.filter((row) => row.order_id === '1001')).toHaveLength(2)
    expect(MODELING_ORDER_CASE.totalAmount).toBe(480)
  })

  it('不同体系的 flow 与职责描述不是机械的一一等价映射', () => {
    const views = MODELING_PERSPECTIVE_IDS.map(buildModelingPerspectiveView)
    const flowLabels = views.map((view) => view.stages.map((stage) => stage.label).join(' → '))
    const comparison = getModelingPerspectiveComparison()

    expect(new Set(flowLabels).size).toBe(3)
    expect(flowLabels).toEqual([
      'ODS → DWD → DWS → ADS',
      'Bronze → Silver → Gold',
      'Sources / Raw → Staging → Intermediate → Marts',
    ])
    expect(comparison).toHaveLength(10)
    expect(comparison.find((row) => row.id === 'raw-retention')?.values).toEqual(
      expect.objectContaining({
        'traditional-dw': expect.not.stringContaining('上游关系的声明'),
        'dbt-ae': expect.stringContaining('上游关系的声明'),
      }),
    )
  })

  it('至少一个职责在三种视角下拥有不同边界', () => {
    const comparison = getModelingPerspectiveComparison()
    const history = comparison.find((row) => row.id === 'historical-trace')
    const quality = comparison.find((row) => row.id === 'quality-responsibility')

    expect(history).toBeDefined()
    expect(new Set(Object.values(history?.values ?? {})).size).toBe(3)
    expect(quality).toBeDefined()
    expect(new Set(Object.values(quality?.values ?? {})).size).toBe(3)
  })
})
