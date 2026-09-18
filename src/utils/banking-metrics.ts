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

/**
 * 教学口径集合里的最小成员身份：Account × snapshot_date。
 * 日期变化时，同一个 Account 在不同快照日会被视为不同成员。
 */
export function getBankingMetricMemberKey(snapshot: BankingMetricAccountSnapshot): string {
  return `${snapshot.accountId}@${snapshot.snapshotDate}`
}

export interface BankingMetricScopeDelta {
  /** 本次变化后进入统计集合的成员。 */
  entered: BankingMetricAccountSnapshot[]
  /** 本次变化后离开统计集合的成员。 */
  left: BankingMetricAccountSnapshot[]
  /** 两次都留在统计集合里的成员（当前集合口径）。 */
  stayed: BankingMetricAccountSnapshot[]
}

/**
 * 比较“上一次口径”和“当前口径”的集合成员差异。
 * 只做成员进出判断，不计算金额：金额始终来自 calculateBankingMetric。
 */
export function compareBankingMetricScopes(
  previous: readonly BankingMetricAccountSnapshot[],
  current: readonly BankingMetricAccountSnapshot[],
): BankingMetricScopeDelta {
  const previousKeys = new Set(previous.map(getBankingMetricMemberKey))
  const currentKeys = new Set(current.map(getBankingMetricMemberKey))

  return {
    entered: current.filter((snapshot) => !previousKeys.has(getBankingMetricMemberKey(snapshot))),
    left: previous.filter((snapshot) => !currentKeys.has(getBankingMetricMemberKey(snapshot))),
    stayed: current.filter((snapshot) => previousKeys.has(getBankingMetricMemberKey(snapshot))),
  }
}

const productOrder: readonly BankingMetricProduct[] = ['demand', 'term', 'negotiated', 'margin']

const customerScopeCodes = {
  individual: 'INDIVIDUAL',
  corporate: 'CORPORATE',
  'small-business': 'SMALL_BUSINESS',
} satisfies Record<Exclude<BankingMetricCustomerScope, 'all'>, string>

const productCodes = {
  demand: 'DEMAND',
  term: 'TERM',
  negotiated: 'NEGOTIATED',
  margin: 'MARGIN',
} satisfies Record<BankingMetricProduct, string>

const branchCodes = {
  hangzhou: 'HANGZHOU',
  shanghai: 'SHANGHAI',
} satisfies Record<BankingMetricBranch, string>

/** 把排除产品排序到固定的教学顺序，保证 WHERE 文本可复现。 */
function sortProducts(products: readonly BankingMetricProduct[]): BankingMetricProduct[] {
  return [...products].sort(
    (left, right) => productOrder.indexOf(left) - productOrder.indexOf(right),
  )
}

/**
 * 由当前 filter 确定性生成的等价 pseudo-SQL WHERE。
 * 这里只做教学表达，不连接真实 SQL 执行器（#35 的 DuckDB-WASM 不在本节范围）。
 */
export function getBankingMetricWhereSql(filter: BankingMetricBalanceFilter): string {
  const conditions = [
    `snapshot_date = '${filter.snapshotDate}'`,
    `account_status = 'ACTIVE'`,
    `currency = '${filter.currency}'`,
  ]

  if (filter.customerScope !== 'all') {
    conditions.push(`customer_scope = '${customerScopeCodes[filter.customerScope]}'`)
  }

  if (filter.productScope !== 'all') {
    conditions.push(`product_code = '${productCodes[filter.productScope]}'`)
  }

  const excludedProducts = sortProducts(filter.excludedProducts ?? [])
  if (excludedProducts.length > 0) {
    const codes = excludedProducts.map((product) => `'${productCodes[product]}'`).join(', ')
    conditions.push(`product_code NOT IN (${codes})`)
  }

  if (filter.branch !== 'all') {
    conditions.push(`branch_code = '${branchCodes[filter.branch]}'`)
  }

  return conditions
    .map((condition, index) => (index === 0 ? `WHERE ${condition}` : `  AND ${condition}`))
    .join('\n')
}

