import type {
  Account,
  AccountBalanceSnapshot,
  AccountMedium,
  Branch,
  Customer,
  Product,
  TransformationDataset,
  TransformationTaskContract,
} from '../features/sql-transformation/types'

export const DEPOSIT_BALANCE_TARGET_DATE = '2026-09-30'

export const DEPOSIT_BALANCE_SCOPE = {
  branchName: '杭州分行',
  customerScope: '小微',
  productType: '定期',
  currency: 'CNY',
} as const

const accounts: readonly Account[] = [
  { accountId: 'A001', customerId: 'C001', productId: 'P01', branchId: 'B01' },
  { accountId: 'A002', customerId: 'C002', productId: 'P01', branchId: 'B01' },
  { accountId: 'A003', customerId: 'C404', productId: 'P01', branchId: 'B01' },
  { accountId: 'A004', customerId: 'C003', productId: 'P404', branchId: 'B02' },
  { accountId: 'A005', customerId: 'C001', productId: 'P01', branchId: 'B01' },
]

const customers: readonly Customer[] = [
  { customerId: 'C001', customerName: '杭州科创企业', customerScope: '小微' },
  { customerId: 'C002', customerName: '钱塘制造企业', customerScope: '小微' },
  { customerId: 'C003', customerName: '林夏', customerScope: '个人' },
]

const products: readonly Product[] = [
  { productId: 'P01', productName: '定期存款', productType: '定期' },
  { productId: 'P02', productName: '活期存款', productType: '活期' },
]

const branches: readonly Branch[] = [
  { branchId: 'B01', branchName: '杭州分行' },
  { branchId: 'B02', branchName: '上海分行' },
]

const accountMedia: readonly AccountMedium[] = [
  { mediumId: 'M001', accountId: 'A001', mediumType: 'CARD' },
  { mediumId: 'M002', accountId: 'A001', mediumType: 'CARD' },
  { mediumId: 'M003', accountId: 'A001', mediumType: 'PASSBOOK' },
  { mediumId: 'M004', accountId: 'A002', mediumType: 'CARD' },
  { mediumId: 'M005', accountId: 'A003', mediumType: 'CARD' },
]

/** 第 05 章使用的小样本：异常足够少，且每一条都能在表快照中被指出。 */
export const depositBalanceDataset: TransformationDataset = {
  targetDate: DEPOSIT_BALANCE_TARGET_DATE,
  accountBalanceSnapshots: [
    {
      snapshotDate: DEPOSIT_BALANCE_TARGET_DATE,
      accountId: 'A001',
      balance: 98000,
      currency: 'CNY',
      updatedAt: '2026-09-30 18:00:01',
      ingestedAt: '2026-09-30 18:01:00',
    },
    {
      snapshotDate: DEPOSIT_BALANCE_TARGET_DATE,
      accountId: 'A001',
      balance: 100000,
      currency: 'CNY',
      updatedAt: '2026-09-30 23:58:05',
      ingestedAt: '2026-09-30 23:59:00',
    },
    {
      snapshotDate: DEPOSIT_BALANCE_TARGET_DATE,
      accountId: 'A002',
      balance: 200000,
      currency: 'RMB',
      updatedAt: '2026-09-30 23:57:10',
      ingestedAt: '2026-09-30 23:58:00',
    },
    {
      snapshotDate: DEPOSIT_BALANCE_TARGET_DATE,
      accountId: 'A003',
      balance: 80000,
      currency: 'CNY',
      updatedAt: '2026-09-30 23:56:20',
      ingestedAt: '2026-09-30 23:57:00',
    },
    {
      snapshotDate: DEPOSIT_BALANCE_TARGET_DATE,
      accountId: 'A004',
      balance: 50000,
      currency: 'CNY',
      updatedAt: '2026-09-30 23:55:30',
      ingestedAt: '2026-09-30 23:56:00',
    },
  ],
  accounts,
  customers,
  products,
  branches,
  accountMedia,
}

/** 只供第 06 章调度实验注入；第 05 章不展示到达时刻或重跑过程。 */
export const depositLateBalanceSnapshot: AccountBalanceSnapshot = {
  snapshotDate: DEPOSIT_BALANCE_TARGET_DATE,
  accountId: 'A005',
  balance: 40000,
  currency: 'CNY',
  updatedAt: '2026-10-01 06:19:30',
  ingestedAt: '2026-10-01 06:20:00',
}

export const depositBalanceTaskContract: TransformationTaskContract = {
  taskId: 'transform.deposit-balance.daily.v1',
  inputTables: [
    'ods_account_balance_snapshot',
    'dim_account',
    'dim_customer',
    'dim_product',
    'dim_branch',
  ],
  outputTable: 'ads_deposit_balance_daily',
  outputGrain: 'snapshot_date × branch × customer_scope × product_type × currency',
  businessDate: DEPOSIT_BALANCE_TARGET_DATE,
  partition: {
    column: 'snapshot_date',
    value: DEPOSIT_BALANCE_TARGET_DATE,
  },
  dependencies: [
    'ods_account_balance_snapshot',
    'dim_account',
    'dim_customer',
    'dim_product',
    'dim_branch',
  ],
  repeatExecution: '同样的输入和业务日期再次执行，目标分区结果应保持一致，不重复累加余额。',
  // 这些字段由第 06 章的调度实验消费，05 的展示只保留上面的加工边界。
  isIdempotent: true,
  supportsPartialRerun: true,
  rerunHint: `按业务日期重算 ${DEPOSIT_BALANCE_TARGET_DATE} 分区。`,
}

export { accounts as depositAccounts }
export { customers as depositCustomers }
export { products as depositProducts }
export { branches as depositBranches }
export { accountMedia as depositAccountMedia }
