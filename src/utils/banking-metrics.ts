import type {
  BankingMetricAccountSnapshot,
  BankingMetricBalanceFilter,
  BankingMetricBranch,
  BankingMetricCustomerScope,
  BankingMetricDefinition,
  BankingMetricProduct,
  BankingMetricTimeMode,
  BankingMetricTimeVisualization,
} from '../types'

export const BANKING_METRIC_YUAN_PER_YI = 100_000_000

const customerLabels = {
  all: '全部客户',
  individual: '个人',
  corporate: '对公',
  'small-business': '小微口径',
} satisfies Record<BankingMetricCustomerScope, string>

const productLabels = {
  demand: '活期',
  term: '定期',
  negotiated: '协定',
  margin: '保证金',
} satisfies Record<BankingMetricProduct, string>

const branchLabels = {
  all: '全行',
  hangzhou: '杭州分行',
  shanghai: '上海分行',
} satisfies Record<BankingMetricBranch | 'all', string>

const currencyLabels = {
  CNY: '人民币',
  USD: 'USD',
} as const

export function getBankingMetricCustomerLabel(scope: BankingMetricCustomerScope): string {
  return customerLabels[scope]
}

export function getBankingMetricProductLabel(product: BankingMetricProduct): string {
  return productLabels[product]
}

export function getBankingMetricBranchLabel(branch: BankingMetricBranch | 'all'): string {
  return branchLabels[branch]
}

export function getBankingMetricCurrencyLabel(currency: keyof typeof currencyLabels): string {
  return currencyLabels[currency]
}

function getProductScopeLabel(filter: BankingMetricBalanceFilter): string {
  const selectedProduct =
    filter.productScope === 'all' ? '全部存款产品' : `${productLabels[filter.productScope]}存款`
  const excludedProducts = filter.excludedProducts ?? []

  if (excludedProducts.length === 0) {
    return selectedProduct
  }

  return `${selectedProduct}（不含${excludedProducts.map((product) => productLabels[product]).join('、')}）`
}

export function getBankingMetricRows(
  snapshots: readonly BankingMetricAccountSnapshot[],
  filter: BankingMetricBalanceFilter,
): BankingMetricAccountSnapshot[] {
  const excludedProducts = new Set(filter.excludedProducts ?? [])

  return snapshots.filter(
    (snapshot) =>
      snapshot.status === 'active' &&
      snapshot.snapshotDate === filter.snapshotDate &&
      snapshot.currency === filter.currency &&
      (filter.customerScope === 'all' || snapshot.customerScope === filter.customerScope) &&
      (filter.productScope === 'all' || snapshot.product === filter.productScope) &&
      !excludedProducts.has(snapshot.product) &&
      (filter.branch === 'all' || snapshot.branch === filter.branch),
  )
}

export interface BankingMetricCalculation {
  total: number
  rows: BankingMetricAccountSnapshot[]
}

export function calculateBankingMetric(
  snapshots: readonly BankingMetricAccountSnapshot[],
  filter: BankingMetricBalanceFilter,
): BankingMetricCalculation {
  const rows = getBankingMetricRows(snapshots, filter)

  return {
    total: rows.reduce((total, row) => total + row.balance, 0),
    rows,
  }
}

export function getBankingMetricName(filter: BankingMetricBalanceFilter): string {
  const customerPart =
    filter.customerScope === 'all' ? '' : getBankingMetricCustomerLabel(filter.customerScope)
  const productPart =
    filter.productScope === 'all'
      ? '存款'
      : `${getBankingMetricProductLabel(filter.productScope)}存款`
  const excludedProducts = filter.excludedProducts ?? []
  const excludedPart =
    excludedProducts.length > 0
      ? `（不含${excludedProducts.map((product) => productLabels[product]).join('、')}）`
      : ''

  return `${getBankingMetricBranchLabel(filter.branch)}${customerPart}${getBankingMetricCurrencyLabel(filter.currency)}${productPart}余额${excludedPart}`
}

export function getBankingMetricDefinition(
  filter: BankingMetricBalanceFilter,
): BankingMetricDefinition {
  const customerLabel = getBankingMetricCustomerLabel(filter.customerScope)
  const productLabel = getProductScopeLabel(filter)
  const branchLabel = getBankingMetricBranchLabel(filter.branch)
  const currencyLabel = getBankingMetricCurrencyLabel(filter.currency)

  return {
    name: getBankingMetricName(filter),
    businessMeaning: `统计日末，${branchLabel}${customerLabel}范围内${currencyLabel}${productLabel}账户余额的合计。`,
    statisticTime: `截至 ${filter.snapshotDate}`,
    subject: 'Account（账户）',
    measure: 'balance（余额）',
    customerScope: customerLabel,
    productScope: productLabel,
    branch: branchLabel,
    currency: `${filter.currency}（${currencyLabel}）`,
    unit: '元',
    requiredFilters: `snapshot_date = ${filter.snapshotDate}；account_status = ACTIVE`,
    grain: 'Account × snapshot_date（一行代表一个账户在统计日的余额状态）',
  }
}

export function formatBankingMetricYuan(amount: number): string {
  return `${amount.toLocaleString('zh-CN')} 元`
}

export function formatBankingMetricYi(amount: number, currency: string): string {
  const value = amount / BANKING_METRIC_YUAN_PER_YI
  const formattedValue = value.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  })

  return `${formattedValue} 亿元${currency === 'CNY' ? '' : `（${currency}）`}`
}

export type BankingMetricTimeCalculation =
  | {
      mode: 'as-of'
      total: number
      rows: BankingMetricTimeVisualization['snapshots']
      factType: string
      timeMeaning: string
      answer: string
    }
  | {
      mode: 'period'
      total: number
      rows: BankingMetricTimeVisualization['transactions']
      factType: string
      timeMeaning: string
      answer: string
    }

function isWithinDateRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

export function calculateBankingMetricTime(
  visualization: BankingMetricTimeVisualization,
  mode: 'as-of',
): Extract<BankingMetricTimeCalculation, { mode: 'as-of' }>
export function calculateBankingMetricTime(
  visualization: BankingMetricTimeVisualization,
  mode: 'period',
): Extract<BankingMetricTimeCalculation, { mode: 'period' }>
export function calculateBankingMetricTime(
  visualization: BankingMetricTimeVisualization,
  mode: BankingMetricTimeMode,
): BankingMetricTimeCalculation
export function calculateBankingMetricTime(
  visualization: BankingMetricTimeVisualization,
  mode: BankingMetricTimeMode,
): BankingMetricTimeCalculation {
  if (mode === 'as-of') {
    const rows = visualization.snapshots.filter(
      (snapshot) => snapshot.snapshotDate === visualization.asOfDate,
    )

    return {
      mode,
      total: rows.reduce((total, row) => total + row.balance, 0),
      rows,
      factType: 'Periodic Snapshot Fact · 状态',
      timeMeaning: `snapshot_date = ${visualization.asOfDate}`,
      answer: '某个时间点还有多少钱。',
    }
  }

  const rows = visualization.transactions.filter(
    (transaction) =>
      transaction.type === 'deposit' &&
      isWithinDateRange(transaction.eventDate, visualization.periodStart, visualization.periodEnd),
  )

  return {
    mode,
    total: rows.reduce((total, row) => total + row.amount, 0),
    rows,
    factType: 'Transaction Fact · 事件累计',
    timeMeaning: `${visualization.periodStart} ≤ event_date ≤ ${visualization.periodEnd}`,
    answer: '一段时间内发生了多少存入交易。',
  }
}
