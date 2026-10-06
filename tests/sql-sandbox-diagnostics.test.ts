import { describe, expect, it, vi } from 'vitest'
import {
  SQL_SANDBOX_LIFECYCLE_SESSION_KEY,
  SQL_SANDBOX_RUNTIME_PHASES,
  appendSqlSandboxLifecycleEvent,
  applySqlSandboxDiagnosticPhase,
  applySqlSandboxRuntimeMetadata,
  createInitialSqlSandboxDiagnostics,
  createSqlSandboxLifecycleEvent,
  formatSqlSandboxDiagnostics,
  getCurrentSqlSandboxPhase,
  getLastCompletedSqlSandboxPhase,
  readSqlSandboxLifecycleEvents,
  runWithDiagnosticPhase,
  updateRunningPhaseElapsed,
} from '../src/features/sql-sandbox-experiment/diagnostics'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}

describe('SQL Sandbox runtime diagnostics', () => {
  it('defines the real initialization and query phases in execution order', () => {
    expect(SQL_SANDBOX_RUNTIME_PHASES).toEqual([
      'dynamic-import',
      'feature-detect',
      'select-bundle',
      'create-worker',
      'instantiate',
      'open',
      'connect',
      'get-version',
      'seed-runtime',
      'ready',
      'query',
    ])
  })

  it('keeps a pending phase running and updates its elapsed time', () => {
    const startedAt = new Date(Date.now() - 5_250).toISOString()
    const running = {
      phase: 'instantiate' as const,
      status: 'running' as const,
      startedAt,
      elapsedMs: 0,
    }
    const state = applySqlSandboxDiagnosticPhase(createInitialSqlSandboxDiagnostics(), running)
    const updated = updateRunningPhaseElapsed(state)

    expect(getCurrentSqlSandboxPhase(updated)?.status).toBe('running')
    expect(getCurrentSqlSandboxPhase(updated)?.elapsedMs).toBeGreaterThanOrEqual(5_000)
  })

  it('replaces the matching running event with completion and exposes last completed phase', () => {
    const startedAt = new Date().toISOString()
    const pending = applySqlSandboxDiagnosticPhase(createInitialSqlSandboxDiagnostics(), {
      phase: 'create-worker',
      status: 'running',
      startedAt,
      elapsedMs: 0,
    })
    const completed = applySqlSandboxDiagnosticPhase(pending, {
      phase: 'create-worker',
      status: 'success',
      startedAt,
      endedAt: new Date().toISOString(),
      elapsedMs: 183,
    })

    expect(completed.phases).toHaveLength(1)
    expect(getLastCompletedSqlSandboxPhase(completed)).toMatchObject({
      phase: 'create-worker',
      status: 'success',
      elapsedMs: 183,
    })
  })

  it('never lets diagnostic listeners change the wrapped runtime action', async () => {
    const actionError = new Error('runtime failed')
    const listener = vi.fn(() => {
      throw new Error('diagnostic UI failed')
    })
    const action = vi.fn(async () => {
      throw actionError
    })

    await expect(runWithDiagnosticPhase('instantiate', listener, action)).rejects.toBe(actionError)
    expect(action).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('redacts query and seed error messages while preserving error name and original rejection', async () => {
    const phases: Array<{ status: string; errorName?: string; errorMessage?: string }> = []
    const queryError = new TypeError('near SELECT balance FROM private_table')

    await expect(
      runWithDiagnosticPhase(
        'query',
        (phase) => phases.push(phase),
        async () => {
          throw queryError
        },
        { redactErrorMessage: true },
      ),
    ).rejects.toBe(queryError)

    expect(phases.at(-1)).toMatchObject({
      status: 'failed',
      errorName: 'TypeError',
      errorMessage: expect.not.stringContaining('private_table'),
    })
  })

  it('records browser/runtime metadata and formats a useful plain-text report without SQL or results', () => {
    let state = createInitialSqlSandboxDiagnostics()
    state = {
      ...state,
      browser: {
        userAgent: 'iPhone Safari test UA',
        platform: 'iPhone',
        crossOriginIsolated: false,
        preflightCapabilities: { webAssembly: true, worker: true },
      },
    }
    state = applySqlSandboxRuntimeMetadata(state, {
      packageVersion: '1.32.0',
      engineVersion: 'v1.4.3',
      selectedBundle: 'eh',
      featureDetection: {
        bigInt64Array: true,
        crossOriginIsolated: false,
        wasmExceptions: true,
        wasmSIMD: true,
        wasmBulkMemory: true,
        wasmThreads: false,
      },
      workerUrl: 'https://cdn.example/duckdb-browser-eh.worker.js',
      wasmUrl: 'https://cdn.example/duckdb-eh.wasm',
      pthreadWorkerUrl: null,
    })
    state = applySqlSandboxDiagnosticPhase(state, {
      phase: 'instantiate',
      status: 'running',
      startedAt: new Date().toISOString(),
      elapsedMs: 12_300,
    })
    state = applySqlSandboxDiagnosticPhase(state, {
      phase: 'create-worker',
      status: 'success',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      elapsedMs: 183,
    })
    const report = formatSqlSandboxDiagnostics(state)

    expect(report).toContain('SQL Sandbox Diagnostics')
    expect(report).toContain('DuckDB package version: 1.32.0')
    expect(report).toContain('DuckDB engine version: v1.4.3')
    expect(report).toContain('Bundle: EH')
    expect(report).toContain('Current phase: instantiate')
    expect(report).toContain('Status: running')
    expect(report).toContain('Last completed: create-worker')
    expect(report).toContain('wasmThreads: false')
    expect(report).not.toContain('SELECT')
    expect(report).not.toContain('300000')
    expect(report).not.toContain('seed row')
  })

  it('shows the latest phase after a failed query is retried successfully', () => {
    let state = createInitialSqlSandboxDiagnostics()
    const startedAt = new Date().toISOString()
    state = applySqlSandboxDiagnosticPhase(state, {
      phase: 'query',
      status: 'failed',
      startedAt,
      endedAt: new Date().toISOString(),
      elapsedMs: 8,
      errorName: 'Error',
      errorMessage: 'redacted',
    })
    state = applySqlSandboxDiagnosticPhase(state, {
      phase: 'query',
      status: 'running',
      startedAt: new Date().toISOString(),
      elapsedMs: 0,
    })
    state = applySqlSandboxDiagnosticPhase(state, {
      phase: 'query',
      status: 'success',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      elapsedMs: 12,
    })

    expect(getCurrentSqlSandboxPhase(state)).toMatchObject({ phase: 'query', status: 'success' })
  })

  it('formats error name, message, phase, and elapsed time', () => {
    let state = createInitialSqlSandboxDiagnostics()
    const startedAt = new Date().toISOString()
    state = applySqlSandboxDiagnosticPhase(state, {
      phase: 'instantiate',
      status: 'running',
      startedAt,
      elapsedMs: 0,
    })
    state = applySqlSandboxDiagnosticPhase(state, {
      phase: 'instantiate',
      status: 'failed',
      startedAt,
      endedAt: new Date().toISOString(),
      elapsedMs: 14_200,
      errorName: 'TypeError',
      errorMessage: 'WebAssembly compile failed',
    })
    const report = formatSqlSandboxDiagnostics(state)

    expect(report).toContain('Error phase: instantiate')
    expect(report).toContain('Error elapsed: 14200ms')
    expect(report).toContain('Error name: TypeError')
    expect(report).toContain('Error message: WebAssembly compile failed')
  })

  it('stores only lifecycle records under its own sessionStorage key', () => {
    const storage = createMemoryStorage()
    const event = createSqlSandboxLifecycleEvent('pageshow', 'reload', { persisted: false })
    const state = appendSqlSandboxLifecycleEvent(
      createInitialSqlSandboxDiagnostics(),
      event,
      storage,
    )

    expect(storage.length).toBe(1)
    expect(storage.getItem(SQL_SANDBOX_LIFECYCLE_SESSION_KEY)).toContain('pageshow')
    expect(readSqlSandboxLifecycleEvents(storage)).toEqual([event])
    expect(state.lifecycle).toEqual([event])
  })
})