export type BankingMetricFilterField =
  'snapshotDate' | 'customerScope' | 'productScope' | 'currency' | 'branch' | 'excludedProducts'

export interface BankingMetricFilterChange {
  field: BankingMetricFilterField
  label: string
  before: string
  after: string
}

const filterFieldLabels = {
  snapshotDate: '统计日期',
  customerScope: '客户口径',
  productScope: '产品口径',
  currency: '币种',
  branch: '机构范围',
  excludedProducts: '排除产品',
} satisfies Record<BankingMetricFilterField, string>

function isSameProductList(
  left: readonly BankingMetricProduct[] | undefined,
  right: readonly BankingMetricProduct[] | undefined,
): boolean {
  const leftSorted = sortProducts(left ?? [])
  const rightSorted = sortProducts(right ?? [])

  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((product, index) => product === rightSorted[index])
  )
}

function formatExcludedProducts(products: readonly BankingMetricProduct[] | undefined): string {
  const sorted = sortProducts(products ?? [])

  return sorted.length > 0
    ? sorted.map((product) => getBankingMetricProductLabel(product)).join('、')
    : '无'
}

export function isSameBankingMetricFilter(
  left: BankingMetricBalanceFilter,
  right: BankingMetricBalanceFilter,
): boolean {
  return (
    left.snapshotDate === right.snapshotDate &&
    left.customerScope === right.customerScope &&
    left.productScope === right.productScope &&
    left.branch === right.branch &&
    left.currency === right.currency &&
    isSameProductList(left.excludedProducts, right.excludedProducts)
  )
}

/**
 * 逐条列出本次口径变化涉及的业务条件，让 entered / left 可以追溯到具体过滤条件。
 */
export function diffBankingMetricFilters(
  previous: BankingMetricBalanceFilter,
  current: BankingMetricBalanceFilter,
): BankingMetricFilterChange[] {
  const changes: BankingMetricFilterChange[] = []

  if (previous.snapshotDate !== current.snapshotDate) {
    changes.push({
      field: 'snapshotDate',
      label: filterFieldLabels.snapshotDate,
      before: previous.snapshotDate,
      after: current.snapshotDate,
    })
  }

  if (previous.customerScope !== current.customerScope) {
    changes.push({
      field: 'customerScope',
      label: filterFieldLabels.customerScope,
      before: getBankingMetricCustomerLabel(previous.customerScope),
      after: getBankingMetricCustomerLabel(current.customerScope),
    })
  }

  if (previous.productScope !== current.productScope) {
    changes.push({
      field: 'productScope',
      label: filterFieldLabels.productScope,
      before:
        previous.productScope === 'all'
          ? '全部'
          : getBankingMetricProductLabel(previous.productScope),
      after:
        current.productScope === 'all'
          ? '全部'
          : getBankingMetricProductLabel(current.productScope),
    })
  }

  if (!isSameProductList(previous.excludedProducts, current.excludedProducts)) {
    changes.push({
      field: 'excludedProducts',
      label: filterFieldLabels.excludedProducts,
      before: formatExcludedProducts(previous.excludedProducts),
      after: formatExcludedProducts(current.excludedProducts),
    })
  }

  if (previous.branch !== current.branch) {
    changes.push({
      field: 'branch',
      label: filterFieldLabels.branch,
      before: getBankingMetricBranchLabel(previous.branch),
      after: getBankingMetricBranchLabel(current.branch),
    })
  }

  if (previous.currency !== current.currency) {
    changes.push({
      field: 'currency',
      label: filterFieldLabels.currency,
      before: getBankingMetricCurrencyLabel(previous.currency),
      after: getBankingMetricCurrencyLabel(current.currency),
    })
  }

  return changes
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
