import { describe, expect, it } from 'vitest'
import { starSchemaAndGrainContent } from '../src/content/lessons/star-schema-and-grain'
import { getLessonBySlug } from '../src/data/course'
import type { BankingStarSchemaVisualization } from '../src/types'

let visualization: BankingStarSchemaVisualization | undefined

for (const section of starSchemaAndGrainContent.sections) {
  if (section.kind === 'visualization' && section.visualization.kind === 'banking-star-schema') {
    visualization = section.visualization
    break
  }
}

if (!visualization) {
  throw new Error('星型模型测试需要 banking-star-schema visualization 数据')
}

describe('事实、维度与星型模型课程数据', () => {
  it('课程元数据和账户交易可视化已注册', () => {
    const lesson = getLessonBySlug('star-schema-and-grain')

    expect(lesson).toMatchObject({
      title: '事实、维度与星型模型',
      demo: 'banking-star-schema',
      difficulty: 'beginner',
    })
    expect(visualization.rawTable.rows[0]).toMatchObject({
      transaction_id: 'T10001',
      customer_id: 'C001',
      account_id: 'A001',
      branch_id: 'B01',
      product_id: 'P01',
      channel: '手机银行',
      transaction_type: '转账',
      transaction_amount: 5000,
    })
    expect(visualization.tables.map((table) => table.name)).toEqual([
      'dim_customer',
      'dim_account',
      'dim_branch',
      'dim_product',
      'dim_date',
      'fact_transaction',
    ])
  })

  it('观察角度共享同一笔事实并覆盖五个维度', () => {
    expect(visualization.observations.map((observation) => observation.dimensionId)).toEqual([
      'dim-customer',
      'dim-account',
      'dim-branch',
      'dim-product',
      'dim-date',
    ])
    expect(
      visualization.observations.every((observation) => observation.detail.includes('T10001')),
    ).toBe(true)
  })

  it('把 channel 保留为交易属性，并提供 Product 的星型/雪花小型对照', () => {
    const channelGroup = visualization.fieldGroups.find((group) => group.fields.includes('channel'))

    expect(channelGroup?.role).toBe('event')
    expect(visualization.snowflake.starLabel).toContain('dim_product')
    expect(visualization.snowflake.snowflakeLabel).toContain('product_category')
  })
})
