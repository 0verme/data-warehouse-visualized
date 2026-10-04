/**
 * Stage 0 harness 的状态机。
 *
 * - DuckDB runtime 只在 `start()` 里被动态 import；
 * - 执行带 requestId，旧结果不会覆盖新结果；
 * - unmount / pagehide / astro:before-swap 都会 terminate worker。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { guardSql } from './guard'
import { getStage0Reference, type Stage0Reference } from './reference'
import { summarizeResult } from './result'
import { buildSeedScript } from './seed'
import type { ResourceEvidence, SqlQueryResult, SqlResultSummary, SqlSandboxStatus } from './types'
import type { SelfHostAssetUrls, SqlSandboxStrategy, Stage0Metric } from './types'

export interface SqlSandboxEngineInfo {
  strategy: SqlSandboxStrategy
  selectedBundle: string
  packageVersion: string
  engineVersion: string
}

export interface UseSqlSandboxResult {
  status: SqlSandboxStatus
  engine: SqlSandboxEngineInfo | null
  metrics: Stage0Metric[]
  resources: ResourceEvidence[]
  result: SqlQueryResult | null
  summary: SqlResultSummary | null
  error: string | null
  runSequence: number
  start: (strategy: SqlSandboxStrategy, selfHost?: SelfHostAssetUrls) => Promise<void>
  run: (sql: string) => Promise<void>
  terminate: () => Promise<void>
}

export function collectResourceEvidence(): ResourceEvidence[] {
  if (typeof performance === 'undefined') {
    return []
  }

  return (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((entry) => /duckdb|\.wasm|worker/iu.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      durationMs: entry.duration,
    }))
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

let cachedReference: Stage0Reference | null = null

function getCachedReference(): Stage0Reference {
  cachedReference ??= getStage0Reference()
  return cachedReference
}

export function useSqlSandbox(): UseSqlSandboxResult {
  const [status, setStatus] = useState<SqlSandboxStatus>('idle')
  const [engine, setEngine] = useState<SqlSandboxEngineInfo | null>(null)
  const [metrics, setMetrics] = useState<Stage0Metric[]>([])
  const [resources, setResources] = useState<ResourceEvidence[]>([])
  const [result, setResult] = useState<SqlQueryResult | null>(null)
  const [summary, setSummary] = useState<SqlResultSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runSequence, setRunSequence] = useState(0)

  const handleRef = useRef<import('./runtime').SqlSandboxRuntimeHandle | null>(null)
  const runtimeRef = useRef<typeof import('./runtime') | null>(null)
  const requestIdRef = useRef(0)
  const queryCountRef = useRef(0)
  const loadingRef = useRef(false)

  const start = useCallback(async (strategy: SqlSandboxStrategy, selfHost?: SelfHostAssetUrls) => {
    if (handleRef.current || loadingRef.current) {
      return
    }

    if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
      setStatus('unsupported')
      setError('当前浏览器缺少 WebAssembly 或 Worker 支持，无法运行真实 SQL 实验')
      return
    }

    loadingRef.current = true
    setStatus('loading')
    setError(null)
    setResult(null)
    setSummary(null)
    setMetrics([])
    setResources([])
    queryCountRef.current = 0

    try {
      const t0 = performance.now()
      const runtimeModule = await import('./runtime')
      const t1 = performance.now()
      runtimeRef.current = runtimeModule

      const handle = await runtimeModule.createRuntime({ strategy, selfHost })
      const t2 = performance.now()

      const seed = buildSeedScript()
      await runtimeModule.seedRuntime(handle, seed.statements)
      const t3 = performance.now()

      handleRef.current = handle
      setEngine({
        strategy,
        selectedBundle: handle.selectedBundle,
        packageVersion: handle.packageVersion,
        engineVersion: handle.engineVersion,
      })
      setMetrics([
        { label: '动态 import runtime', durationMs: t1 - t0 },
        { label: 'worker + wasm 实例化', durationMs: t2 - t1 },
        { label: `seed（${seed.rowCount} 行 DWD）`, durationMs: t3 - t2 },
      ])
      setResources(collectResourceEvidence())
      setStatus('ready')
    } catch (startError) {
      handleRef.current = null
      runtimeRef.current = null
      setError(toErrorMessage(startError))
      setStatus('error')
    } finally {
      loadingRef.current = false
    }
  }, [])

  const run = useCallback(async (sql: string) => {
    const handle = handleRef.current
    const runtimeModule = runtimeRef.current

    if (!handle || !runtimeModule) {
      setError('请先启动实验环境')
      return
    }

    setRunSequence((sequence) => sequence + 1)

    const guarded = guardSql(sql)
    if (!guarded.ok) {
      setError(guarded.detail ?? guarded.reason)
      return
    }

    const requestId = ++requestIdRef.current
    setStatus('running')
    setError(null)

    try {
      const startedAt = performance.now()
      const next = await runtimeModule.runRuntimeQuery(handle, guarded.normalizedSql)
      if (requestId !== requestIdRef.current) {
        return
      }
      const finishedAt = performance.now()

      queryCountRef.current += 1
      setMetrics((previous) => [
        ...previous,
        {
          label: queryCountRef.current === 1 ? '第一次查询' : `第 ${queryCountRef.current} 次查询`,
          durationMs: finishedAt - startedAt,
          detail: guarded.normalizedSql.replace(/\s+/gu, ' ').slice(0, 80),
        },
      ])
      setResult(next)
      setSummary(summarizeResult(next, getCachedReference().targetScope))
      setResources(collectResourceEvidence())
      setStatus('ready')
    } catch (queryError) {
      if (requestId !== requestIdRef.current) {
        return
      }
      setError(toErrorMessage(queryError))
      setResources(collectResourceEvidence())
      setStatus('ready')
    }
  }, [])

  const terminate = useCallback(async () => {
    requestIdRef.current += 1
    const handle = handleRef.current
    const runtimeModule = runtimeRef.current
    handleRef.current = null
    runtimeRef.current = null

    if (handle && runtimeModule) {
      try {
        await runtimeModule.terminateRuntime(handle)
      } catch {
        // terminate 是尽力而为；即使失败也不保留 handle。
      }
    }

    setEngine(null)
    setStatus('idle')
    setResult(null)
    setSummary(null)
    setError(null)
    setResources([])
  }, [])

  useEffect(() => {
    const handlePageHide = () => {
      void terminate()
    }
    const handleBeforeSwap = () => {
      void terminate()
    }

    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('astro:before-swap', handleBeforeSwap)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('astro:before-swap', handleBeforeSwap)
      void terminate()
    }
  }, [terminate])

  return {
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
  }
}
