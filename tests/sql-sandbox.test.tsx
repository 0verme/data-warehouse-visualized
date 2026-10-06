import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LessonSectionRenderer } from '../src/components/lesson/LessonSectionRenderer'
import { lessonContentBySlug } from '../src/content/lessons'
import { depositBalanceDataset } from '../src/data/deposit-balance'
import { getLessonBySlug, lessons } from '../src/data/course'
import { compareSummaryToReference } from '../src/features/sql-sandbox-experiment/comparison'
import {
  SqlSandboxTimeoutError,
  getGuardFailure,
  mapSqlFailure,
} from '../src/features/sql-sandbox-experiment/errors'
import { guardSql } from '../src/features/sql-sandbox-experiment/guard'
import { getSqlSandboxReference } from '../src/features/sql-sandbox-experiment/reference'
import { arrowTableToResult, summarizeResult } from '../src/features/sql-sandbox-experiment/result'
import { buildSeedScript } from '../src/features/sql-sandbox-experiment/seed'
import {
  applySandboxFailure,
  applySandboxSuccess,
  clearSandboxRun,
  createLessonSandboxState,
  resetSandboxEnvironment,
  withTimeout,
} from '../src/features/sql-sandbox-experiment/use-lesson-sql-sandbox'
import {
  buildDepositBalanceRows,
  getLayerSnapshots,
  getTransformationStep,
} from '../src/utils/sql-transformation'

const sandboxDir = join(import.meta.dirname, '../src/features/sql-sandbox-experiment')
const visualizationDir = join(import.meta.dirname, '../src/components/visualizations')

const DWS_GROUP_COLUMNS = [
  'snapshot_date',
  'branch_name',
  'customer_scope',
  'product_type',
  'currency',
] as const

function createArrowTable(rows: Array<Record<string, unknown>>, columns: string[]) {
  return {
    schema: { fields: columns.map((name) => ({ name })) },
    toArray: () => rows.map((row) => ({ toJSON: () => row })),
  }
}

