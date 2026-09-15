import { depositLateBalanceSnapshot, DEPOSIT_BALANCE_SCOPE } from '../data/deposit-balance'
import type {
  AccountBalanceSnapshot,
  AccountMedium,
  LegacyTransformationDataset,
  OrderEvent,
  OrderItemEvent,
  PaymentEvent,
  RefundEvent,
  TransformationDataset,
  TransformationEvidence,
  TransformationGrain,
  TransformationJoinAnalysis,
  TransformationLayerSnapshot,
  TransformationPrediction,
  TransformationRow,
  TransformationRowChange,
  TransformationRowChangeKind,
  TransformationStepDefinition,
  TransformationStepId,
  TransformationStepResult,
  TransformationTableMetrics,
  TransformationTableSnapshot,
  TransformationWorkbenchState,
  UserRecord,
} from '../features/sql-transformation/types'

export const TRANSFORMATION_STEPS: readonly TransformationStepDefinition[] = [
  {
    id: 'plan',
    number: '01',
    label: '列出加工计划',
    title: '指标卡要翻译成哪些输入？',
    layer: '指标定义 → 加工计划',
    sql: `SELECT
  snapshot_date,
  branch_name,
  customer_scope,
  product_type,
  currency,
  SUM(balance) AS deposit_balance
FROM dwd_deposit_balance_detail
WHERE snapshot_date = :business_date
  AND branch_name = '杭州分行'
  AND customer_scope = '小微'
  AND product_type = '定期'
  AND currency = 'CNY'
GROUP BY snapshot_date, branch_name,
  customer_scope, product_type, currency;`,
    description: '先把指标卡里的时间、维度和度量对应到输入字段，再决定结果的一行代表哪组业务事实。',
    expectedChange: 'unchanged',
    expectedChangeLabel: '指标定义被翻译成计划，数据行数尚未变化',
  },
  {
    id: 'clean-detail',
    number: '02',
    label: '形成可信明细',
    title: '重复、缺关联和编码先在哪里处理？',
    layer: 'ODS → DWD',
    sql: `WITH ranked_snapshot AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY account_id, snapshot_date
      ORDER BY updated_at DESC
    ) AS rn
  FROM ods_account_balance_snapshot
)
SELECT
  s.snapshot_date,
  s.account_id,
  a.customer_id,
  c.customer_scope,
  a.product_id,
  p.product_type,
  b.branch_name,
  CASE WHEN s.currency = 'RMB' THEN 'CNY'
       ELSE s.currency END AS currency,
  s.balance
FROM ranked_snapshot s
LEFT JOIN dim_account a ON s.account_id = a.account_id
LEFT JOIN dim_customer c ON a.customer_id = c.customer_id
LEFT JOIN dim_product p ON a.product_id = p.product_id
LEFT JOIN dim_branch b ON a.branch_id = b.branch_id
WHERE s.rn = 1;`,
    description: '按账户和快照日保留最新记录，用 LEFT JOIN 保留缺失关联，再把同义币种归一到 CNY。',
    expectedChange: 'decrease',
    expectedChangeLabel: '重复快照被合并，明细从 5 行回到 4 行',
  },
  {
    id: 'join-fanout',
    number: '03',
    label: '检查 Join 放大',
    title: '一个账户有多个介质，会发生什么？',
    layer: 'DWD · Join 对照',
    sql: `SELECT
  d.snapshot_date,
  d.account_id,
  d.balance,
  m.medium_id,
  m.medium_type
FROM dwd_deposit_balance_detail AS d
LEFT JOIN account_medium AS m
  ON d.account_id = m.account_id;`,
    description: 'AccountMedium 只是教学辅助表；直接连接会把账户日余额复制到每个账户介质。',
    expectedChange: 'increase',
    expectedChangeLabel: 'A001 的 1 行被放大成 3 行，余额合计随之变大',
  },
  {
    id: 'aggregate-layers',
    number: '04',
    label: '聚合到指标层',
    title: '从账户明细到业务口径，一行变成什么？',
    layer: 'DWD → DWS',
    sql: `SELECT
  snapshot_date,
  branch_name,
  customer_scope,
  product_type,
  currency,
  SUM(balance) AS balance
FROM dwd_deposit_balance_detail
GROUP BY snapshot_date, branch_name,
  customer_scope, product_type, currency;`,
    description: 'DWD 保留账户日明细；DWS 按指标需要的维度聚合，同一组账户余额合并为一行。',
    expectedChange: 'decrease',
    expectedChangeLabel: '4 行账户明细合并为 3 行业务分组',
  },
  {
    id: 'contract',
    number: '05',
    label: '交付加工边界',
    title: '同一天再次执行，结果应该怎样？',
    layer: 'DWS → ADS',
    sql: `INSERT OVERWRITE ads_deposit_balance_daily
PARTITION (snapshot_date = :business_date)
SELECT
  snapshot_date,
  branch_name,
  customer_scope,
  product_type,
  currency,
  balance
FROM dws_deposit_balance_daily_staging
WHERE snapshot_date = :business_date;`,
    description:
      '把输入、输出、业务日期和分区写进加工契约；同样输入再次执行时，不应把余额再加一遍。',
    expectedChange: 'decrease',
    expectedChangeLabel: '从 3 个分组筛出指标卡对应的 1 行结果',
  },
]

export const TRANSFORMATION_LAYER_ORDER = ['ods', 'dwd', 'dws', 'ads'] as const

export const LEGACY_STEP_ALIASES: Partial<Record<TransformationStepId, TransformationStepId>> = {
  deduplicate: 'clean-detail',
  'join-users': 'clean-detail',
  'wrong-join': 'join-fanout',
  'fix-join': 'join-fanout',
  'build-dws': 'aggregate-layers',
  'wrong-group-by': 'aggregate-layers',
  'build-ads': 'contract',
  'late-data': 'contract',
}

