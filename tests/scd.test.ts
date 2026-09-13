import { describe, expect, it } from 'vitest'
import { slowlyChangingDimensionContent } from '../src/content/lessons/slowly-changing-dimension'
import { getLessonBySlug } from '../src/data/course'
import {
  applyType1Update,
  applyType2Update,
  getDimensionVersionAt,
  SCD_OPEN_END,
} from '../src/utils/scd'

const visualization = slowlyChangingDimensionContent.visualization

if (!visualization || visualization.kind !== 'scd') {
  throw new Error('SCD 测试需要 scd visualization 数据')
}

describe('SCD Type 2 维度历史', () => {
  it('课程元数据和可视化数据已注册', () => {
    expect(getLessonBySlug('slowly-changing-dimension')).toMatchObject({
      title: '维度为什么要保存历史？SCD Type 2',
      chapter: '03',
      order: 5,
      demo: 'scd',
    })
    expect(visualization.initialVersion).toMatchObject({
      userId: 'U1001',
      city: '杭州',
      memberLevel: '普通会员',
    })
    expect(visualization.orders.map((order) => order.orderTime)).toEqual([
      '2026-02-10',
      '2026-04-10',
    ])
  })

  it('Type 1 直接覆盖后只剩当前状态，旧订单只能命中错误的当前值', () => {
    const updated = applyType1Update(visualization.initialVersion, {
      memberLevel: '黄金会员',
    })

    expect(updated.memberLevel).toBe('黄金会员')
    expect(updated.effectiveFrom).toBe('2026-01-01')
    expect(updated.effectiveTo).toBe('9999-12-31')
    expect(getDimensionVersionAt([updated], '2026-02-10')?.memberLevel).toBe('黄金会员')
    expect(visualization.initialVersion.memberLevel).toBe('普通会员')
  })

  it('Type 2 会关闭旧版本并新增当前版本', () => {
    const versions = applyType2Update(
      [visualization.initialVersion],
      { memberLevel: '黄金会员' },
      visualization.change.effectiveFrom,
    )

    expect(versions).toEqual([
      {
        ...visualization.initialVersion,
        effectiveTo: '2026-03-01',
        isCurrent: false,
      },
      {
        ...visualization.initialVersion,
        memberLevel: '黄金会员',
        effectiveFrom: '2026-03-01',
        effectiveTo: SCD_OPEN_END,
        isCurrent: true,
      },
    ])
    expect(getDimensionVersionAt(versions, '2026-02-10')?.memberLevel).toBe('普通会员')
    expect(getDimensionVersionAt(versions, '2026-04-10')?.memberLevel).toBe('黄金会员')
  })

  it('升级边界属于新版本而不是旧版本', () => {
    const versions = applyType2Update(
      [visualization.initialVersion],
      { memberLevel: '黄金会员' },
      '2026-03-01',
    )

    expect(getDimensionVersionAt(versions, '2026-03-01 00:00:00')?.memberLevel).toBe('黄金会员')
    expect(getDimensionVersionAt(versions, '2026-02-28 23:59:59')?.memberLevel).toBe('普通会员')
  })
})