describe('SQL Sandbox · 依赖隔离（#35 Stage 1）', () => {
  it('只有 runtime.ts 静态 import @duckdb/duckdb-wasm', () => {
    const runtimeSource = readFileSync(join(sandboxDir, 'runtime.ts'), 'utf8')
    expect(runtimeSource).toContain("from '@duckdb/duckdb-wasm'")

    const sources = [
      join(sandboxDir, 'use-lesson-sql-sandbox.ts'),
      join(sandboxDir, 'guard.ts'),
      join(sandboxDir, 'seed.ts'),
      join(sandboxDir, 'result.ts'),
      join(sandboxDir, 'errors.ts'),
      join(sandboxDir, 'comparison.ts'),
      join(visualizationDir, 'SqlSandboxLab.tsx'),
      join(import.meta.dirname, '../src/components/lesson/LessonSectionRenderer.tsx'),
      join(import.meta.dirname, '../src/components/course/LearnShell.tsx'),
    ]

    for (const file of sources) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(
        /(?:from\s*|import\s*\(\s*)['"]@duckdb\/duckdb-wasm['"]/,
      )
    }
  })

  it('lesson 状态机只在运行时动态 import runtime，不做静态引用', () => {
    const source = readFileSync(join(sandboxDir, 'use-lesson-sql-sandbox.ts'), 'utf8')

    expect(source).toMatch(/import\(['"]\.\/runtime['"]\)/)
    expect(source).not.toMatch(/from\s+['"]\.\/runtime['"]/)
  })
})

describe('SQL Sandbox · 默认 SQL 与确定性参考的语义 parity', () => {
  it('默认 SQL 直接复用 aggregate-layers canonical 步骤', () => {
    const reference = getSqlSandboxReference()
    const step = getTransformationStep('aggregate-layers')

    expect(step).toBeDefined()
    expect(reference.defaultSql).toBe(step?.sql)
    expect(reference.tableName).toBe('dwd_deposit_balance_detail')
  })

  it('canonical SQL 的分组字段与参考 DWS 快照语义一致（不是字符串猜测）', () => {
    const reference = getSqlSandboxReference()
    const dwsTable = getLayerSnapshots(depositBalanceDataset).find(
      (snapshot) => snapshot.layer === 'dws',
    )?.tables[0]

    expect(dwsTable).toBeDefined()
    expect(dwsTable!.columns).toEqual([...DWS_GROUP_COLUMNS, 'balance'])

    // 独立按 canonical SQL 的 GROUP BY 字段重算一遍，再与现有 DWS 快照逐行对照。
    const recomputed = new Map<string, number>()
    for (const row of buildDepositBalanceRows(depositBalanceDataset)) {
      const key = DWS_GROUP_COLUMNS.map((column) => String(row[column])).join('|')
      recomputed.set(key, (recomputed.get(key) ?? 0) + Number(row.balance ?? 0))
    }

    expect(dwsTable!.rows).toHaveLength(recomputed.size)
    for (const row of dwsTable!.rows) {
      const key = DWS_GROUP_COLUMNS.map((column) => String(row[column])).join('|')
      expect(recomputed.get(key), key).toBe(row.balance)
    }

    expect(dwsTable!.rows).toHaveLength(3)
    expect([...recomputed.values()].reduce((total, value) => total + value, 0)).toBe(430000)
    expect(reference.dws).toEqual({ rowCount: 3, totalBalance: 430000 })
    expect(reference.ads).toEqual({ rowCount: 1, totalBalance: 300000 })
    expect(reference.targetScope).toEqual({
      branchName: '杭州分行',
      customerScope: '小微',
      productType: '定期',
      currency: 'CNY',
    })
  })

  it('seed 与参考使用同一张表 / 同一份数据集', () => {
    const reference = getSqlSandboxReference()
    const seed = buildSeedScript()

    expect(seed.tableName).toBe(reference.tableName)
    expect(seed.rowCount).toBe(buildDepositBalanceRows(depositBalanceDataset).length)
    expect(seed.rowCount).toBe(4)
  })
})

describe('SQL Sandbox · 结果汇总与参考对照', () => {
  const reference = {
    dwsRowCount: 3,
    dwsTotalBalance: 430000,
    adsRowCount: 1,
    adsTotalBalance: 300000,
  }

  it('真实行数 / 合计 / 目标口径全部来自结果本身', () => {
    const result = arrowTableToResult(
      createArrowTable(
        [
          {
            snapshot_date: '2026-09-30',
            branch_name: '杭州分行',
            customer_scope: '小微',
            product_type: '定期',
            currency: 'CNY',
            balance: 300000,
          },
          {
            snapshot_date: '2026-09-30',
            branch_name: '杭州分行',
            customer_scope: null,
            product_type: '定期',
            currency: 'CNY',
            balance: 80000,
          },
          {
            snapshot_date: '2026-09-30',
            branch_name: '上海分行',
            customer_scope: '个人',
            product_type: null,
            currency: 'CNY',
            balance: 50000,
          },
        ],
        [...DWS_GROUP_COLUMNS, 'balance'],
      ),
    )
    const summary = summarizeResult(result, getSqlSandboxReference().targetScope)

    expect(summary).toEqual({
      rowCount: 3,
      balanceColumn: 'balance',
      totalBalance: 430000,
      targetScopeRowCount: 1,
      targetScopeBalance: 300000,
    })
    expect(compareSummaryToReference(summary, reference).kind).toBe('exact')
  })

  it('合计一致但行粒度不同会给出不同判定', () => {
    const summary = {
      rowCount: 2,
      balanceColumn: 'balance',
      totalBalance: 430000,
      targetScopeRowCount: 2,
      targetScopeBalance: 380000,
    }

    const comparison = compareSummaryToReference(summary, reference)
    expect(comparison.kind).toBe('same-total-different-grain')
    expect(comparison.detail).toContain('GROUP BY')
  })

  it('没有 balance 列时不做金额对照', () => {
    const summary = {
      rowCount: 4,
      balanceColumn: null,
      totalBalance: null,
      targetScopeRowCount: 0,
      targetScopeBalance: null,
    }

    expect(compareSummaryToReference(summary, reference).kind).toBe('no-balance-column')
  })

  it('目标口径收敛为 ADS 参考', () => {
    const summary = {
      rowCount: 1,
      balanceColumn: 'balance',
      totalBalance: 300000,
      targetScopeRowCount: 1,
      targetScopeBalance: 300000,
    }

    const comparison = compareSummaryToReference(summary, reference)
    expect(comparison.kind).toBe('ads-target')
    expect(comparison.headline).toContain('ADS')
  })

  it('金额不一致时明确报告差异', () => {
    const summary = {
      rowCount: 2,
      balanceColumn: 'balance',
      totalBalance: 120000,
      targetScopeRowCount: 0,
      targetScopeBalance: null,
    }

    const comparison = compareSummaryToReference(summary, reference)
    expect(comparison.kind).toBe('different')
    expect(comparison.detail).toContain('430000')
  })

  it('尚未运行时给出未执行提示', () => {
    expect(compareSummaryToReference(null, reference).kind).toBe('unavailable')
  })
})

describe('SQL Sandbox · 错误映射 fixture', () => {
  const fixtures: Array<[string, string, string]> = [
    ['parse', 'Parser Error: syntax error at or near ";"', 'SQL 语法不完整'],
    [
      'column',
      'Binder Error: Referenced column "balanc" not found in FROM clause! Candidate bindings: "account_id", "customer_id"',
      '字段不存在',
    ],
    [
      'group-by',
      'Binder Error: column "balance" must appear in the GROUP BY clause or must be part of an aggregate function.',
      '聚合字段与 GROUP BY 不一致',
    ],
    [
      'table',
      'Catalog Error: Table with name dwd_deposit_balance_detial does not exist!\nDid you mean "dwd_deposit_balance_detail"?',
      '表不存在',
    ],
    [
      'permission',
      'Permission Error: Cannot access file "https://example.com/stage0.csv" - file system operations are disabled by configuration',
      '外部数据访问被禁用',
    ],
  ]

  for (const [kind, raw, title] of fixtures) {
    it(`${kind} 映射为教学文案并保留原文`, () => {
      const failure = mapSqlFailure(new Error(raw))

      expect(failure.kind).toBe(kind)
      expect(failure.title).toBe(title)
      expect(failure.raw).toBe(raw)
      expect(failure.hint.length).toBeGreaterThan(0)
    })
  }

  it('字段错误提示列出可用字段', () => {
    const failure = mapSqlFailure(new Error('Binder Error: Referenced column "nope" not found'))
    expect(failure.hint).toContain('account_id')
    expect(failure.hint).toContain('balance')
  })

  it('超时错误是独立语义', () => {
    const failure = mapSqlFailure(new SqlSandboxTimeoutError())
    expect(failure.kind).toBe('timeout')
    expect(failure.title).toContain('超时')
  })

  it('未知错误保留原文并可恢复', () => {
    const failure = mapSqlFailure(new Error('Invalid Input Error: boom'))
    expect(failure.kind).toBe('unknown')
    expect(failure.raw).toContain('boom')
  })

  it('守卫拦截有自己的教学文案', () => {
    const failure = getGuardFailure('实验只允许单条语句，请删除中间的分号')

    expect(failure.kind).toBe('guard')
    expect(failure.title).toBe('只读实验限制')
    expect(failure.raw).toBeNull()
    expect(guardSql('SELECT 1; SELECT 2').ok).toBe(false)
    expect(guardSql('INSERT INTO t VALUES (1)').ok).toBe(false)
  })
})

describe('SQL Sandbox · 超时与状态迁移', () => {
  it('withTimeout 在超时前正常返回', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('withTimeout 超时抛出 SqlSandboxTimeoutError', async () => {
    const pending = new Promise((resolve) => setTimeout(resolve, 5000))
    await expect(withTimeout(pending, 10)).rejects.toBeInstanceOf(SqlSandboxTimeoutError)
  })

  it('成功迁移写入真实结果并清除失败状态', () => {
    const initial = createLessonSandboxState()
    const withFailure = applySandboxFailure(initial, getGuardFailure('x'))
    const result = { columns: ['balance'], rows: [{ balance: 1 }], rowCount: 1, truncated: false }
    const summary = {
      rowCount: 1,
      balanceColumn: 'balance',
      totalBalance: 1,
      targetScopeRowCount: 0,
      targetScopeBalance: null,
    }
    const next = applySandboxSuccess(withFailure, result, summary, 12)

    expect(next.status).toBe('ready')
    expect(next.result).toBe(result)
    expect(next.summary).toBe(summary)
    expect(next.failure).toBeNull()
    expect(next.hasRun).toBe(true)
    expect(next.runMs).toBe(12)
  })

  it('失败不会丢掉已有结果，unsupported 状态不会被覆盖', () => {
    const result = { columns: ['balance'], rows: [{ balance: 1 }], rowCount: 1, truncated: false }
    const summary = {
      rowCount: 1,
      balanceColumn: 'balance',
      totalBalance: 1,
      targetScopeRowCount: 0,
      targetScopeBalance: null,
    }
    const previous = applySandboxSuccess(createLessonSandboxState(), result, summary, 5)
    const failed = applySandboxFailure(previous, mapSqlFailure(new Error('boom')))

    expect(failed.result).toBe(result)
    expect(failed.failure).not.toBeNull()

    const unsupported = applySandboxFailure(
      { ...createLessonSandboxState(), status: 'unsupported' },
      mapSqlFailure(new Error('no wasm')),
    )
    expect(unsupported.status).toBe('unsupported')
  })

  it('重置 SQL 清空运行结果但保留实验环境', () => {
    const engine = { engineVersion: 'v1.4.3', selectedBundle: 'eh', strategy: 'cdn' as const }
    const result = { columns: ['balance'], rows: [{ balance: 1 }], rowCount: 1, truncated: false }
    const summary = {
      rowCount: 1,
      balanceColumn: 'balance',
      totalBalance: 1,
      targetScopeRowCount: 0,
      targetScopeBalance: null,
    }
    const runState = applySandboxSuccess(
      { ...createLessonSandboxState(), engine },
      result,
      summary,
      9,
    )
    const cleared = clearSandboxRun(runState)

    expect(cleared.engine).toBe(engine)
    expect(cleared.status).toBe('ready')
    expect(cleared.result).toBeNull()
    expect(cleared.summary).toBeNull()
    expect(cleared.hasRun).toBe(false)
    expect(cleared.runMs).toBeNull()
  })

  it('重置实验环境回到完全初始状态', () => {
    const engine = { engineVersion: 'v1.4.3', selectedBundle: 'eh', strategy: 'cdn' as const }
    const dirty = { ...createLessonSandboxState(), engine, status: 'ready' as const, hasRun: true }

    expect(clearSandboxRun(dirty).engine).toBe(engine)
    expect(resetSandboxEnvironment()).toEqual(createLessonSandboxState())
  })
})

describe('SQL Sandbox · lesson contract', () => {
  it('只有 sql-transformation-layers 挂载 sandbox section，且位于最后', () => {
    const withSandbox = lessons.filter((lesson) =>
      lessonContentBySlug[lesson.slug].sections.some((section) => section.kind === 'sql-sandbox'),
    )

    expect(withSandbox.map((lesson) => lesson.slug)).toEqual(['sql-transformation-layers'])

    const sections = lessonContentBySlug['sql-transformation-layers'].sections
    expect(sections[sections.length - 1]?.kind).toBe('sql-sandbox')
    expect(sections.filter((section) => section.kind === 'sql-sandbox')).toHaveLength(1)
  })

  it('SSR 折叠态只渲染入口，不渲染 sandbox lab', () => {
    const lesson = getLessonBySlug('sql-transformation-layers')
    expect(lesson).toBeDefined()

    const content = lessonContentBySlug['sql-transformation-layers']
    const markup = renderToStaticMarkup(
      <LessonSectionRenderer lesson={lesson!} sections={content.sections} />,
    )

    expect(markup).toContain('data-sandbox-state="collapsed"')
    expect(markup).toContain('data-testid="sql-sandbox-open"')
    expect(markup).toContain('打开进阶实验')
    expect(markup).toContain('亲手写一遍这条聚合 SQL')
    expect(markup).toContain('lesson-05-layers-section-4-sql-sandbox-title')
    expect(markup).not.toContain('sql-sandbox-lab')
    expect(markup).not.toContain('data-testid="sql-sandbox-editor"')
  })
})
