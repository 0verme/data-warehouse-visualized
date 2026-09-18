import { describe, expect, it } from 'vitest'
import { slowlyChangingDimensionContent } from '../src/content/lessons/slowly-changing-dimension'
import { getLessonBySlug } from '../src/data/course'
import type { BankingCustomerHistoryVisualization } from '../src/types'
import {
  addCustomerDays,
  applyCustomerType1Update,
  applyCustomerType2Update,
  BANKING_CUSTOMER_HISTORY_OPEN_END,
  diffCustomerDays,
  getCustomerHistoryCursorView,
  getCustomerVersionAt,
} from '../src/utils/customer-history'

let visualization: BankingCustomerHistoryVisualization | undefined

for (const section of slowlyChangingDimensionContent.sections) {
  if (
    section.kind === 'visualization' &&
    section.visualization.kind === 'banking-customer-history'
  ) {
    visualization = section.visualization
    break
  }
}

if (!visualization) {
  throw new Error('客户历史测试需要 banking-customer-history visualization 数据')
}

describe('维度历史与拉链表', () => {
  it('课程元数据和客户历史可视化已注册', () => {
    expect(getLessonBySlug('slowly-changing-dimension')).toMatchObject({
      title: '维度为什么要保存历史？——拉链表',
      chapter: '02',
      order: 500,
      demo: 'banking-customer-history',
    })
    expect(visualization.initialVersion).toEqual({
      customerSk: 101,
      customerId: 'C001',
      level: '普通',
      branch: '杭州支行',
      effectiveFrom: '2025-01-01',
      effectiveTo: '9999-12-31',
      isCurrent: true,
    })
    expect(visualization.loanNote).toMatchObject({
      noteId: 'N001',
      customerId: 'C001',
      disbursedDate: '2025-10-10',
    })
  })

  it('覆盖更新只留下今天的客户属性', () => {
    const updated = applyCustomerType1Update(visualization.initialVersion, {
      level: visualization.change.level,
      branch: visualization.change.branch,
    })

    expect(updated).toMatchObject({
      customerId: 'C001',
      customerSk: 101,
      level: 'VIP',
      branch: '上海支行',
      effectiveFrom: '2025-01-01',
      effectiveTo: '9999-12-31',
    })
    expect(getCustomerVersionAt([updated], '2025-10-10')?.level).toBe('VIP')
  })

  it('拉链表关闭旧版本并插入 customer_sk 205', () => {
    const versions = applyCustomerType2Update([visualization.initialVersion], visualization.change)

    expect(versions).toEqual([
      {
        ...visualization.initialVersion,
        effectiveTo: '2026-04-01',
        isCurrent: false,
      },
      {
        ...visualization.initialVersion,
        customerSk: 205,
        level: 'VIP',
        branch: '上海支行',
        effectiveFrom: '2026-04-01',
        effectiveTo: BANKING_CUSTOMER_HISTORY_OPEN_END,
        isCurrent: true,
      },
    ])
    expect(getCustomerVersionAt(versions, '2025-10-10')).toMatchObject({
      customerSk: 101,
      level: '普通',
      branch: '杭州支行',
    })
    expect(getCustomerVersionAt(versions, '2026-04-01')).toMatchObject({
      customerSk: 205,
      level: 'VIP',
      branch: '上海支行',
    })
  })

  it('变更日属于新版本，前一天仍属于旧版本', () => {
    const versions = applyCustomerType2Update([visualization.initialVersion], visualization.change)

    expect(getCustomerVersionAt(versions, '2026-04-01 00:00:00')?.customerSk).toBe(205)
    expect(getCustomerVersionAt(versions, '2026-03-31 23:59:59')?.customerSk).toBe(101)
  })
})

describe('维度历史日期阶梯', () => {
  it('按 UTC 计算跨月、跨年与闰年日期', () => {
    expect(addCustomerDays('2026-03-31', 1)).toBe('2026-04-01')
    expect(addCustomerDays('2026-04-01', -1)).toBe('2026-03-31')
    expect(addCustomerDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addCustomerDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('日期差值可逆且拒绝非法日期', () => {
    expect(diffCustomerDays('2025-01-01', '2026-04-01')).toBe(455)
    expect(diffCustomerDays('2026-04-01', '2025-01-01')).toBe(-455)
    expect(addCustomerDays('2025-01-01', diffCustomerDays('2025-01-01', '2026-03-31'))).toBe(
      '2026-03-31',
    )
    expect(() => diffCustomerDays('2026-02-30', '2026-03-01')).toThrow(RangeError)
    expect(() => diffCustomerDays('2026-04-01 00:00:00', '2026-04-02')).toThrow(RangeError)
  })
})

describe('版本区间与日期游标视图', () => {
  const type2Versions = applyCustomerType2Update(
    [visualization.initialVersion],
    visualization.change,
  )
  const windowStart = visualization.initialVersion.effectiveFrom

  it('2026-03-31 命中旧版本，2026-04-01 命中新版本', () => {
    const before = getCustomerHistoryCursorView(
      visualization,
      type2Versions,
      diffCustomerDays(windowStart, '2026-03-31'),
    )
    expect(before.cursorDate).toBe('2026-03-31')
    expect(before.hit).toMatchObject({ customerSk: 101, level: '普通', branch: '杭州支行' })
    expect(before.bars.map((bar) => bar.isActive)).toEqual([true, false])

    const boundary = getCustomerHistoryCursorView(
      visualization,
      type2Versions,
      diffCustomerDays(windowStart, '2026-04-01'),
    )
    expect(boundary.cursorDate).toBe('2026-04-01')
    expect(boundary.hit).toMatchObject({ customerSk: 205, level: 'VIP', branch: '上海支行' })
    expect(boundary.bars.map((bar) => bar.isActive)).toEqual([false, true])
  })

  it('两个版本区间在同一位置相接，开放结束被裁剪到视图窗口', () => {
    const view = getCustomerHistoryCursorView(visualization, type2Versions, 0)

    expect(view.windowStart).toBe('2025-01-01')
    expect(view.windowEnd).toBe('2026-09-15')
    expect(view.totalDays).toBe(622)
    expect(view.boundaryDate).toBe('2026-04-01')
    expect(view.boundaryDayBefore).toBe('2026-03-31')
    expect(view.bars).toHaveLength(2)
    expect(view.bars[0].startRatio).toBe(0)
    expect(view.bars[0].endRatio).toBe(view.bars[1].startRatio)
    expect(view.bars[0].isOpenEnd).toBe(false)
    expect(view.bars[1].isOpenEnd).toBe(true)
    expect(view.bars[1].endRatio).toBe(1)
  })

  it('Type 1 只有一段覆盖区间，任何业务日期都命中同一行', () => {
    const updated = applyCustomerType1Update(visualization.initialVersion, visualization.change)
    const view = getCustomerHistoryCursorView(
      visualization,
      [updated],
      diffCustomerDays(windowStart, '2026-04-01'),
    )

    expect(view.bars).toHaveLength(1)
    expect(view.bars[0].isOpenEnd).toBe(true)
    expect(view.bars[0].endRatio).toBe(1)
    expect(view.hit).toMatchObject({ level: 'VIP', branch: '上海支行', isCurrent: true })
  })

  it('游标下标被裁剪到视图窗口内', () => {
    expect(getCustomerHistoryCursorView(visualization, type2Versions, -10).cursorDate).toBe(
      '2025-01-01',
    )
    expect(getCustomerHistoryCursorView(visualization, type2Versions, 99999).cursorDate).toBe(
      '2026-09-15',
    )
  })
})
