/**
 * Stage 0（Issue #35）DuckDB-WASM 技术验证的本地类型。
 *
 * 该目录是实验性代码：只在隐藏 harness `/dev/sql-sandbox-poc` 中使用，
 * 不进入课程导航、不进入 sitemap、不是正式产品能力。
 */

export type SqlSandboxStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'unsupported'

export type SqlSandboxStrategy = 'cdn' | 'self-host'

/** 自托管方案下需要由站点自己提供 URL 的四个资产。 */
export interface SelfHostAssetUrls {
  ehWasm: string
  ehWorker: string
  mvpWasm?: string
  mvpWorker?: string
}

export interface SqlQueryResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  truncated: boolean
}

export interface SqlTargetScope {
  branchName: string
  customerScope: string
  productType: string
  currency: string
}

export interface SqlResultSummary {
  rowCount: number
  balanceColumn: string | null
  totalBalance: number | null
  targetScopeRowCount: number
  targetScopeBalance: number | null
}

export interface Stage0Metric {
  label: string
  durationMs: number
  detail?: string
}

export interface ResourceEvidence {
  name: string
  initiatorType: string
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  durationMs: number
}

export interface SqlSandboxSnapshot {
  status: SqlSandboxStatus
  strategy: SqlSandboxStrategy
  engineVersion: string | null
  selectedBundle: string | null
  metrics: Stage0Metric[]
  resources: ResourceEvidence[]
  result: SqlQueryResult | null
  summary: SqlResultSummary | null
  error: string | null
}