export function getCanonicalStepId(stepId: TransformationStepId): TransformationStepId {
  return LEGACY_STEP_ALIASES[stepId] ?? stepId
}

export function getTransformationStep(
  stepId: TransformationStepId,
): TransformationStepDefinition | undefined {
  const canonicalStepId = getCanonicalStepId(stepId)
  return TRANSFORMATION_STEPS.find((step) => step.id === canonicalStepId)
}

export function getDatePart(timestamp: string | null | undefined): string | null {
  if (!timestamp) {
    return null
  }

  const datePart = timestamp.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/u.test(datePart) ? datePart : null
}

/** 使用业务日期的半开区间语义判断一条记录属于哪个快照日。 */
export function isInDatePartition(
  timestamp: string | null | undefined,
  targetDate: string,
): boolean {
  return getDatePart(timestamp) === targetDate
}

export function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase()
  return normalized === 'RMB' ? 'CNY' : normalized
}

function pickLatestByKey<T extends { updatedAt: string }>(
  rows: readonly T[],
  keySelector: (row: T) => string,
): T[] {
  const latestByKey = new Map<string, T>()

  for (const row of rows) {
    const key = keySelector(row)
    const current = latestByKey.get(key)

    if (!current || row.updatedAt > current.updatedAt) {
      latestByKey.set(key, row)
    }
  }

  return [...latestByKey.values()]
}

export function deduplicateBalanceSnapshots(
  snapshots: readonly AccountBalanceSnapshot[],
): AccountBalanceSnapshot[] {
  return pickLatestByKey(snapshots, (snapshot) => `${snapshot.snapshotDate}|${snapshot.accountId}`)
}

/** @deprecated Use deduplicateBalanceSnapshots in the banking teaching domain. */
export function deduplicateOrderEvents(orders: readonly OrderEvent[]): OrderEvent[] {
  return pickLatestByKey(orders, (order) => order.orderId)
}

/** @deprecated Kept as a migration seam for former payment-event callers. */
export function deduplicatePaymentEvents(payments: readonly PaymentEvent[]): PaymentEvent[] {
  return pickLatestByKey(payments, (payment) => payment.transactionKey)
}

/** @deprecated Refund events are not used by the banking balance lesson. */
export function getRefundTotals(refunds: readonly RefundEvent[]): Map<string, number> {
  const totals = new Map<string, number>()

  for (const refund of refunds) {
    if (refund.status !== 'SUCCESS') {
      continue
    }

    totals.set(refund.orderId, (totals.get(refund.orderId) ?? 0) + refund.amount)
  }

  return totals
}

export function getCanonicalBalanceSnapshots(
  dataset: TransformationDataset,
): AccountBalanceSnapshot[] {
  return deduplicateBalanceSnapshots(dataset.accountBalanceSnapshots)
}

export interface TransformationDimensionGap {
  accountId: string
  missingDimensions: readonly ('customer' | 'product' | 'branch')[]
}

export function getMissingDimensionGaps(
  dataset: TransformationDataset,
): TransformationDimensionGap[] {
  const accountsById = new Map(dataset.accounts.map((account) => [account.accountId, account]))
  const customers = new Set(dataset.customers.map((customer) => customer.customerId))
  const products = new Set(dataset.products.map((product) => product.productId))
  const branches = new Set(dataset.branches.map((branch) => branch.branchId))
  const gaps: TransformationDimensionGap[] = []

  for (const snapshot of getCanonicalBalanceSnapshots(dataset)) {
    const account = accountsById.get(snapshot.accountId)
    const missingDimensions: Array<'customer' | 'product' | 'branch'> = []

    if (!account || !customers.has(account.customerId)) {
      missingDimensions.push('customer')
    }
    if (!account || !products.has(account.productId)) {
      missingDimensions.push('product')
    }
    if (!account || !branches.has(account.branchId)) {
      missingDimensions.push('branch')
    }

    if (missingDimensions.length > 0) {
      gaps.push({ accountId: snapshot.accountId, missingDimensions })
    }
  }

  return gaps
}

function getLegacyOrderItemsByOrder(
  items: readonly OrderItemEvent[],
): Map<string, OrderItemEvent[]> {
  const grouped = new Map<string, OrderItemEvent[]>()

  for (const item of items) {
    const current = grouped.get(item.orderId) ?? []
    current.push(item)
    grouped.set(item.orderId, current)
  }

  return grouped
}

function getLegacyUser(users: readonly UserRecord[], userId: string): UserRecord | undefined {
  return users.find((user) => user.userId === userId)
}

function getLegacyPaymentsByOrder(payments: readonly PaymentEvent[]): Map<string, PaymentEvent> {
  const paymentsByOrder = new Map<string, PaymentEvent>()

  for (const payment of deduplicatePaymentEvents(payments)) {
    const current = paymentsByOrder.get(payment.orderId)
    if (!current || payment.updatedAt > current.updatedAt) {
      paymentsByOrder.set(payment.orderId, payment)
    }
  }

  return paymentsByOrder
}

function allocateLegacyRefunds(
  items: readonly OrderItemEvent[],
  refundTotal: number,
): Map<string, number> {
  const allocations = new Map<string, number>()
  const itemTotal = items.reduce((total, item) => total + item.itemAmount, 0)

  if (refundTotal === 0 || itemTotal === 0 || items.length === 0) {
    items.forEach((item) => allocations.set(item.itemId, 0))
    return allocations
  }

  let allocated = 0
  items.forEach((item, index) => {
    const amount =
      index === items.length - 1
        ? roundCurrency(refundTotal - allocated)
        : roundCurrency((refundTotal * item.itemAmount) / itemTotal)
    allocations.set(item.itemId, amount)
    allocated += amount
  })

  return allocations
}

