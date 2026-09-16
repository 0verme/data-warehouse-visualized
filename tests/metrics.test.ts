import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { depositMetricDefinitionStages } from '../src/content/lessons/deposit-metric-definition'
import { depositMetricDerivationVisualization } from '../src/content/lessons/deposit-metric-derivations'
import { depositMetricTimeVisualization } from '../src/content/lessons/deposit-metric-time'
import {
  depositBalanceScopeVisualization,
  metricSystemContent,
} from '../src/content/lessons/metric-system'
import { getLessonBySlug } from '../src/data/course'
import type {
  BankingMetricBalanceFilter,
  BankingMetricDefinitionVisualization,
  BankingMetricScopeVisualization,
  BankingMetricTimeVisualization,
} from '../src/types'
import {
  calculateBankingMetric,
  calculateBankingMetricTime,
  getBankingMetricDefinition,
} from '../src/utils/banking-metrics'

describe('第 03 章银行指标课程', () => {
  it('保留旧 metric-system slug，并注册四节银行指标课程', () => {
    expect(getLessonBySlug('metric-system')).toMatchObject({
      id: 'lesson-04',
      title: '同一个“存款余额”，为什么会有不同答案？',
      chapter: '03',
      order: 100,
      demo: 'banking-metric-scope',
    })
    expect(getLessonBySlug('deposit-metric-definition')).toMatchObject({
      title: '一个指标到底由什么组成？',
      chapter: '03',
      order: 200,
      demo: 'banking-metric-definition',
    })
    expect(getLessonBySlug('deposit-metric-time')).toMatchObject({
      title: '“截至某天”和“一段时间”有什么区别？',
      chapter: '03',
      order: 300,
      demo: 'banking-metric-time',
    })
    expect(getLessonBySlug('deposit-metric-derivations')).toMatchObject({
      title: '一个“存款余额”为什么能派生出这么多指标？',
      chapter: '03',
      order: 400,
      demo: 'banking-metric-derivations',
    })

    expect(metricSystemContent.opening?.title).toBe('截至 2026-09-30，全行存款余额是多少？')
    expect(depositBalanceScopeVisualization.scenarios.map((scenario) => scenario.label)).toEqual([
      'A',
      'B',
      'C',
    ])
  })

  it('三个口径结果确定性地得到 1028 亿、1011 亿和 987 亿', () => {
    const visualization: BankingMetricScopeVisualization = depositBalanceScopeVisualization
    const totals = visualization.scenarios.map(
      (scenario) => calculateBankingMetric(visualization.snapshots, scenario.filter).total,
    )

    expect(totals).toEqual([102_800_000_000, 101_100_000_000, 98_700_000_000])
  })

  it('定义卡最终写清小微口径、定期、机构、币种、单位和 Grain', () => {
    const visualization: BankingMetricDefinitionVisualization = {
      kind: 'banking-metric-definition',
      stages: depositMetricDefinitionStages,
    }
    const finalDefinition = visualization.stages.at(-1)?.definition

    expect(finalDefinition).toMatchObject({
      name: '杭州分行小微口径人民币定期存款余额',
      statisticTime: '2026-09-30',
      subject: 'Account（账户）',
      measure: 'balance（余额）',
      customerScope: '小微口径',
      productScope: '定期',
      branch: '杭州分行',
      currency: 'CNY（人民币）',
      unit: '元',
      grain: 'Account × snapshot_date（一行代表一个账户在统计日的余额状态）',
    })
    expect(finalDefinition?.requiredFilters).toContain('account_status = ACTIVE')
  })

  it('区分时点余额和期间累计存入金额', () => {
    const visualization: BankingMetricTimeVisualization = depositMetricTimeVisualization
    const asOf = calculateBankingMetricTime(visualization, 'as-of')
    const period = calculateBankingMetricTime(visualization, 'period')

    expect(asOf.total).toBe(1200)
    expect(asOf.rows.map((row) => row.accountId)).toEqual(['A101', 'A102'])
    expect(asOf.factType).toContain('Periodic Snapshot')

    expect(period.total).toBe(680)
    expect(period.rows.map((row) => ('transactionId' in row ? row.transactionId : ''))).toEqual([
      'T001',
      'T003',
      'T004',
    ])
    expect(period.factType).toContain('Transaction Fact')
  })

  it('口径组合器能派生杭州分行小微定期余额，并只保留匹配快照', () => {
    const filter: BankingMetricBalanceFilter = {
      snapshotDate: '2026-09-30',
      customerScope: 'small-business',
      productScope: 'term',
      branch: 'hangzhou',
      currency: 'CNY',
    }
    const result = calculateBankingMetric(depositMetricDerivationVisualization.snapshots, filter)
    const definition = getBankingMetricDefinition(filter)

    expect(result.total).toBe(42_700_000_000)
    expect(result.rows.map((row) => row.accountId)).toEqual(['A005'])
    expect(definition.name).toBe('杭州分行小微口径人民币定期存款余额')
  })

  it('第 03 章不引入日均存款或额外银行经营规则', () => {
    const chapterContent = JSON.stringify([
      metricSystemContent,
      getLessonContent(getLessonBySlug('deposit-metric-definition')!),
      getLessonContent(getLessonBySlug('deposit-metric-time')!),
      getLessonContent(getLessonBySlug('deposit-metric-derivations')!),
    ])

    expect(chapterContent).not.toContain('日均')
    expect(chapterContent).not.toContain('监管规则')
  })
})
