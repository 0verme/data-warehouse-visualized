import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BankingMetricScopeLab } from '../src/components/visualizations/BankingMetricLabs'
import { depositAccountSnapshots } from '../src/content/lessons/deposit-data'
import {
  depositBalanceScopeVisualization,
  metricSystemContent,
} from '../src/content/lessons/metric-system'
import type { BankingMetricAccountSnapshot, BankingMetricBalanceFilter } from '../src/types'
import {
  calculateBankingMetric,
  compareBankingMetricScopes,
  diffBankingMetricFilters,
  getBankingMetricMemberKey,
  getBankingMetricRows,
  getBankingMetricWhereSql,
  isSameBankingMetricFilter,
} from '../src/utils/banking-metrics'

const scenarios = depositBalanceScopeVisualization.scenarios
const [operationsScenario, financeScenario, analyticsScenario] = scenarios

const defaultFilter: BankingMetricBalanceFilter = {
  snapshotDate: '2026-09-30',
  customerScope: 'all',
  productScope: 'all',
  branch: 'all',
  currency: 'CNY',
}

function rowsFor(filter: BankingMetricBalanceFilter): BankingMetricAccountSnapshot[] {
  return getBankingMetricRows(depositAccountSnapshots, filter)
}

function memberKeys(rows: readonly BankingMetricAccountSnapshot[]): string[] {
  return rows.map(getBankingMetricMemberKey)
}