/** @deprecated Use buildDepositBalanceRows in the banking teaching domain. */
export function buildOrderItemRows(
  dataset: LegacyTransformationDataset | TransformationDataset,
): TransformationRow[] {
  if (!('orders' in dataset)) {
    return buildDepositBalanceRows(dataset)
  }

  const canonicalOrders = getCanonicalOrders(dataset)
  const itemsByOrder = getLegacyOrderItemsByOrder(dataset.orderItems)
  const paymentsByOrder = getLegacyPaymentsByOrder(dataset.payments)
  const refundTotals = getRefundTotals(dataset.refunds)
  const rows: TransformationRow[] = []

  for (const order of canonicalOrders) {
    const items = itemsByOrder.get(order.orderId) ?? []
    const payment = paymentsByOrder.get(order.orderId)
    const user = getLegacyUser(dataset.users, order.userId)
    const refundAllocation = allocateLegacyRefunds(items, refundTotals.get(order.orderId) ?? 0)

    for (const item of items) {
      const refundAmount = refundAllocation.get(item.itemId) ?? 0
      rows.push({
        order_id: order.orderId,
        item_id: item.itemId,
        user_id: order.userId,
        user_name: user?.userName ?? null,
        user_city: user?.city ?? null,
        product: item.product,
        order_time: order.orderTime,
        paid_at: payment?.paidAt ?? null,
        paid_date: getDatePart(payment?.paidAt),
        payment_status: payment?.status === 'SUCCESS' ? 'PAID' : 'UNPAID',
        item_amount: item.itemAmount,
        refund_amount: refundAmount,
        net_amount: roundCurrency(item.itemAmount - refundAmount),
      })
    }
  }

  return rows
}

/** @deprecated Use banking snapshots; this adapter only keeps old callers type-safe. */
export function buildOrderRows(
  dataset: LegacyTransformationDataset | TransformationDataset,
): TransformationRow[] {
  if (!('orders' in dataset)) {
    return buildDepositBalanceRows(dataset)
  }

  const canonicalOrders = getCanonicalOrders(dataset)
  const itemsByOrder = getLegacyOrderItemsByOrder(dataset.orderItems)
  const paymentsByOrder = getLegacyPaymentsByOrder(dataset.payments)
  const refundTotals = getRefundTotals(dataset.refunds)

  return canonicalOrders.map((order) => {
    const items = itemsByOrder.get(order.orderId) ?? []
    const payment = paymentsByOrder.get(order.orderId)
    const user = getLegacyUser(dataset.users, order.userId)
    const grossAmount = items.reduce((total, item) => total + item.itemAmount, 0)
    const refundAmount = refundTotals.get(order.orderId) ?? 0

    return {
      order_id: order.orderId,
      user_id: order.userId,
      user_name: user?.userName ?? null,
      user_city: user?.city ?? null,
      order_time: order.orderTime,
      paid_at: payment?.paidAt ?? null,
      paid_date: getDatePart(payment?.paidAt),
      payment_status: payment?.status === 'SUCCESS' ? 'PAID' : 'UNPAID',
      gross_amount: grossAmount,
      refund_amount: refundAmount,
      net_amount: roundCurrency(grossAmount - refundAmount),
    }
  })
}

export function getCanonicalOrders(dataset: LegacyTransformationDataset): OrderEvent[] {
  return deduplicateOrderEvents(dataset.orders)
}

export function getCanonicalPayments(dataset: LegacyTransformationDataset): PaymentEvent[] {
  return deduplicatePaymentEvents(dataset.payments)
}

export function buildDepositBalanceRows(dataset: TransformationDataset): TransformationRow[] {
  const accountsById = new Map(dataset.accounts.map((account) => [account.accountId, account]))
  const customersById = new Map(
    dataset.customers.map((customer) => [customer.customerId, customer]),
  )
  const productsById = new Map(dataset.products.map((product) => [product.productId, product]))
  const branchesById = new Map(dataset.branches.map((branch) => [branch.branchId, branch]))

  return getCanonicalBalanceSnapshots(dataset).map((snapshot) => {
    const account = accountsById.get(snapshot.accountId)
    const customer = account ? customersById.get(account.customerId) : undefined
    const product = account ? productsById.get(account.productId) : undefined
    const branch = account ? branchesById.get(account.branchId) : undefined
    const missingDimensions = [
      !customer ? 'customer' : null,
      !product ? 'product' : null,
      !branch ? 'branch' : null,
    ].filter((dimension): dimension is string => dimension !== null)

    return {
      snapshot_date: snapshot.snapshotDate,
      account_id: snapshot.accountId,
      customer_id: account?.customerId ?? null,
      customer_scope: customer?.customerScope ?? null,
      product_id: account?.productId ?? null,
      product_type: product?.productType ?? null,
      branch_id: account?.branchId ?? null,
      branch_name: branch?.branchName ?? null,
      source_currency: snapshot.currency,
      currency: normalizeCurrency(snapshot.currency),
      balance: snapshot.balance,
      updated_at: snapshot.updatedAt,
      ingested_at: snapshot.ingestedAt,
      missing_dimensions: missingDimensions.length > 0 ? missingDimensions.join('、') : null,
    }
  })
}

