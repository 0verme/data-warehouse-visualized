import { describe, expect, it } from 'vitest'
import { starSchemaAndGrainContent } from '../src/content/lessons/star-schema-and-grain'
import { getLessonBySlug } from '../src/data/course'
import {
  calculateGrainErrorResult,
  getGrainOption,
  sumNumericColumn,
} from '../src/utils/star-schema'

const visualization = starSchemaAndGrainContent.visualization

if (!visualization || visualization.kind !== 'star-schema') {
  throw new Error('星型模型测试需要 star-schema visualization 数据')
}

describe('星型模型与粒度课程数据', () => {
  it('课程元数据和可视化数据已注册', () => {
    const lesson = getLessonBySlug('star-schema-and-grain')

    expect(lesson).toMatchObject({
      title: '星型模型与粒度',
      demo: 'star-schema',
      difficulty: 'beginner',
    })
    expect(visualization.rawTable.columns).toContain('user_city')
    expect(visualization.tables.map((table) => table.name)).toEqual([
      'dim_user',
      'dim_product',
      'dim_shop',
      'fact_order_item',
    ])
  })

  it('三种粒度会返回对应的表结构和示例数据', () => {
    const orderGrain = getGrainOption(visualization.grains, 'order')
    const orderItemGrain = getGrainOption(visualization.grains, 'order-item')
    const userDayGrain = getGrainOption(visualization.grains, 'user-day')

    expect(orderGrain?.statement).toBe('一行 = 一个订单')
    expect(orderGrain?.columns).toEqual(['order_id', 'user_id', 'amount'])
    expect(orderItemGrain?.statement).toBe('一行 = 一个订单中的一个商品')
    expect(orderItemGrain?.rows).toHaveLength(3)
    expect(orderItemGrain?.recommended).toBe(true)
    expect(userDayGrain?.columns).toEqual(['dt', 'user_id', 'order_count', 'amount'])
  })

  it('粒度错误会把 300 元重复统计成 600 元，修复后回到 300 元', () => {
    const result = calculateGrainErrorResult(visualization.errorDemo)

    expect(sumNumericColumn(visualization.errorDemo.wrongRows, 'order_total_amount')).toBe(600)
    expect(result).toEqual({
      actualAmount: 300,
      wrongTotal: 600,
      fixedTotal: 300,
      wrongDifference: 300,
      fixedDifference: 0,
    })
  })
})
