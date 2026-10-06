/**
 * Stage 1 教学闭环的状态机（Issue #35）。
 *
 * 生命周期与 Stage 0 harness 保持一致：
 * - DuckDB runtime 只在第一次 `run()` 且需要时动态 import；
 * - 每次执行带 requestId / generation，旧结果不会覆盖新状态；
 * - unmount / pagehide / astro:before-swap 都会 terminate worker；
 * - 查询超时时终止 worker 并给出可恢复提示。
 *
 * 纯状态迁移函数单独导出，便于在 Node 端做单元测试。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applySqlSandboxDiagnosticPhase,
  applySqlSandboxLifecycleEvent,
  applySqlSandboxRuntimeMetadata,
  createInitialSqlSandboxDiagnostics,
  createSqlSandboxLifecycleEvent,
  getSqlSandboxNavigationType,
  persistSqlSandboxLifecycleEvent,
  runWithDiagnosticPhase,
  updateRunningPhaseElapsed,
  withSqlSandboxPreflightCapabilities,
  type SqlSandboxDiagnosticPhaseListener,
  type SqlSandboxDiagnosticsState,
  type SqlSandboxRuntimeMetadataListener,
} from './diagnostics'
import {
  SQL_SANDBOX_QUERY_TIMEOUT_MS,
  SqlSandboxTimeoutError,
  getGuardFailure,
  getUnsupportedEnvironmentFailure,
  mapSqlFailure,
  type SqlSandboxFailure,
} from './errors'
import { guardSql } from './guard'
import { getSqlSandboxReference, type SqlSandboxReference } from './reference'
import { summarizeResult } from './result'
import { buildSeedScript } from './seed'
import type { SqlQueryResult, SqlResultSummary, SqlSandboxStatus } from './types'

export interface LessonSqlSandboxEngineInfo {
  engineVersion: string
  selectedBundle: string
  strategy: 'cdn'
}

export interface LessonSqlSandboxState {
  status: SqlSandboxStatus
  engine: LessonSqlSandboxEngineInfo | null
  result: SqlQueryResult | null
  summary: SqlResultSummary | null
  failure: SqlSandboxFailure | null
  hasRun: boolean
  runMs: number | null
}

export interface LessonSqlSandboxResult extends LessonSqlSandboxState {
  diagnostics: SqlSandboxDiagnosticsState
  runSequence: number
  /** 守卫 → 按需启动 runtime → 真实执行；失败不抛出到 UI。 */
  run: (sql: string) => Promise<void>
  /** 「重置 SQL」：清空上一次运行结果，保留已就绪的实验环境。 */
  clearRun: () => void
  /** 「重置实验环境」：终止 worker，下次运行重新建库。 */
  resetEnvironment: () => Promise<void>
}

export function createLessonSandboxState(): LessonSqlSandboxState {
  return {
    status: 'idle',
    engine: null,
    result: null,
    summary: null,
    failure: null,
    hasRun: false,
    runMs: null,
  }
}

export function applySandboxSuccess(
  state: LessonSqlSandboxState,
  result: SqlQueryResult,
  summary: SqlResultSummary,
  runMs: number,
): LessonSqlSandboxState {
  return { ...state, status: 'ready', result, summary, failure: null, hasRun: true, runMs }
}

export function applySandboxFailure(
  state: LessonSqlSandboxState,
  failure: SqlSandboxFailure,
): LessonSqlSandboxState {
  return {
    ...state,
    status: state.status === 'unsupported' ? 'unsupported' : 'ready',
    failure,
  }
}

/** 保留实验环境，只清空「上一次运行」相关状态。 */
export function clearSandboxRun(state: LessonSqlSandboxState): LessonSqlSandboxState {
  return {
    ...state,
    status: state.engine ? 'ready' : 'idle',
    result: null,
    summary: null,
    failure: null,
    hasRun: false,
    runMs: null,
  }
}

/** 重置实验环境等价于回到初始状态。 */
export function resetSandboxEnvironment(): LessonSqlSandboxState {
  return createLessonSandboxState()
}