function getAccountMediaByAccount(
  accountMedia: readonly AccountMedium[],
): Map<string, AccountMedium[]> {
  const mediaByAccount = new Map<string, AccountMedium[]>()

  for (const medium of accountMedia) {
    const media = mediaByAccount.get(medium.accountId) ?? []
    media.push(medium)
    mediaByAccount.set(medium.accountId, media)
  }

  return mediaByAccount
}

export function buildAccountMediumRows(dataset: TransformationDataset): TransformationRow[] {
  return dataset.accountMedia.map((medium) => ({
    medium_id: medium.mediumId,
    account_id: medium.accountId,
    medium_type: medium.mediumType,
  }))
}

export function buildWrongMediumJoinRows(dataset: TransformationDataset): TransformationRow[] {
  const dwdRows = buildDepositBalanceRows(dataset)
  const mediaByAccount = getAccountMediaByAccount(dataset.accountMedia)
  const rows: TransformationRow[] = []

  for (const row of dwdRows) {
    const media = mediaByAccount.get(String(row.account_id)) ?? []
    const matches: Array<AccountMedium | null> = media.length > 0 ? media : [null]

    for (const medium of matches) {
      rows.push({
        ...row,
        medium_id: medium?.mediumId ?? null,
        medium_type: medium?.mediumType ?? null,
      })
    }
  }

  return rows
}

function isTargetScope(row: TransformationRow, targetDate: string): boolean {
  return (
    row.snapshot_date === targetDate &&
    row.branch_name === DEPOSIT_BALANCE_SCOPE.branchName &&
    row.customer_scope === DEPOSIT_BALANCE_SCOPE.customerScope &&
    row.product_type === DEPOSIT_BALANCE_SCOPE.productType &&
    row.currency === DEPOSIT_BALANCE_SCOPE.currency
  )
}

function sumBalance(rows: readonly TransformationRow[]): number {
  return roundCurrency(
    rows.reduce((total, row) => {
      const balance = row.balance
      return typeof balance === 'number' && Number.isFinite(balance) ? total + balance : total
    }, 0),
  )
}

export function getJoinFanoutAnalysis(dataset: TransformationDataset): TransformationJoinAnalysis {
  const dwdRows = buildDepositBalanceRows(dataset)
  const wrongRows = buildWrongMediumJoinRows(dataset)
  const mediaByAccount = getAccountMediaByAccount(dataset.accountMedia)
  const accountIds = [...new Set(dwdRows.map((row) => String(row.account_id)))]
  const matches = accountIds.map((accountId) => {
    const rightCount = mediaByAccount.get(accountId)?.length ?? 0
    return {
      key: accountId,
      leftCount: 1,
      rightCount,
      outputCount: Math.max(rightCount, 1),
    }
  })

  return {
    leftTable: 'dwd_deposit_balance_detail',
    rightTable: 'account_medium',
    joinKey: 'account_id',
    leftRows: dwdRows.length,
    rightRows: dataset.accountMedia.length,
    outputRows: wrongRows.length,
    correctOutputRows: dwdRows.length,
    correctOutputAmount: sumBalance(
      dwdRows.filter((row) => isTargetScope(row, dataset.targetDate)),
    ),
    wrongTargetAmount: sumBalance(
      wrongRows.filter((row) => isTargetScope(row, dataset.targetDate)),
    ),
    correctTargetAmount: sumBalance(
      dwdRows.filter((row) => isTargetScope(row, dataset.targetDate)),
    ),
    matches,
  }
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function getDwsRows(dataset: TransformationDataset): TransformationRow[] {
  const grouped = new Map<
    string,
    {
      snapshotDate: string
      branchName: string | null
      customerScope: string | null
      productType: string | null
      currency: string
      balance: number
    }
  >()

  for (const row of buildDepositBalanceRows(dataset)) {
    const values = {
      snapshotDate: String(row.snapshot_date),
      branchName: typeof row.branch_name === 'string' ? row.branch_name : null,
      customerScope: typeof row.customer_scope === 'string' ? row.customer_scope : null,
      productType: typeof row.product_type === 'string' ? row.product_type : null,
      currency: String(row.currency),
    }
    const key = [
      values.snapshotDate,
      values.branchName ?? 'NULL',
      values.customerScope ?? 'NULL',
      values.productType ?? 'NULL',
      values.currency,
    ].join('|')
    const current = grouped.get(key) ?? { ...values, balance: 0 }
    current.balance += typeof row.balance === 'number' ? row.balance : 0
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .sort((left, right) => {
      const leftKey = [
        left.snapshotDate,
        left.branchName ?? '',
        left.customerScope ?? '',
        left.productType ?? '',
        left.currency,
      ].join('|')
      const rightKey = [
        right.snapshotDate,
        right.branchName ?? '',
        right.customerScope ?? '',
        right.productType ?? '',
        right.currency,
      ].join('|')
      return leftKey.localeCompare(rightKey)
    })
    .map((group) => ({
      snapshot_date: group.snapshotDate,
      branch_name: group.branchName,
      customer_scope: group.customerScope,
      product_type: group.productType,
      currency: group.currency,
      balance: roundCurrency(group.balance),
    }))
}

function getAdsRows(dataset: TransformationDataset): TransformationRow[] {
  const targetRows = getDwsRows(dataset).filter((row) => isTargetScope(row, dataset.targetDate))

  return [
    {
      snapshot_date: dataset.targetDate,
      branch_name: DEPOSIT_BALANCE_SCOPE.branchName,
      customer_scope: DEPOSIT_BALANCE_SCOPE.customerScope,
      product_type: DEPOSIT_BALANCE_SCOPE.productType,
      currency: DEPOSIT_BALANCE_SCOPE.currency,
      metric: 'deposit_balance',
      metric_name: '存款余额',
      balance: sumBalance(targetRows),
      definition: '截至快照日 · 杭州分行 · 小微 · 定期 · CNY',
    },
  ]
}

function buildTable(
  table: Omit<TransformationTableSnapshot, 'rows'> & { rows: readonly TransformationRow[] },
): TransformationTableSnapshot {
  return table
}

function getMetricDefinitionTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'metric-definition-card',
    name: 'metric_deposit_balance_definition',
    grain: '一行 = 一张指标卡',
    columns: [
      'metric_name',
      'snapshot_date',
      'branch_name',
      'customer_scope',
      'product_type',
      'currency',
      'measure',
    ],
    rowKey: ['metric_name'],
    rows: [
      {
        metric_name: '存款余额',
        snapshot_date: dataset.targetDate,
        branch_name: DEPOSIT_BALANCE_SCOPE.branchName,
        customer_scope: DEPOSIT_BALANCE_SCOPE.customerScope,
        product_type: DEPOSIT_BALANCE_SCOPE.productType,
        currency: DEPOSIT_BALANCE_SCOPE.currency,
        measure: 'balance',
      },
    ],
  })
}

function getProcessingPlanTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'deposit-processing-plan',
    name: 'deposit_balance_processing_plan',
    grain: '一行 = 一个指标加工计划',
    columns: ['metric_name', 'source_tables', 'target_grain', 'business_date', 'filters'],
    rowKey: ['metric_name'],
    rows: [
      {
        metric_name: '存款余额',
        source_tables: 'AccountBalanceSnapshot · Account · Customer · Product · Branch',
        target_grain: 'snapshot_date × branch × customer_scope × product_type × currency',
        business_date: dataset.targetDate,
        filters: '杭州分行 · 小微 · 定期 · CNY',
      },
    ],
  })
}

export function getOdsSnapshot(dataset: TransformationDataset): TransformationLayerSnapshot {
  return {
    layer: 'ods',
    label: 'ODS',
    title: '输入表保留原始差异',
    description: '重复快照、RMB 编码和缺失维度关联都先留在输入快照里，便于逐条核对。',
    tables: [
      buildTable({
        id: 'ods-account-balance-snapshots',
        name: 'ods_account_balance_snapshot',
        grain: '一行 = 一个账户 × 一个快照日（原始记录）',
        columns: [
          'snapshot_date',
          'account_id',
          'balance',
          'currency',
          'updated_at',
          'ingested_at',
        ],
        rowKey: ['snapshot_date', 'account_id'],
        amountColumn: 'balance',
        rows: dataset.accountBalanceSnapshots.map((snapshot) => ({
          snapshot_date: snapshot.snapshotDate,
          account_id: snapshot.accountId,
          balance: snapshot.balance,
          currency: snapshot.currency,
          updated_at: snapshot.updatedAt,
          ingested_at: snapshot.ingestedAt,
        })),
      }),
      buildTable({
        id: 'ods-accounts',
        name: 'dim_account',
        grain: '一行 = 一个账户的关联键',
        columns: ['account_id', 'customer_id', 'product_id', 'branch_id'],
        rowKey: ['account_id'],
        rows: dataset.accounts.map((account) => ({
          account_id: account.accountId,
          customer_id: account.customerId,
          product_id: account.productId,
          branch_id: account.branchId,
        })),
      }),
      buildTable({
        id: 'ods-customers',
        name: 'dim_customer',
        grain: '一行 = 一个客户的分析属性',
        columns: ['customer_id', 'customer_name', 'customer_scope'],
        rowKey: ['customer_id'],
        rows: dataset.customers.map((customer) => ({
          customer_id: customer.customerId,
          customer_name: customer.customerName,
          customer_scope: customer.customerScope,
        })),
      }),
      buildTable({
        id: 'ods-products',
        name: 'dim_product',
        grain: '一行 = 一个产品定义',
        columns: ['product_id', 'product_name', 'product_type'],
        rowKey: ['product_id'],
        rows: dataset.products.map((product) => ({
          product_id: product.productId,
          product_name: product.productName,
          product_type: product.productType,
        })),
      }),
      buildTable({
        id: 'ods-branches',
        name: 'dim_branch',
        grain: '一行 = 一个机构节点',
        columns: ['branch_id', 'branch_name'],
        rowKey: ['branch_id'],
        rows: dataset.branches.map((branch) => ({
          branch_id: branch.branchId,
          branch_name: branch.branchName,
        })),
      }),
      buildTable({
        id: 'ods-account-media',
        name: 'account_medium',
        grain: '一行 = 一个账户 × 一个账户介质（教学辅助）',
        columns: ['medium_id', 'account_id', 'medium_type'],
        rowKey: ['medium_id'],
        rows: buildAccountMediumRows(dataset),
      }),
    ],
  }
}

function getDwdTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'dwd-deposit-balance-detail',
    name: 'dwd_deposit_balance_detail',
    grain: '一行 = 一个账户 × 一个快照日',
    columns: [
      'snapshot_date',
      'account_id',
      'customer_id',
      'customer_scope',
      'product_id',
      'product_type',
      'branch_id',
      'branch_name',
      'source_currency',
      'currency',
      'balance',
      'missing_dimensions',
    ],
    rowKey: ['snapshot_date', 'account_id'],
    amountColumn: 'balance',
    rows: buildDepositBalanceRows(dataset),
  })
}

function getWrongJoinTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'wrong-account-medium-join',
    name: 'dwd_deposit_balance_wrong_join',
    grain: '一行 = 一个账户 × 快照日 × 账户介质（错误）',
    columns: [
      'snapshot_date',
      'account_id',
      'branch_name',
      'customer_scope',
      'product_type',
      'currency',
      'medium_id',
      'medium_type',
      'balance',
    ],
    rowKey: ['snapshot_date', 'account_id', 'medium_id'],
    amountColumn: 'balance',
    rows: buildWrongMediumJoinRows(dataset),
  })
}

function getDwsTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'dws-deposit-balance-daily',
    name: 'dws_deposit_balance_daily',
    grain: '一行 = 一个快照日 × 机构 × 客户口径 × 产品 × 币种',
    columns: [
      'snapshot_date',
      'branch_name',
      'customer_scope',
      'product_type',
      'currency',
      'balance',
    ],
    rowKey: ['snapshot_date', 'branch_name', 'customer_scope', 'product_type', 'currency'],
    amountColumn: 'balance',
    rows: getDwsRows(dataset),
  })
}

function getAdsTable(dataset: TransformationDataset): TransformationTableSnapshot {
  return buildTable({
    id: 'ads-deposit-balance-daily',
    name: 'ads_deposit_balance_daily',
    grain: '一行 = 一个快照日 × 一张存款余额指标卡',
    columns: [
      'snapshot_date',
      'branch_name',
      'customer_scope',
      'product_type',
      'currency',
      'metric',
      'metric_name',
      'balance',
      'definition',
    ],
    rowKey: ['snapshot_date', 'metric'],
    amountColumn: 'balance',
    rows: getAdsRows(dataset),
  })
}

export function appendLateBalanceSnapshot(
  dataset: TransformationDataset,
  snapshot: AccountBalanceSnapshot = depositLateBalanceSnapshot,
): TransformationDataset {
  const exists = dataset.accountBalanceSnapshots.some(
    (candidate) =>
      candidate.snapshotDate === snapshot.snapshotDate &&
      candidate.accountId === snapshot.accountId,
  )

  return exists
    ? dataset
    : { ...dataset, accountBalanceSnapshots: [...dataset.accountBalanceSnapshots, snapshot] }
}

/** @deprecated Use appendLateBalanceSnapshot for the banking teaching domain. */
export function appendLateData(dataset: TransformationDataset): TransformationDataset
export function appendLateData(dataset: LegacyTransformationDataset): LegacyTransformationDataset
export function appendLateData(
  dataset: LegacyTransformationDataset | TransformationDataset,
): LegacyTransformationDataset | TransformationDataset {
  if (!('orders' in dataset)) {
    return appendLateBalanceSnapshot(dataset)
  }

  if (dataset.orders.some((order) => order.orderId === dataset.lateOrder.order.orderId)) {
    return dataset
  }

  return {
    ...dataset,
    orders: [...dataset.orders, dataset.lateOrder.order],
    orderItems: [...dataset.orderItems, dataset.lateOrder.item],
    payments: [...dataset.payments, dataset.lateOrder.payment],
  }
}

export function getLayerSnapshots(
  dataset: TransformationDataset,
  includeLateData?: boolean,
): TransformationLayerSnapshot[]
export function getLayerSnapshots(
  dataset: TransformationDataset,
  legacyGrain: TransformationGrain,
  includeLateData?: boolean,
): TransformationLayerSnapshot[]
export function getLayerSnapshots(
  dataset: TransformationDataset,
  includeLateDataOrLegacyGrain: boolean | TransformationGrain = false,
  legacyIncludeLateData = false,
): TransformationLayerSnapshot[] {
  const includeLateData =
    typeof includeLateDataOrLegacyGrain === 'boolean'
      ? includeLateDataOrLegacyGrain
      : legacyIncludeLateData
  const effectiveDataset = includeLateData ? appendLateBalanceSnapshot(dataset) : dataset

  return [
    getOdsSnapshot(effectiveDataset),
    {
      layer: 'dwd',
      label: 'DWD',
      title: '可信账户日明细',
      description: '去掉重复快照，保留缺失维度的余额记录，并把币种编码标准化。',
      tables: [getDwdTable(effectiveDataset)],
    },
    {
      layer: 'dws',
      label: 'DWS',
      title: '存款余额主题汇总',
      description: '按指标卡需要的机构、客户口径、产品和币种聚合账户余额。',
      tables: [getDwsTable(effectiveDataset)],
    },
    {
      layer: 'ads',
      label: 'ADS',
      title: '存款余额指标结果',
      description: '筛出杭州分行、小微、定期、CNY 这张指标卡对应的快照日结果。',
      tables: [getAdsTable(effectiveDataset)],
    },
  ]
}

function getTable(
  snapshots: readonly TransformationLayerSnapshot[],
  id: string,
): TransformationTableSnapshot {
  const table = snapshots
    .flatMap((snapshot) => snapshot.tables)
    .find((candidate) => candidate.id === id)
  if (!table) {
    throw new Error(`找不到数据加工表快照: ${id}`)
  }

  return table
}

function getRowDate(row: TransformationRow): string | null {
  for (const field of ['snapshot_date', 'dt', 'stat_date', 'updated_at', 'ingested_at']) {
    const value = row[field]
    if (typeof value === 'string') {
      const date = getDatePart(value)
      if (date) {
        return date
      }
    }
  }

  return null
}

function sumAmount(rows: readonly TransformationRow[], amountColumn: string): number {
  return roundCurrency(
    rows.reduce((total, row) => {
      const value = row[amountColumn]
      return typeof value === 'number' && Number.isFinite(value) ? total + value : total
    }, 0),
  )
}

export function getTableMetrics(
  table: TransformationTableSnapshot,
  targetDate: string,
): TransformationTableMetrics {
  const amountColumn = table.amountColumn ?? '—'
  const targetRows = table.rows.filter((row) => getRowDate(row) === targetDate)

  return {
    rowCount: table.rows.length,
    amount: amountColumn === '—' ? 0 : sumAmount(table.rows, amountColumn),
    amountColumn,
    targetRowCount: targetRows.length,
    targetAmount: amountColumn === '—' ? 0 : sumAmount(targetRows, amountColumn),
  }
}

