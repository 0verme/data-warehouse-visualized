import { describe, expect, it } from 'vitest'
import { slowlyChangingDimensionContent } from '../src/content/lessons/slowly-changing-dimension'
import { getLessonBySlug } from '../src/data/course'
import type { BankingCustomerHistoryVisualization } from '../src/types'
import {
  applyCustomerType1Update,
  applyCustomerType2Update,
  BANKING_CUSTOMER_HISTORY_OPEN_END,
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
