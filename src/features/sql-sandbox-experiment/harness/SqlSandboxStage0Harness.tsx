/**
 * Stage 0 隐藏 harness（`/dev/sql-sandbox-poc`）。
 *
 * 只用于技术验证：手动触发 DuckDB-WASM 加载、执行最小 SQL / Banking seed 查询、
 * 查看计时与网络证据、terminate / 重建、以及 ClientRouter 软跳转生命周期。
 */
import { useMemo, useState } from 'react'
import { getStage0Reference } from '../reference'
import { useSqlSandbox } from '../use-sql-sandbox'
import type { SqlSandboxStrategy } from '../types'
import './harness.css'

interface SqlSandboxStage0HarnessProps {
  strategy?: SqlSandboxStrategy
  assetBase?: string
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  return String(value)
}

function readRequestedStrategy(fallback: SqlSandboxStrategy): SqlSandboxStrategy {
  if (typeof window === 'undefined') {
    return fallback
  }

  const requested = new URLSearchParams(window.location.search).get('strategy')
  if (requested === 'selfhost' || requested === 'self-host') {
    return 'self-host'
  }
  if (requested === 'cdn') {
    return 'cdn'
  }
  return fallback
}

function readRequestedAssetBase(fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback
  }

  return new URLSearchParams(window.location.search).get('assetBase') ?? fallback
}

