/**
 * SqlSandboxLab（Issue #35 Stage 1）— 第 04 章 `sql-transformation-layers`
 * 末尾的 optional advanced lab。
 *
 * 该组件只在学习者展开实验后由 `LessonSectionRenderer` 动态加载；
 * 组件自身不静态依赖 DuckDB，真实执行发生在用户点击「运行」后由
 * `useLessonSqlSandbox` 动态 import 的运行时中。
 */
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import { compareSummaryToReference } from '../../features/sql-sandbox-experiment/comparison'
import { getSqlSandboxReference } from '../../features/sql-sandbox-experiment/reference'
import {
  SQL_SANDBOX_SEED_COLUMNS,
  SQL_SANDBOX_TABLE,
  buildSeedScript,
} from '../../features/sql-sandbox-experiment/seed'
import { useLessonSqlSandbox } from '../../features/sql-sandbox-experiment/use-lesson-sql-sandbox'

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  return String(value)
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : String(value)
}

function getStatusText(
  status: string,
  failure: boolean,
  hasRun: boolean,
  runMs: number | null,
): string {
  if (status === 'unsupported') {
    return '当前环境不支持'
  }
  if (status === 'loading') {
    return '正在加载本地 SQL 引擎…'
  }
  if (status === 'running') {
    return '正在运行…'
  }
  if (failure) {
    return '运行失败，修改 SQL 后可以重试'
  }
  if (hasRun) {
    return `运行完成（${runMs ?? 0} ms）`
  }
  return status === 'ready' ? '实验环境已就绪，等待运行' : '未运行'
}

