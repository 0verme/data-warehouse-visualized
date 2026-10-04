import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { depositBalanceDataset } from '../src/data/deposit-balance'
import { SqlSandboxStage0Harness } from '../src/features/sql-sandbox-experiment/harness/SqlSandboxStage0Harness'
import { guardSql, maskSqlLiteralsAndComments } from '../src/features/sql-sandbox-experiment/guard'
import { getStage0Reference } from '../src/features/sql-sandbox-experiment/reference'
import { arrowTableToResult, summarizeResult } from '../src/features/sql-sandbox-experiment/result'
import {
  buildSeedScript,
  SQL_SANDBOX_SEED_COLUMNS,
} from '../src/features/sql-sandbox-experiment/seed'
import { buildDepositBalanceRows, getTransformationStep } from '../src/utils/sql-transformation'

describe('Stage 0 SQL 守卫', () => {
  it('接受单条 SELECT / WITH 查询', () => {
    expect(guardSql('SELECT 1 AS value;')).toEqual({
      ok: true,
      normalizedSql: 'SELECT 1 AS value;',
    })
    expect(guardSql('WITH x AS (SELECT 1 AS value) SELECT * FROM x').ok).toBe(true)
  })

  it('拒绝空 SQL 与超长 SQL', () => {
    expect(guardSql('   ').ok).toBe(false)
    expect(guardSql(`SELECT '${'x'.repeat(4000)}'`).ok).toBe(false)
  })

  it('拒绝非 SELECT 开头与多语句', () => {
    expect(guardSql('SELEC 1;').ok).toBe(false)
    expect(guardSql('SELECT 1; SELECT 2').ok).toBe(false)
    expect(guardSql('INSERT INTO t VALUES (1);').ok).toBe(false)
  })

  it('拒绝 DDL / DML / 文件访问动词', () => {
    expect(guardSql('SELECT * FROM t; DROP TABLE t;').ok).toBe(false)
    expect(guardSql("SELECT * FROM read_csv_auto('x.csv') WHERE 1 = 1; ATTACH 'x.db';").ok).toBe(
      false,
    )
  })

  it('字符串与注释中的关键字 / 分号不参与判定', () => {
    expect(guardSql("SELECT ';' AS value;").ok).toBe(true)
    expect(guardSql("SELECT 'DROP TABLE' AS note;").ok).toBe(true)
    expect(guardSql('SELECT 1 -- DROP TABLE x\n').ok).toBe(true)
    expect(maskSqlLiteralsAndComments("SELECT 'a;b' AS x")).not.toContain('a;b')
  })
})

describe('Stage 0 Banking seed', () => {
  it('从现有 DWD 函数单向生成 CREATE + INSERT', () => {
    const seed = buildSeedScript()
    const dwdRows = buildDepositBalanceRows(depositBalanceDataset)

    expect(seed.tableName).toBe('dwd_deposit_balance_detail')
    expect(seed.columns).toEqual(SQL_SANDBOX_SEED_COLUMNS)
    expect(seed.rowCount).toBe(dwdRows.length)
    expect(seed.rowCount).toBe(4)
    expect(seed.statements).toHaveLength(2)
    expect(seed.statements[0]).toContain('CREATE TABLE dwd_deposit_balance_detail')
    expect(seed.statements[1]).toContain('INSERT INTO dwd_deposit_balance_detail')
    expect(seed.statements[1].match(/^ {2}\(/gmu)).toHaveLength(4)
  })

  it('seed 内容与 buildDepositBalanceRows 当前输出一致', () => {
    const seed = buildSeedScript()
    const dwdRows = buildDepositBalanceRows(depositBalanceDataset)
    const insert = seed.statements[1]

    for (const row of dwdRows) {
      const rendered = SQL_SANDBOX_SEED_COLUMNS.map((column) => {
        const value = row[column]
        if (value === null) return 'NULL'
        if (typeof value === 'number') return String(value)
        return `'${String(value).replaceAll("'", "''")}'`
      }).join(', ')
      expect(insert).toContain(`(${rendered})`)
    }
  })
})

describe('Stage 0 参考答案', () => {
  it('默认 SQL 复用 aggregate-layers 步骤', () => {
    const reference = getStage0Reference()
    const step = getTransformationStep('aggregate-layers')

    expect(step).toBeDefined()
    expect(reference.defaultSql).toBe(step?.sql)
  })

  it('DWS / ADS 参考与现有快照一致', () => {
    const reference = getStage0Reference()

    expect(reference.dws).toEqual({ rowCount: 3, totalBalance: 430000 })
    expect(reference.ads).toEqual({ rowCount: 1, totalBalance: 300000 })
    expect(reference.targetScope).toEqual({
      branchName: '杭州分行',
      customerScope: '小微',
      productType: '定期',
      currency: 'CNY',
    })
  })
})

describe('Stage 0 Arrow 结果转换', () => {
  function createTable(
    rows: Array<Record<string, unknown>>,
    columns: string[] = ['account_id', 'balance', 'count'],
  ) {
    return {
      schema: { fields: columns.map((name) => ({ name })) },
      toArray: () =>
        rows.map((row) => ({
          toJSON: () => row,
        })),
    }
  }

  it('转换列、行并处理 BigInt', () => {
    const result = arrowTableToResult(
      createTable([{ account_id: 'A001', balance: 100000, count: 2n }]),
    )

    expect(result.columns).toEqual(['account_id', 'balance', 'count'])
    expect(result.rowCount).toBe(1)
    expect(result.rows[0]).toEqual({ account_id: 'A001', balance: 100000, count: 2 })
    expect(result.truncated).toBe(false)
  })

  it('超过显示上限时截断并保留真实行数', () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({ account_id: `A${index}` }))
    const result = arrowTableToResult(createTable(rows), 200)

    expect(result.rowCount).toBe(205)
    expect(result.rows).toHaveLength(200)
    expect(result.truncated).toBe(true)
  })

  it('汇总行数 / 合计 / 目标口径命中', () => {
    const scope = getStage0Reference().targetScope
    const result = arrowTableToResult(
      createTable(
        [
          {
            account_id: 'A001',
            balance: 100000,
            branch_name: '杭州分行',
            customer_scope: '小微',
            product_type: '定期',
            currency: 'CNY',
          },
          {
            account_id: 'A003',
            balance: 80000,
            branch_name: '杭州分行',
            customer_scope: null,
            product_type: '定期',
            currency: 'CNY',
          },
        ],
        ['account_id', 'balance', 'branch_name', 'customer_scope', 'product_type', 'currency'],
      ),
    )

    const summary = summarizeResult(result, scope)
    expect(summary.rowCount).toBe(2)
    expect(summary.balanceColumn).toBe('balance')
    expect(summary.totalBalance).toBe(180000)
    expect(summary.targetScopeRowCount).toBe(1)
    expect(summary.targetScopeBalance).toBe(100000)
  })
})

describe('Stage 0 harness SSR', () => {
  it('渲染启动控件且不在模块顶层加载 DuckDB 运行时', () => {
    const markup = renderToStaticMarkup(<SqlSandboxStage0Harness />)

    expect(markup).toContain('data-testid="stage0-start"')
    expect(markup).toContain('data-testid="stage0-run-select1"')
    expect(markup).toContain('data-testid="stage0-status"')
    expect(markup).not.toContain('apache-arrow')
  })
})
