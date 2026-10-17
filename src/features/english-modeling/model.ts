/**
 * English teaching model for the fact vs dimension page.
 *
 * The model is a small star schema with deterministic rows and four worked
 * queries. It reuses `sumNumericColumn` from the shared star-schema utility
 * for aggregation so the page, the lab and the tests agree on every total.
 */
import { sumNumericColumn } from '../../utils/star-schema'

export interface FactRow {
  account_sk: string
  branch_sk: string
  product_sk: string
  balance: number
  transaction_count: number
}

export interface BranchRow {
  branch_sk: string
  branch_id: string
  branch_name: string
  region: string
}

export interface AccountRow {
  account_sk: string
  account_id: string
  customer_name: string
  status: string
}

export const FACT_TABLE = 'fact_deposit_balance_daily'

export const FACT_ROWS: readonly FactRow[] = [
  {
    account_sk: 'A-1001',
    branch_sk: 'B1',
    product_sk: 'P1',
    balance: 500_000,
    transaction_count: 3,
  },
  {
    account_sk: 'A-1002',
    branch_sk: 'B1',
    product_sk: 'P2',
    balance: 250_000,
    transaction_count: 1,
  },
  {
    account_sk: 'A-1003',
    branch_sk: 'B2',
    product_sk: 'P1',
    balance: 300_000,
    transaction_count: 2,
  },
  {
    account_sk: 'A-1004',
    branch_sk: 'B2',
    product_sk: 'P2',
    balance: 200_000,
    transaction_count: 0,
  },
]

export const DIM_BRANCH_ROWS: readonly BranchRow[] = [
  { branch_sk: 'B1', branch_id: 'HZ-01', branch_name: 'Hangzhou', region: 'East' },
  { branch_sk: 'B2', branch_id: 'SH-02', branch_name: 'Shanghai', region: 'East' },
]

/** A duplicated dimension key, for example after a bad load of the branch list. */
export const DIM_BRANCH_ROWS_WITH_DUPLICATE: readonly BranchRow[] = [
  ...DIM_BRANCH_ROWS,
  { branch_sk: 'B1', branch_id: 'HZ-01-OLD', branch_name: 'Hangzhou (old)', region: 'East' },
]

export const DIM_ACCOUNT_ROWS: readonly AccountRow[] = [
  { account_sk: 'A-1001', account_id: 'ACC-1001', customer_name: 'Chen Wei', status: 'active' },
  { account_sk: 'A-1002', account_id: 'ACC-1002', customer_name: 'Li Na', status: 'active' },
  { account_sk: 'A-1003', account_id: 'ACC-1003', customer_name: 'Wang Hao', status: 'active' },
  { account_sk: 'A-1004', account_id: 'ACC-1004', customer_name: 'Zhao Min', status: 'closed' },
]

export interface RoleDefinition {
  id: 'fact' | 'dimension'
  label: string
  stores: string
  key: string
  examples: string
  width: string
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    id: 'fact',
    label: 'Fact table',
    stores: 'What happened or what the state was: numeric measures plus foreign keys',
    key: 'One row per event or state change at a declared grain',
    examples: 'balance, transaction_count, amount, quantity',
    width: 'Narrow columns, usually the longest table',
  },
  {
    id: 'dimension',
    label: 'Dimension table',
    stores: 'Who, what, where, when: descriptive attributes used for filtering and grouping',
    key: 'One row per entity version, joined on a surrogate key',
    examples: 'branch_name, region, customer_name, product category',
    width: 'Wide, fewer rows than the fact table',
  },
]

export type FactDimensionScenarioId =
  'correct-measure' | 'measure-in-dimension' | 'duplicate-dimension-key' | 'dimension-filter'

export interface FactDimensionScenario {
  id: FactDimensionScenarioId
  label: string
  question: string
  measureSource: string
  contextSource: string
  joinKey: string
  sql: string
  rule: string
  tone: 'right' | 'wrong'
}