export function SqlSandboxLab() {
  const reference = useMemo(() => getSqlSandboxReference(), [])
  const seed = useMemo(() => buildSeedScript(), [])
  const {
    status,
    engine,
    result,
    summary,
    failure,
    hasRun,
    runMs,
    runSequence,
    run,
    clearRun,
    resetEnvironment,
  } = useLessonSqlSandbox()
  const [sql, setSql] = useState(() => reference.defaultSql)

  const comparison = useMemo(
    () =>
      compareSummaryToReference(summary, {
        dwsRowCount: reference.dws.rowCount,
        dwsTotalBalance: reference.dws.totalBalance,
        adsRowCount: reference.ads.rowCount,
        adsTotalBalance: reference.ads.totalBalance,
      }),
    [reference, summary],
  )

  const busy = status === 'loading' || status === 'running'

  const execute = useCallback(() => {
    void run(sql)
  }, [run, sql])

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      execute()
    }
  }

  const handleResetSql = () => {
    setSql(reference.defaultSql)
    clearRun()
  }

  const handleResetEnvironment = () => {
    setSql(reference.defaultSql)
    void resetEnvironment()
  }

  return (
    <div className="sql-sandbox-lab" data-testid="sql-sandbox-lab" data-status={status}>
      <div className="sql-sandbox-lab__intro">
        <p>
          <strong>当前实验表：{SQL_SANDBOX_TABLE}</strong>（{seed.rowCount} 行，一行 = 一个账户 ×
          一个快照日）
        </p>
        <p className="sql-sandbox-lab__columns">可用字段：{SQL_SANDBOX_SEED_COLUMNS.join('、')}</p>
        <p className="sql-sandbox-lab__cost-note">
          首次运行需要下载约 7 MB 的本地 SQL 引擎（DuckDB-WASM），之后走浏览器缓存； SQL
          与结果都只在你的浏览器中计算，不会上传。
        </p>
      </div>

      <label className="sql-sandbox-lab__editor">
        <span>SQL 编辑器（只读查询，Ctrl / Cmd + Enter 运行）</span>
        <textarea
          data-testid="sql-sandbox-editor"
          value={sql}
          rows={9}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => setSql(event.target.value)}
          onKeyDown={handleEditorKeyDown}
        />
      </label>

      <div className="sql-sandbox-lab__controls">
        <button
          type="button"
          className="button button--primary button--small"
          data-testid="sql-sandbox-run"
          onClick={execute}
          disabled={busy}
        >
          运行
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          data-testid="sql-sandbox-reset-sql"
          onClick={handleResetSql}
        >
          重置 SQL
        </button>
        <button
          type="button"
          className="button button--ghost button--small"
          data-testid="sql-sandbox-reset-env"
          onClick={handleResetEnvironment}
          disabled={busy}
        >
          重置实验环境
        </button>
      </div>

      <p
        className="sql-sandbox-lab__status"
        data-testid="sql-sandbox-status"
        data-status={status}
        data-run-seq={runSequence}
        role="status"
        aria-live="polite"
      >
        状态：{getStatusText(status, failure !== null, hasRun, runMs)}
      </p>

      {engine ? (
        <p className="sql-sandbox-lab__engine" data-testid="sql-sandbox-engine">
          真实引擎：DuckDB {engine.engineVersion} · bundle {engine.selectedBundle} · 浏览器本地执行
        </p>
      ) : null}

      {failure ? (
        <div className="sql-sandbox-lab__failure" data-testid="sql-sandbox-error" role="alert">
          <strong>{failure.title}</strong>
          <p>{failure.hint}</p>
          {failure.raw ? (
            <details data-testid="sql-sandbox-error-raw">
              <summary>原始 DuckDB 错误</summary>
              <pre>{failure.raw}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="sql-sandbox-lab__results">
        {result ? (
          result.rowCount === 0 ? (
            <p className="sql-sandbox-lab__empty" data-testid="sql-sandbox-empty">
              条件过滤掉了所有行：这是一次成功的查询，只是当前 WHERE 没有命中数据。
            </p>
          ) : (
            <div className="sql-sandbox-lab__table-wrap">
              <table data-testid="sql-sandbox-result">
                <thead>
                  <tr>
                    {result.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} data-testid="sql-sandbox-result-row">
                      {result.columns.map((column) => (
                        <td key={column}>{formatCell(row[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.truncated ? (
                <p className="sql-sandbox-lab__truncated">
                  结果超过显示上限，仅显示前 200 行（真实行数见下方指标）。
                </p>
              ) : null}
            </div>
          )
        ) : (
          <p className="sql-sandbox-lab__placeholder" data-testid="sql-sandbox-placeholder">
            运行后，这里显示来自真实 DuckDB 的结果表。
          </p>
        )}
      </div>

      <div
        className="sql-sandbox-lab__comparison"
        data-testid="sql-sandbox-comparison"
        data-comparison-kind={comparison.kind}
      >
        <div className="sql-sandbox-lab__reference" data-testid="sql-sandbox-reference">
          <strong>参考快照（主课程确定性结果）</strong>
          <span>
            DWS {reference.dws.rowCount} 行 · 合计 {reference.dws.totalBalance}
          </span>
          <span>
            目标口径（{reference.targetScope.branchName} · {reference.targetScope.customerScope} ·{' '}
            {reference.targetScope.productType} · {reference.targetScope.currency}）{' '}
            {reference.ads.rowCount} 行 · {reference.ads.totalBalance}
          </span>
        </div>
        {summary ? (
          <div className="sql-sandbox-lab__summary">
            <span>
              真实行数：<strong data-testid="sql-sandbox-row-count">{summary.rowCount}</strong>
            </span>
            <span>
              真实合计：
              <strong data-testid="sql-sandbox-total-balance">
                {formatNumber(summary.totalBalance)}
              </strong>
            </span>
            <span>
              目标口径行数：
              <strong data-testid="sql-sandbox-target-count">{summary.targetScopeRowCount}</strong>
            </span>
            <span>
              目标口径余额：
              <strong data-testid="sql-sandbox-target-balance">
                {formatNumber(summary.targetScopeBalance)}
              </strong>
            </span>
          </div>
        ) : null}
        <p className="sql-sandbox-lab__verdict">
          <strong>{comparison.headline}</strong>
          <span>{comparison.detail}</span>
        </p>
      </div>

      <p className="sql-sandbox-lab__try">
        试试这些改动：加一行 <code>WHERE customer_scope = &apos;小微&apos;</code>；把{' '}
        <code>GROUP BY</code> 改成只按 <code>branch_name</code>；去掉 <code>GROUP BY</code> 改选{' '}
        <code>account_id, balance</code> 回到明细。
      </p>
    </div>
  )
}