export function SqlSandboxStage0Harness({
  strategy = 'cdn',
  assetBase,
}: SqlSandboxStage0HarnessProps) {
  const reference = useMemo(() => getStage0Reference(), [])
  const {
    status,
    engine,
    metrics,
    resources,
    result,
    summary,
    error,
    runSequence,
    start,
    run,
    terminate,
  } = useSqlSandbox()
  const [sql, setSql] = useState(reference.defaultSql)
  // 静态页面无法在构建期读取 query；harness 使用 client:only 在浏览器里读 URL 参数。
  const [strategyChoice, setStrategyChoice] = useState<SqlSandboxStrategy>(() =>
    readRequestedStrategy(strategy),
  )
  const [assetBaseChoice, setAssetBaseChoice] = useState(() =>
    readRequestedAssetBase(assetBase ?? ''),
  )

  const selfHostUrls = useMemo(() => {
    const rawBase = assetBaseChoice || `${import.meta.env.BASE_URL}_astro/duckdb-stage0/`
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
    return {
      ehWasm: `${base}duckdb-eh.wasm`,
      ehWorker: `${base}duckdb-browser-eh.worker.js`,
    }
  }, [assetBaseChoice])

  /**
   * DuckDB 在 blob worker 里用 `new Request(url)` 加载 wasm，相对路径会解析失败；
   * 因此自托管 URL 必须在页面侧转成绝对 URL 再传入 runtime。
   */
  const toAbsoluteSelfHostUrls = () => ({
    ehWasm: new URL(selfHostUrls.ehWasm, window.location.href).href,
    ehWorker: new URL(selfHostUrls.ehWorker, window.location.href).href,
  })

  const cannedQueries = useMemo(
    () => ({
      select1: 'SELECT 1 AS value;',
      defaultAggregate: reference.defaultSql,
      whereTarget: `SELECT
  snapshot_date,
  branch_name,
  customer_scope,
  product_type,
  currency,
  SUM(balance) AS balance
FROM dwd_deposit_balance_detail
WHERE branch_name = '杭州分行'
  AND customer_scope = '小微'
  AND product_type = '定期'
  AND currency = 'CNY'
GROUP BY snapshot_date, branch_name, customer_scope, product_type, currency;`,
      groupByBranch: `SELECT
  branch_name,
  SUM(balance) AS balance
FROM dwd_deposit_balance_detail
GROUP BY branch_name
ORDER BY branch_name;`,
      detail: `SELECT account_id, balance
FROM dwd_deposit_balance_detail
ORDER BY account_id;`,
      badColumn: 'SELECT SUM(balanc) AS balance FROM dwd_deposit_balance_detail;',
      badSyntax: 'SELECT 1 +;',
      externalProbe: `SELECT * FROM read_csv_auto('https://example.com/stage0.csv');`,
    }),
    [reference],
  )

  const startSandbox = () => {
    void start(
      strategyChoice,
      strategyChoice === 'self-host' ? toAbsoluteSelfHostUrls() : undefined,
    )
  }

  const runCanned = (query: string) => {
    setSql(query)
    void run(query)
  }

  const snapshot = useMemo(
    () => ({ status, engine, metrics, resources, summary, error }),
    [status, engine, metrics, resources, summary, error],
  )

  return (
    <section className="stage0-harness" data-testid="stage0-harness">
      <div className="stage0-harness__controls">
        <label className="stage0-harness__field">
          托管策略
          <select
            data-testid="stage0-strategy"
            value={strategyChoice}
            onChange={(event) => setStrategyChoice(event.target.value as SqlSandboxStrategy)}
          >
            <option value="cdn">CDN（jsDelivr）</option>
            <option value="self-host">self-host（同源静态资产）</option>
          </select>
        </label>
        <button type="button" data-testid="stage0-start" onClick={startSandbox}>
          启动实验环境
        </button>
        <button
          type="button"
          data-testid="stage0-terminate"
          onClick={() => void terminate()}
          disabled={status === 'loading' || status === 'running'}
        >
          终止实验
        </button>
        <button
          type="button"
          data-testid="stage0-recreate"
          onClick={() => {
            void terminate().then(startSandbox)
          }}
        >
          终止并重建
        </button>
        {strategyChoice === 'self-host' ? (
          <label className="stage0-harness__field">
            自托管资产目录
            <input
              data-testid="stage0-asset-base"
              value={assetBaseChoice}
              onChange={(event) => setAssetBaseChoice(event.target.value)}
              placeholder={`${import.meta.env.BASE_URL}_astro/duckdb-stage0/`}
            />
          </label>
        ) : null}
      </div>

      <p
        className="stage0-harness__status"
        data-testid="stage0-status"
        data-status={status}
        data-run-seq={runSequence}
      >
        状态：{status}
      </p>

      {engine ? (
        <p className="stage0-harness__engine" data-testid="stage0-engine">
          DuckDB {engine.engineVersion} · @duckdb/duckdb-wasm {engine.packageVersion} · bundle{' '}
          {engine.selectedBundle} · strategy {engine.strategy}
        </p>
      ) : null}

      {error ? (
        <p className="stage0-harness__error" data-testid="stage0-error" role="alert">
          {error}
        </p>
      ) : null}

      <label className="stage0-harness__field stage0-harness__sql">
        SQL 编辑器
        <textarea
          data-testid="stage0-sql"
          value={sql}
          spellCheck={false}
          rows={10}
          onChange={(event) => setSql(event.target.value)}
        />
      </label>

      <div className="stage0-harness__queries">
        <button type="button" data-testid="stage0-run-sql" onClick={() => void run(sql)}>
          运行编辑器 SQL
        </button>
        <button
          type="button"
          data-testid="stage0-run-select1"
          onClick={() => runCanned(cannedQueries.select1)}
        >
          SELECT 1
        </button>
        <button
          type="button"
          data-testid="stage0-run-default"
          onClick={() => runCanned(cannedQueries.defaultAggregate)}
        >
          默认聚合
        </button>
        <button
          type="button"
          data-testid="stage0-run-where"
          onClick={() => runCanned(cannedQueries.whereTarget)}
        >
          WHERE 目标口径
        </button>
        <button
          type="button"
          data-testid="stage0-run-groupby"
          onClick={() => runCanned(cannedQueries.groupByBranch)}
        >
          GROUP BY 机构
        </button>
        <button
          type="button"
          data-testid="stage0-run-detail"
          onClick={() => runCanned(cannedQueries.detail)}
        >
          账户明细
        </button>
        <button
          type="button"
          data-testid="stage0-run-bad-column"
          onClick={() => runCanned(cannedQueries.badColumn)}
        >
          字段错误
        </button>
        <button
          type="button"
          data-testid="stage0-run-bad-syntax"
          onClick={() => runCanned(cannedQueries.badSyntax)}
        >
          语法错误
        </button>
        <button
          type="button"
          data-testid="stage0-run-external"
          onClick={() => runCanned(cannedQueries.externalProbe)}
        >
          越权探测
        </button>
      </div>

      <div className="stage0-harness__reference" data-testid="stage0-reference">
        参考：DWS {reference.dws.rowCount} 行 / 合计 {reference.dws.totalBalance}；ADS{' '}
        {reference.ads.rowCount} 行 / 目标 {reference.ads.totalBalance}；目标口径{' '}
        {reference.targetScope.branchName} · {reference.targetScope.customerScope} ·{' '}
        {reference.targetScope.productType} · {reference.targetScope.currency}
      </div>

      {summary ? (
        <dl className="stage0-harness__summary" data-testid="stage0-summary">
          <div>
            <dt>真实行数</dt>
            <dd data-testid="stage0-row-count">{summary.rowCount}</dd>
          </div>
          <div>
            <dt>真实合计</dt>
            <dd data-testid="stage0-total-balance">{summary.totalBalance ?? '—'}</dd>
          </div>
          <div>
            <dt>目标口径行数</dt>
            <dd data-testid="stage0-target-count">{summary.targetScopeRowCount}</dd>
          </div>
          <div>
            <dt>目标口径余额</dt>
            <dd data-testid="stage0-target-balance">{summary.targetScopeBalance ?? '—'}</dd>
          </div>
        </dl>
      ) : null}

      {result ? (
        <div className="stage0-harness__table-wrap">
          <table data-testid="stage0-result">
            <thead>
              <tr>
                {result.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIndex) => (
                <tr key={rowIndex} data-testid="stage0-result-row">
                  {result.columns.map((column) => (
                    <td key={column}>{formatCell(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.truncated ? <p>结果超过显示上限，仅显示前 200 行。</p> : null}
        </div>
      ) : null}

      <details className="stage0-harness__evidence" open>
        <summary>计时与网络证据</summary>
        <pre data-testid="stage0-metrics">{JSON.stringify(snapshot, null, 2)}</pre>
      </details>

      <nav className="stage0-harness__nav">
        <a
          data-testid="stage0-nav-learn"
          href={`${import.meta.env.BASE_URL}learn/why-data-warehouse/`}
        >
          软跳转到普通课程
        </a>
      </nav>
    </section>
  )
}