function rowKey(row: TransformationRow, columns: readonly string[]): string {
  return columns.map((column) => `${column}=${String(row[column] ?? 'NULL')}`).join('|')
}

function rowSignature(row: TransformationRow): string {
  return Object.keys(row)
    .sort()
    .map((key) => `${key}=${String(row[key] ?? 'NULL')}`)
    .join('|')
}

export function compareTableRows(
  before: TransformationTableSnapshot,
  after: TransformationTableSnapshot,
  comparisonColumns: readonly string[] = before.rowKey,
): TransformationRowChange[] {
  const beforeRows = new Map<string, TransformationRow[]>()
  const afterRows = new Map<string, TransformationRow[]>()

  for (const row of before.rows) {
    const key = rowKey(row, comparisonColumns)
    beforeRows.set(key, [...(beforeRows.get(key) ?? []), row])
  }

  for (const row of after.rows) {
    const key = rowKey(row, comparisonColumns)
    afterRows.set(key, [...(afterRows.get(key) ?? []), row])
  }

  const keys = [...new Set([...beforeRows.keys(), ...afterRows.keys()])]

  return keys.map((key) => {
    const previous = beforeRows.get(key) ?? []
    const next = afterRows.get(key) ?? []
    let kind: TransformationRowChangeKind

    if (previous.length === 0) {
      kind = 'added'
    } else if (next.length === 0) {
      kind = 'removed'
    } else if (next.length > previous.length) {
      kind = 'duplicated'
    } else if (next.length < previous.length) {
      kind = 'merged'
    } else if (previous.some((row, index) => rowSignature(row) !== rowSignature(next[index]!))) {
      kind = 'updated'
    } else {
      kind = 'same'
    }

    return { key, kind, beforeCount: previous.length, afterCount: next.length }
  })
}

function createEvidence(
  kind: TransformationEvidence['kind'],
  title: string,
  detail: string,
  keys: readonly string[],
): TransformationEvidence {
  return { kind, title, detail, keys }
}

function createStepResult(
  dataset: TransformationDataset,
  stepId: TransformationStepId,
  input: TransformationTableSnapshot,
  output: TransformationTableSnapshot,
  evidence: readonly TransformationEvidence[],
  comparisonColumns: readonly string[],
  joinAnalysis?: TransformationJoinAnalysis,
): TransformationStepResult {
  const step = getTransformationStep(stepId)
  if (!step) {
    throw new Error(`未知的数据加工步骤: ${stepId}`)
  }

  const inputMetrics = getTableMetrics(input, dataset.targetDate)
  const outputMetrics = getTableMetrics(output, dataset.targetDate)
  const actualChange =
    outputMetrics.rowCount > inputMetrics.rowCount
      ? 'increase'
      : outputMetrics.rowCount < inputMetrics.rowCount
        ? 'decrease'
        : 'unchanged'

  return {
    step,
    input,
    output,
    changes: compareTableRows(input, output, comparisonColumns),
    comparisonColumns,
    evidence,
    inputMetrics,
    outputMetrics,
    actualChange,
    ...(joinAnalysis ? { joinAnalysis } : {}),
  }
}