/** `ms <= 0` 表示不设超时。 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) {
    return promise
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SqlSandboxTimeoutError()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

let cachedReference: SqlSandboxReference | null = null

function getCachedReference(): SqlSandboxReference {
  cachedReference ??= getSqlSandboxReference()
  return cachedReference
}

export function useLessonSqlSandbox(): LessonSqlSandboxResult {
  const [state, setState] = useState<LessonSqlSandboxState>(createLessonSandboxState)
  const [diagnostics, setDiagnostics] = useState(createInitialSqlSandboxDiagnostics)
  const [runSequence, setRunSequence] = useState(0)

  const onDiagnosticPhase = useCallback<SqlSandboxDiagnosticPhaseListener>((phase) => {
    setDiagnostics((previous) => applySqlSandboxDiagnosticPhase(previous, phase))
  }, [])
  const onDiagnosticMetadata = useCallback<SqlSandboxRuntimeMetadataListener>((metadata) => {
    setDiagnostics((previous) => applySqlSandboxRuntimeMetadata(previous, metadata))
  }, [])

  const handleRef = useRef<import('./runtime').SqlSandboxRuntimeHandle | null>(null)
  const runtimeRef = useRef<typeof import('./runtime') | null>(null)
  const requestIdRef = useRef(0)
  const generationRef = useRef(0)
  const loadingRef = useRef(false)
  const runningRef = useRef(false)
  const cancelledRef = useRef(false)

  const terminateInternal = useCallback(async () => {
    requestIdRef.current += 1
    generationRef.current += 1

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
  }, [])

  const startInternal = useCallback(async (): Promise<
    import('./runtime').SqlSandboxRuntimeHandle | null
  > => {
    if (handleRef.current && runtimeRef.current) {
      return handleRef.current
    }

    if (loadingRef.current) {
      return null
    }

    const preflightCapabilities = {
      webAssembly: typeof WebAssembly !== 'undefined',
      worker: typeof Worker !== 'undefined',
    }
    setDiagnostics((previous) =>
      withSqlSandboxPreflightCapabilities(previous, preflightCapabilities),
    )
    if (!preflightCapabilities.webAssembly || !preflightCapabilities.worker) {
      try {
        await runWithDiagnosticPhase('feature-detect', onDiagnosticPhase, async () => {
          throw new Error('WebAssembly or Worker API unavailable')
        })
      } catch {
        // Keep the existing unsupported-environment UI and control flow.
      }
      setState((previous) => ({
        ...previous,
        status: 'unsupported',
        failure: getUnsupportedEnvironmentFailure(),
      }))
      return null
    }

    const generation = generationRef.current
    loadingRef.current = true
    setState((previous) => ({ ...previous, status: 'loading', failure: null }))

    try {
      const runtimeModule = await runWithDiagnosticPhase(
        'dynamic-import',
        onDiagnosticPhase,
        () => import('./runtime'),
      )
      const handle = await runtimeModule.createRuntime({
        strategy: 'cdn',
        onDiagnosticPhase,
        onDiagnosticMetadata,
      })
      const seed = buildSeedScript()
      await runWithDiagnosticPhase(
        'seed-runtime',
        onDiagnosticPhase,
        () => runtimeModule.seedRuntime(handle, seed.statements),
        { redactErrorMessage: true },
      )

      if (generation !== generationRef.current || cancelledRef.current) {
        await runtimeModule.terminateRuntime(handle)
        return null
      }

      await runWithDiagnosticPhase('ready', onDiagnosticPhase, async () => {
        runtimeRef.current = runtimeModule
        handleRef.current = handle
        setState((previous) => ({
          ...previous,
          status: 'ready',
          engine: {
            engineVersion: handle.engineVersion,
            selectedBundle: handle.selectedBundle,
            strategy: 'cdn',
          },
        }))
      })
      return handle
    } catch (error) {
      if (generation === generationRef.current && !cancelledRef.current) {
        setState((previous) => applySandboxFailure(previous, mapSqlFailure(error)))
      }
      return null
    } finally {
      loadingRef.current = false
    }
  }, [onDiagnosticMetadata, onDiagnosticPhase])

  const run = useCallback(
    async (sql: string) => {
      if (runningRef.current || loadingRef.current) {
        return
      }
      runningRef.current = true

      try {
        const guarded = guardSql(sql)
        if (!guarded.ok) {
          setState((previous) =>
            applySandboxFailure(previous, getGuardFailure(guarded.detail ?? guarded.reason)),
          )
          return
        }

        const requestId = ++requestIdRef.current
        setState((previous) =>
          previous.status === 'unsupported'
            ? previous
            : { ...previous, status: 'running', failure: null },
        )

        try {
          const handle = await startInternal()
          const runtimeModule = runtimeRef.current
          if (requestId !== requestIdRef.current || !handle || !runtimeModule) {
            return
          }

          const startedAt = performance.now()
          const result = await runWithDiagnosticPhase(
            'query',
            onDiagnosticPhase,
            () =>
              withTimeout(
                runtimeModule.runRuntimeQuery(handle, guarded.normalizedSql),
                SQL_SANDBOX_QUERY_TIMEOUT_MS,
              ),
            { redactErrorMessage: true },
          )
          if (requestId !== requestIdRef.current) {
            return
          }

          const runMs = Math.round(performance.now() - startedAt)
          const summary = summarizeResult(result, getCachedReference().targetScope)
          setState((previous) => applySandboxSuccess(previous, result, summary, runMs))
        } catch (error) {
          if (requestId !== requestIdRef.current) {
            return
          }

          if (error instanceof SqlSandboxTimeoutError) {
            await terminateInternal()
            setState((previous) =>
              applySandboxFailure({ ...previous, engine: null }, mapSqlFailure(error)),
            )
            return
          }

          setState((previous) => applySandboxFailure(previous, mapSqlFailure(error)))
        }
      } finally {
        runningRef.current = false
        setRunSequence((sequence) => sequence + 1)
      }
    },
    [onDiagnosticPhase, startInternal, terminateInternal],
  )

  const clearRun = useCallback(() => {
    setState(clearSandboxRun)
  }, [])

  const resetEnvironment = useCallback(async () => {
    await terminateInternal()
    setState(resetSandboxEnvironment())
  }, [terminateInternal])

  useEffect(() => {
    const navigationType = getSqlSandboxNavigationType()
    const recordLifecycle = (
      event: 'pageshow' | 'pagehide' | 'visibilitychange',
      persisted?: boolean,
    ) => {
      const entry = createSqlSandboxLifecycleEvent(event, navigationType, { persisted })
      persistSqlSandboxLifecycleEvent(entry)
      setDiagnostics((previous) => applySqlSandboxLifecycleEvent(previous, entry))
    }

    // pageshow may have fired before this lazily loaded component mounts. Record
    // the current page entry and navigation type without storing its URL.
    recordLifecycle('pageshow')

    const handlePageShow = (event: PageTransitionEvent) => {
      recordLifecycle('pageshow', event.persisted)
    }
    const handlePageHide = (event: PageTransitionEvent) => {
      recordLifecycle('pagehide', event.persisted)
      void terminateInternal()
    }
    const handleVisibilityChange = () => recordLifecycle('visibilitychange')
    const handleBeforeSwap = () => {
      void terminateInternal()
    }

    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('astro:before-swap', handleBeforeSwap)

    return () => {
      cancelledRef.current = true
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('astro:before-swap', handleBeforeSwap)
      void terminateInternal()
    }
  }, [terminateInternal])

  const hasRunningDiagnosticPhase = diagnostics.phases.some((phase) => phase.status === 'running')
  useEffect(() => {
    if (!hasRunningDiagnosticPhase) return
    const timer = window.setInterval(() => {
      setDiagnostics((previous) => updateRunningPhaseElapsed(previous))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [hasRunningDiagnosticPhase])

  return {
    ...state,
    diagnostics,
    runSequence,
    run,
    clearRun,
    resetEnvironment,
  }
}