export const FACT_DIMENSION_SCENARIOS: readonly FactDimensionScenario[] = [
  {
    id: 'correct-measure',
    label: 'Correct: measure from the fact table',
    question: 'What is the total balance by branch on 2026-09-30?',
    measureSource: `${FACT_TABLE}.balance`,
    contextSource: 'dim_branch.branch_name',
    joinKey: 'fact_deposit_balance_daily.branch_sk = dim_branch.branch_sk',
    sql: `SELECT d.branch_name, SUM(f.balance) AS total_balance
FROM fact_deposit_balance_daily AS f
JOIN dim_branch AS d ON d.branch_sk = f.branch_sk
GROUP BY d.branch_name`,
    rule: 'The measure lives in the fact table; the grouping attribute lives in the dimension.',
    tone: 'right',
  },
  {
    id: 'measure-in-dimension',
    label: 'Wrong: measure from a dimension',
    question: 'What is the total balance by branch? (reading balance from dim_account)',
    measureSource: 'dim_account.balance (does not exist)',
    contextSource: 'dim_branch.branch_name',
    joinKey: '—',
    sql: `-- dim_account has no balance column
SELECT account_sk, customer_name, status
FROM dim_account`,
    rule: 'A dimension describes an entity; it does not accumulate the facts of what happened to it.',
    tone: 'wrong',
  },
  {
    id: 'duplicate-dimension-key',
    label: 'Wrong: duplicated dimension key inflates the measure',
    question: 'What is the total balance by branch when dim_branch contains two rows for B1?',
    measureSource: `${FACT_TABLE}.balance`,
    contextSource: 'dim_branch.branch_name (2 rows for branch_sk = B1)',
    joinKey: 'fact_deposit_balance_daily.branch_sk = dim_branch.branch_sk',
    sql: `-- same query as the correct case, but the dimension key is not unique
SELECT d.branch_name, SUM(f.balance) AS total_balance
FROM fact_deposit_balance_daily AS f
JOIN dim_branch AS d ON d.branch_sk = f.branch_sk
GROUP BY d.branch_name`,
    rule: 'A fact row is repeated once per matching dimension row. Unique surrogate keys are what keep the grain unchanged after a join.',
    tone: 'wrong',
  },
  {
    id: 'dimension-filter',
    label: 'Correct: filter on a dimension attribute',
    question: 'What is the total balance for branches in the East region?',
    measureSource: `${FACT_TABLE}.balance`,
    contextSource: "dim_branch.region = 'East'",
    joinKey: 'fact_deposit_balance_daily.branch_sk = dim_branch.branch_sk',
    sql: `SELECT SUM(f.balance) AS total_balance
FROM fact_deposit_balance_daily AS f
JOIN dim_branch AS d ON d.branch_sk = f.branch_sk
WHERE d.region = 'East'`,
    rule: 'Text attributes such as region belong to the dimension; the fact table stores only the key.',
    tone: 'right',
  },
]

export interface BranchAggregateRow {
  branch_name: string
  total_balance: number
}

export function aggregateBalanceByBranch(
  branchRows: readonly BranchRow[],
  factRows: readonly FactRow[] = FACT_ROWS,
): { rows: readonly BranchAggregateRow[]; total: number } {
  const joined = factRows.flatMap((fact) =>
    branchRows
      .filter((branch) => branch.branch_sk === fact.branch_sk)
      .map((branch) => ({ branch_name: branch.branch_name, balance: fact.balance })),
  )
  const grouped = new Map<string, number>()
  for (const row of joined) {
    grouped.set(row.branch_name, (grouped.get(row.branch_name) ?? 0) + row.balance)
  }
  const rows = [...grouped.entries()].map(([branch_name, total_balance]) => ({
    branch_name,
    total_balance,
  }))
  return { rows, total: sumNumericColumn(joined, 'balance') }
}

export interface FactDimensionReference {
  correctTotal: number
  correctRows: readonly BranchAggregateRow[]
  duplicateTotal: number
  duplicateRows: readonly BranchAggregateRow[]
  inflatedBy: number
  eastTotal: number
  accountColumnsWithoutMeasure: readonly string[]
}

export function buildFactDimensionReference(): FactDimensionReference {
  const correct = aggregateBalanceByBranch(DIM_BRANCH_ROWS)
  const duplicate = aggregateBalanceByBranch(DIM_BRANCH_ROWS_WITH_DUPLICATE)
  const east = aggregateBalanceByBranch(
    DIM_BRANCH_ROWS.filter((branch) => branch.region === 'East'),
  )
  return {
    correctTotal: correct.total,
    correctRows: correct.rows,
    duplicateTotal: duplicate.total,
    duplicateRows: duplicate.rows,
    inflatedBy: duplicate.total - correct.total,
    eastTotal: east.total,
    accountColumnsWithoutMeasure: Object.keys(DIM_ACCOUNT_ROWS[0] ?? {}).filter(
      (column) => column !== 'balance',
    ),
  }
}

export function scenarioById(id: FactDimensionScenarioId): FactDimensionScenario {
  const scenario = FACT_DIMENSION_SCENARIOS.find((candidate) => candidate.id === id)
  if (!scenario) throw new Error(`Unknown fact/dimension scenario: ${id}`)
  return scenario
}