export function getTransformationStepResult(
  dataset: TransformationDataset,
  stepId: TransformationStepId,
): TransformationStepResult
export function getTransformationStepResult(
  dataset: TransformationDataset,
  legacyGrain: TransformationGrain,
  stepId: TransformationStepId,
): TransformationStepResult
export function getTransformationStepResult(
  dataset: TransformationDataset,
  stepIdOrLegacyGrain: TransformationStepId | TransformationGrain,
  legacyStepId?: TransformationStepId,
): TransformationStepResult {
  const stepId = legacyStepId ?? (stepIdOrLegacyGrain as TransformationStepId)
  const canonicalStepId = getCanonicalStepId(stepId)
  const effectiveDataset = stepId === 'late-data' ? appendLateBalanceSnapshot(dataset) : dataset
  const odsSnapshots = [getOdsSnapshot(effectiveDataset)]
  const snapshots = getLayerSnapshots(effectiveDataset)
  const raw = getTable(odsSnapshots, 'ods-account-balance-snapshots')
  const dwd = getTable(snapshots, 'dwd-deposit-balance-detail')
  const wrongJoin = getTable(
    [{ ...snapshots[1]!, tables: [getWrongJoinTable(effectiveDataset)] }],
    'wrong-account-medium-join',
  )
  const dws = getTable(snapshots, 'dws-deposit-balance-daily')
  const ads = getTable(snapshots, 'ads-deposit-balance-daily')
  const definition = getMetricDefinitionTable(effectiveDataset)
  const plan = getProcessingPlanTable(effectiveDataset)

  switch (canonicalStepId) {
    case 'plan':
      return createStepResult(
        dataset,
        stepId,
        definition,
        plan,
        [
          createEvidence(
            'target-scope',
            '指标卡的每个条件都有对应字段',
            '统计日期、度量、机构、客户口径、产品和币种已经映射到加工计划；此时还没有读取余额明细。',
            [
              'snapshot_date',
              'balance',
              'branch_name',
              'customer_scope',
              'product_type',
              'currency',
            ],
          ),
        ],
        ['metric_name'],
      )
    case 'clean-detail':
      return createStepResult(
        dataset,
        stepId,
        raw,
        dwd,
        [
          createEvidence(
            'duplicate-snapshot',
            'A001 的重复快照有保留依据',
            '同一个 account_id + snapshot_date 出现两条记录；按 updated_at 保留 23:58:05 的最新余额 100000。',
            ['A001', dataset.targetDate, 'updated_at DESC'],
          ),
          createEvidence(
            'missing-dimension',
            '缺失关联被保留下来',
            'A003 找不到 Customer C404，A004 找不到 Product P404；LEFT JOIN 保留余额，缺失属性明确显示为 NULL。',
            ['A003 / C404', 'A004 / P404', 'LEFT JOIN'],
          ),
          createEvidence(
            'currency-normalized',
            'RMB 与 CNY 进入同一标准编码',
            'A002 的来源编码是 RMB，进入 DWD 后统一为 CNY；余额数值没有因此被换算或重复计算。',
            ['A002', 'RMB → CNY'],
          ),
        ],
        ['snapshot_date', 'account_id'],
      )
    case 'join-fanout': {
      const joinAnalysis = getJoinFanoutAnalysis(dataset)
      return createStepResult(
        dataset,
        stepId,
        dwd,
        wrongJoin,
        [
          createEvidence(
            'one-to-many',
            'A001 的一行被复制成三行',
            'DWD 中 A001 × 快照日只有 1 行；AccountMedium 中同一 account_id 有 CARD、CARD、PASSBOOK 三行，直接 Join 后变成 3 行。',
            ['A001', '1 × 3 = 3', '100000 → 300000'],
          ),
          createEvidence(
            'grain-mismatch',
            '存在 account_id 不代表必须 Join',
            '账户介质不是存款余额指标的统计维度。若只是需要判断是否有介质，应先聚合或使用 EXISTS，不要把余额复制到介质粒度。',
            ['DWD: 账户 × 日期', 'AccountMedium: 账户 × 介质'],
          ),
        ],
        ['snapshot_date', 'account_id'],
        joinAnalysis,
      )
    }
    case 'aggregate-layers':
      return createStepResult(
        dataset,
        stepId,
        dwd,
        dws,
        [
          createEvidence(
            'grain-mismatch',
            'DWS 一行代表一组指标维度',
            'DWD 的 4 行账户日明细按 snapshot_date、branch_name、customer_scope、product_type、currency 聚合成 3 行。',
            ['DWD 4 rows', 'DWS 3 rows', 'account_id 不再是输出粒度'],
          ),
          createEvidence(
            'target-scope',
            '目标口径的两笔余额合成 300000',
            'A001 的 100000 与 A002 的 200000 都满足杭州分行、小微、定期、CNY，DWS 目标分组余额为 300000。',
            ['杭州分行', '小微', '定期', 'CNY', '300000'],
          ),
        ],
        ['snapshot_date', 'branch_name', 'customer_scope', 'product_type', 'currency'],
      )
    case 'contract':
      return createStepResult(
        dataset,
        stepId,
        dws,
        ads,
        [
          createEvidence(
            'target-scope',
            'ADS 只发布指标卡对应的一行',
            'DWS 保留 3 个业务分组；ADS 按同一业务日期和指标条件筛出杭州分行、小微、定期、CNY 的 300000。',
            ['snapshot_date = 2026-09-30', 'deposit_balance', '300000'],
          ),
        ],
        ['snapshot_date', 'branch_name', 'customer_scope', 'product_type', 'currency'],
      )
    default:
      throw new Error(`未知的数据加工步骤: ${stepId}`)
  }
}

export function createInitialTransformationState(): TransformationWorkbenchState {
  return {
    targetGrain: null,
    activeStepId: 'plan',
    completedStepIds: [],
    predictions: {},
  }
}

export function selectTransformationGrain(
  state: TransformationWorkbenchState,
  grain: TransformationGrain,
): TransformationWorkbenchState {
  return {
    targetGrain: grain,
    activeStepId: 'plan',
    completedStepIds: [],
    predictions: {},
  }
}

export function selectTransformationStep(
  state: TransformationWorkbenchState,
  stepId: TransformationStepId,
): TransformationWorkbenchState {
  const stepIndex = TRANSFORMATION_STEPS.findIndex((step) => step.id === stepId)
  const nextStepIndex = state.completedStepIds.length

  if (stepIndex < 0 || stepIndex > nextStepIndex) {
    return state
  }

  return { ...state, activeStepId: stepId }
}

export function setTransformationPrediction(
  state: TransformationWorkbenchState,
  prediction: TransformationPrediction,
): TransformationWorkbenchState {
  if (!state.targetGrain) {
    return state
  }

  return {
    ...state,
    predictions: {
      ...state.predictions,
      [state.activeStepId]: prediction,
    },
  }
}

export function canExecuteTransformationStep(state: TransformationWorkbenchState): boolean {
  const nextStep = TRANSFORMATION_STEPS[state.completedStepIds.length]
  return Boolean(
    state.targetGrain &&
    nextStep &&
    nextStep.id === state.activeStepId &&
    state.predictions[state.activeStepId],
  )
}

export function executeTransformationStep(
  state: TransformationWorkbenchState,
): TransformationWorkbenchState {
  if (!canExecuteTransformationStep(state)) {
    return state
  }

  const completedStepIds = [...state.completedStepIds, state.activeStepId]
  const nextStep = TRANSFORMATION_STEPS[completedStepIds.length]

  return {
    ...state,
    completedStepIds,
    activeStepId: nextStep?.id ?? state.activeStepId,
  }
}

export function getTransformationStepIndex(stepId: TransformationStepId): number {
  const canonicalStepId = getCanonicalStepId(stepId)
  return TRANSFORMATION_STEPS.findIndex((step) => step.id === canonicalStepId)
}