describe('03 指标口径 · Scope Set Delta（#127 Candidate A1）', () => {
  it('保留 A / B / C 预设，并确定性地得到 1028 / 1011 / 987 亿', () => {
    expect(scenarios.map((scenario) => scenario.label)).toEqual(['A', 'B', 'C'])
    expect(scenarios.map((scenario) => scenario.id)).toEqual(['operations', 'finance', 'analytics'])

    const totals = scenarios.map(
      (scenario) => calculateBankingMetric(depositAccountSnapshots, scenario.filter).total,
    )
    expect(totals).toEqual([102_800_000_000, 101_100_000_000, 98_700_000_000])

    expect(memberKeys(rowsFor(operationsScenario.filter))).toEqual([
      'A001@2026-09-30',
      'A002@2026-09-30',
      'A003@2026-09-30',
      'A004@2026-09-30',
      'A005@2026-09-30',
    ])
  })

  it('预设筛选器与初始 filter state 等价，可以判定“回到预设”', () => {
    expect(isSameBankingMetricFilter(operationsScenario.filter, defaultFilter)).toBe(true)
    expect(
      isSameBankingMetricFilter(financeScenario.filter, {
        ...defaultFilter,
        excludedProducts: ['margin'],
      }),
    ).toBe(true)
    expect(
      isSameBankingMetricFilter(analyticsScenario.filter, {
        ...defaultFilter,
        excludedProducts: ['negotiated', 'margin'],
      }),
    ).toBe(true)
    expect(isSameBankingMetricFilter(financeScenario.filter, defaultFilter)).toBe(false)
  })

  it('单条件过滤：客户口径只保留匹配的 Account 快照，WHERE 同步变化', () => {
    const filter: BankingMetricBalanceFilter = { ...defaultFilter, customerScope: 'corporate' }
    const calculation = calculateBankingMetric(depositAccountSnapshots, filter)
    const where = getBankingMetricWhereSql(filter)

    expect(calculation.rows.map((row) => row.accountId)).toEqual(['A002', 'A004'])
    expect(calculation.total).toBe(31_700_000_000)
    expect(where).toContain(`customer_scope = 'CORPORATE'`)
    expect(where).not.toContain('product_code')
    expect(where).not.toContain('branch_code')
    expect(where).toContain(`WHERE snapshot_date = '2026-09-30'`)
    expect(where).toContain(`AND currency = 'CNY'`)
  })

  it('多条件组合：客户 / 产品 / 机构 / 日期正确求交集', () => {
    const filter: BankingMetricBalanceFilter = {
      ...defaultFilter,
      customerScope: 'small-business',
      productScope: 'term',
      branch: 'hangzhou',
      snapshotDate: '2026-09-29',
    }
    const calculation = calculateBankingMetric(depositAccountSnapshots, filter)
    const where = getBankingMetricWhereSql(filter)

    expect(calculation.rows.map((row) => row.accountId)).toEqual(['A005'])
    expect(calculation.rows.every((row) => row.snapshotDate === '2026-09-29')).toBe(true)
    expect(calculation.total).toBe(42_700_000_000)
    expect(where).toContain(`AND customer_scope = 'SMALL_BUSINESS'`)
    expect(where).toContain(`AND product_code = 'TERM'`)
    expect(where).toContain(`AND branch_code = 'HANGZHOU'`)
    expect(where).toContain(`WHERE snapshot_date = '2026-09-29'`)
  })

  it('排除产品继续作为集合边界：单排除与多排除都生效', () => {
    const financeFilter: BankingMetricBalanceFilter = {
      ...defaultFilter,
      excludedProducts: ['margin'],
    }
    const analyticsFilter: BankingMetricBalanceFilter = {
      ...defaultFilter,
      excludedProducts: ['margin', 'negotiated'],
    }

    expect(rowsFor(financeFilter).map((row) => row.accountId)).toEqual([
      'A001',
      'A002',
      'A003',
      'A005',
    ])
    expect(calculateBankingMetric(depositAccountSnapshots, financeFilter).total).toBe(
      101_100_000_000,
    )

    expect(rowsFor(analyticsFilter).map((row) => row.accountId)).toEqual(['A001', 'A002', 'A005'])
    expect(calculateBankingMetric(depositAccountSnapshots, analyticsFilter).total).toBe(
      98_700_000_000,
    )

    const where = getBankingMetricWhereSql(analyticsFilter)
    expect(where).toContain(`product_code NOT IN ('NEGOTIATED', 'MARGIN')`)
    expect(where).not.toContain('customer_scope')
  })

  it('产品口径与排除产品同时命中同一产品时集合为空，结果明确为 0', () => {
    const filter: BankingMetricBalanceFilter = {
      ...defaultFilter,
      productScope: 'margin',
      excludedProducts: ['margin'],
    }
    const calculation = calculateBankingMetric(depositAccountSnapshots, filter)

    expect(calculation.rows).toEqual([])
    expect(calculation.total).toBe(0)
    expect(getBankingMetricWhereSql(filter)).toContain(`product_code = 'MARGIN'`)
    expect(getBankingMetricWhereSql(filter)).toContain(`product_code NOT IN ('MARGIN')`)
  })

  it('entered / left 集合由上一次口径与当前口径的成员差异决定', () => {
    const operationsRows = rowsFor(operationsScenario.filter)
    const financeRows = rowsFor(financeScenario.filter)
    const analyticsRows = rowsFor(analyticsScenario.filter)

    const financeDelta = compareBankingMetricScopes(operationsRows, financeRows)
    expect(memberKeys(financeDelta.entered)).toEqual([])
    expect(memberKeys(financeDelta.left)).toEqual(['A004@2026-09-30'])
    expect(memberKeys(financeDelta.stayed)).toEqual([
      'A001@2026-09-30',
      'A002@2026-09-30',
      'A003@2026-09-30',
      'A005@2026-09-30',
    ])

    const analyticsDelta = compareBankingMetricScopes(financeRows, analyticsRows)
    expect(memberKeys(analyticsDelta.entered)).toEqual([])
    expect(memberKeys(analyticsDelta.left)).toEqual(['A003@2026-09-30'])

    const returnDelta = compareBankingMetricScopes(analyticsRows, operationsRows)
    expect(memberKeys(returnDelta.entered)).toEqual(['A003@2026-09-30', 'A004@2026-09-30'])
    expect(memberKeys(returnDelta.left)).toEqual([])
    expect(returnDelta.stayed).toHaveLength(3)
  })

  it('切换币种与统计日期时，成员身份按 Account × snapshot_date 变化', () => {
    const usdDelta = compareBankingMetricScopes(
      rowsFor(defaultFilter),
      rowsFor({ ...defaultFilter, currency: 'USD' }),
    )
    expect(usdDelta.entered.map((row) => row.accountId)).toEqual(['A006'])
    expect(usdDelta.left).toHaveLength(5)

    const dateDelta = compareBankingMetricScopes(
      rowsFor(defaultFilter),
      rowsFor({ ...defaultFilter, snapshotDate: '2026-09-29' }),
    )
    expect(memberKeys(dateDelta.entered)).toContain('A001@2026-09-29')
    expect(memberKeys(dateDelta.left)).toContain('A001@2026-09-30')
    expect(dateDelta.stayed).toEqual([])
  })

  it('WHERE 由 filter 确定性生成，且排除产品顺序不影响文本', () => {
    const first = getBankingMetricWhereSql({
      ...defaultFilter,
      excludedProducts: ['negotiated', 'margin'],
    })
    const second = getBankingMetricWhereSql({
      ...defaultFilter,
      excludedProducts: ['margin', 'negotiated'],
    })

    expect(first).toBe(second)
    expect(first).toBe(
      [
        `WHERE snapshot_date = '2026-09-30'`,
        `  AND account_status = 'ACTIVE'`,
        `  AND currency = 'CNY'`,
        `  AND product_code NOT IN ('NEGOTIATED', 'MARGIN')`,
      ].join('\n'),
    )
    expect(getBankingMetricWhereSql(defaultFilter)).toBe(getBankingMetricWhereSql(defaultFilter))
  })

  it('filters → members → aggregate 三者一致：合计始终等于成员余额之和', () => {
    const filters: BankingMetricBalanceFilter[] = [
      defaultFilter,
      operationsScenario.filter,
      financeScenario.filter,
      analyticsScenario.filter,
      { ...defaultFilter, customerScope: 'corporate' },
      { ...defaultFilter, customerScope: 'small-business', productScope: 'term' },
      { ...defaultFilter, branch: 'shanghai' },
      { ...defaultFilter, currency: 'USD' },
      { ...defaultFilter, snapshotDate: '2026-09-29' },
      { ...defaultFilter, excludedProducts: ['demand', 'margin'] },
      { ...defaultFilter, productScope: 'margin', excludedProducts: ['margin'] },
    ]

    for (const filter of filters) {
      const calculation = calculateBankingMetric(depositAccountSnapshots, filter)

      expect(calculation.rows).toEqual(getBankingMetricRows(depositAccountSnapshots, filter))
      expect(calculation.total).toBe(
        calculation.rows.reduce((total, row) => total + row.balance, 0),
      )

      for (const row of calculation.rows) {
        expect(row.status).toBe('active')
        expect(row.snapshotDate).toBe(filter.snapshotDate)
        expect(row.currency).toBe(filter.currency)

        if (filter.customerScope !== 'all') {
          expect(row.customerScope).toBe(filter.customerScope)
        }

        if (filter.productScope !== 'all') {
          expect(row.product).toBe(filter.productScope)
        }

        expect(filter.excludedProducts ?? []).not.toContain(row.product)

        if (filter.branch !== 'all') {
          expect(row.branch).toBe(filter.branch)
        }
      }
    }
  })

  it('reset 回到默认预设：默认 filter 与 A 预设一致，集合差异为空', () => {
    const defaultRows = rowsFor(operationsScenario.filter)
    const selfDelta = compareBankingMetricScopes(defaultRows, defaultRows)

    expect(isSameBankingMetricFilter(operationsScenario.filter, defaultFilter)).toBe(true)
    expect(calculateBankingMetric(depositAccountSnapshots, operationsScenario.filter).total).toBe(
      102_800_000_000,
    )
    expect(selfDelta.entered).toEqual([])
    expect(selfDelta.left).toEqual([])
    expect(selfDelta.stayed).toHaveLength(5)
    expect(diffBankingMetricFilters(operationsScenario.filter, operationsScenario.filter)).toEqual(
      [],
    )
  })

  it('条件变化可以追溯到具体过滤条件，便于解释 entered / left 的原因', () => {
    const financeChanges = diffBankingMetricFilters(
      operationsScenario.filter,
      financeScenario.filter,
    )
    expect(financeChanges).toEqual([
      { field: 'excludedProducts', label: '排除产品', before: '无', after: '保证金' },
    ])

    const analyticsChanges = diffBankingMetricFilters(
      financeScenario.filter,
      analyticsScenario.filter,
    )
    expect(analyticsChanges).toEqual([
      { field: 'excludedProducts', label: '排除产品', before: '保证金', after: '协定、保证金' },
    ])

    const currencyChanges = diffBankingMetricFilters(defaultFilter, {
      ...defaultFilter,
      currency: 'USD',
    })
    expect(currencyChanges).toEqual([
      { field: 'currency', label: '币种', before: '人民币', after: 'USD' },
    ])

    expect(
      diffBankingMetricFilters(
        { ...defaultFilter, excludedProducts: ['negotiated', 'margin'] },
        { ...defaultFilter, excludedProducts: ['margin'] },
      ),
    ).toEqual([
      { field: 'excludedProducts', label: '排除产品', before: '协定、保证金', after: '保证金' },
    ])
  })

  it('SSR 初始状态：预设、条件组、WHERE、当前集合状态一致可读', () => {
    const markup = renderToStaticMarkup(
      <BankingMetricScopeLab visualization={depositBalanceScopeVisualization} />,
    )

    expect(markup).toContain('存款余额 · 统计集合与 WHERE')
    expect(markup).toContain('WHERE snapshot_date =')
    expect(markup).toContain('account_status =')
    expect(markup).toContain('SET DELTA')
    expect(markup).toContain('重置对比')

    expect(markup).toContain('客户口径')
    expect(markup).toContain('产品口径')
    expect(markup).toContain('排除产品')
    expect(markup).toContain('统计日期')
    expect(markup).toContain('aria-pressed="true"')

    // 初始状态没有 previous filter，成员全部标记为“在集合中”（5 行快照）。
    expect(markup.match(/在集合中/g)).toHaveLength(5)
    expect(markup).toContain('不计入当前合计')
    expect(markup).toContain('1,028 亿元')
    expect(markup).toContain('1,011 亿元')
    expect(markup).toContain('987 亿元')
    expect(markup).toContain('aria-live="polite"')
  })

  it('课程文案与实验一致：描述集合进出与 WHERE', () => {
    const section = metricSystemContent.sections.find(
      (candidate) => candidate.kind === 'visualization',
    )

    expect(section?.kind).toBe('visualization')
    const description = section?.kind === 'visualization' ? section.description : ''
    expect(description).toContain('进入或离开集合')
    expect(description).toContain('WHERE')
  })
})
