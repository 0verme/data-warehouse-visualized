export const SQL_SANDBOX_RUNTIME_PHASES = [
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
] as const

export type SqlSandboxRuntimePhase = (typeof SQL_SANDBOX_RUNTIME_PHASES)[number]
export type SqlSandboxDiagnosticPhaseStatus = 'running' | 'success' | 'failed'
export type SqlSandboxBundleName = 'eh' | 'mvp' | 'coi'

export interface SqlSandboxDiagnosticPhase {
  phase: SqlSandboxRuntimePhase
  status: SqlSandboxDiagnosticPhaseStatus
  startedAt: string
  endedAt?: string
  elapsedMs: number
  errorName?: string
  errorMessage?: string
}

export type SqlSandboxDiagnosticFeatureDetection = Record<string, boolean>

export interface SqlSandboxRuntimeMetadata {
  packageVersion?: string
  engineVersion?: string
  featureDetection?: SqlSandboxDiagnosticFeatureDetection
  selectedBundle?: SqlSandboxBundleName
  workerUrl?: string
  wasmUrl?: string
  pthreadWorkerUrl?: string | null
}

export interface SqlSandboxBrowserMetadata {
  userAgent: string
  platform: string
  crossOriginIsolated: boolean
  preflightCapabilities: {
    webAssembly: boolean
    worker: boolean
  } | null
}

export interface SqlSandboxLifecycleEvent {
  event: 'pageshow' | 'pagehide' | 'visibilitychange'
  occurredAt: string
  navigationType: string
  visibilityState: string
  persisted?: boolean
}

export interface SqlSandboxDiagnosticsState {
  phases: SqlSandboxDiagnosticPhase[]
  browser: SqlSandboxBrowserMetadata
  runtime: SqlSandboxRuntimeMetadata
  lifecycle: SqlSandboxLifecycleEvent[]
}

export type SqlSandboxDiagnosticPhaseListener = (phase: SqlSandboxDiagnosticPhase) => void
export type SqlSandboxRuntimeMetadataListener = (metadata: SqlSandboxRuntimeMetadata) => void

export const SQL_SANDBOX_LIFECYCLE_SESSION_KEY = 'sql-sandbox-runtime-diagnostics-lifecycle-v1'
const MAX_PHASE_EVENTS = 80
const MAX_LIFECYCLE_EVENTS = 40
const REDACTED_ERROR_MESSAGE = 'Error details omitted to avoid recording SQL or seed data.'

function nowMonotonic(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function getErrorName(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name
  }
  return error === null ? 'null' : typeof error
}

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 1000)
}

function notifyPhase(
  listener: SqlSandboxDiagnosticPhaseListener,
  event: SqlSandboxDiagnosticPhase,
) {
  try {
    listener(event)
  } catch {
    // Diagnostics must never change runtime behavior if a UI listener fails.
  }
}

export async function runWithDiagnosticPhase<T>(
  phase: SqlSandboxRuntimePhase,
  listener: SqlSandboxDiagnosticPhaseListener,
  action: () => Promise<T>,
  options: { redactErrorMessage?: boolean } = {},
): Promise<T> {
  const startedAtMs = Date.now()
  const startedMonotonic = nowMonotonic()
  notifyPhase(listener, {
    phase,
    status: 'running',
    startedAt: new Date(startedAtMs).toISOString(),
    elapsedMs: 0,
  })

  try {
    const value = await action()
    const endedAtMs = Date.now()
    notifyPhase(listener, {
      phase,
      status: 'success',
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      elapsedMs: Math.max(0, Math.round(nowMonotonic() - startedMonotonic)),
    })
    return value
  } catch (error) {
    const endedAtMs = Date.now()
    notifyPhase(listener, {
      phase,
      status: 'failed',
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      elapsedMs: Math.max(0, Math.round(nowMonotonic() - startedMonotonic)),
      errorName: getErrorName(error),
      errorMessage: options.redactErrorMessage ? REDACTED_ERROR_MESSAGE : getErrorMessage(error),
    })
    throw error
  }
}

export function createInitialSqlSandboxDiagnostics(): SqlSandboxDiagnosticsState {
  const hasBrowser = typeof navigator !== 'undefined'
  const platform = hasBrowser
    ? (navigator as Omit<Navigator, 'platform'> & { platform?: string }).platform || 'unknown'
    : 'unknown'
  return {
    phases: [],
    browser: {
      userAgent: hasBrowser ? navigator.userAgent || 'unknown' : 'unknown',
      platform,
      crossOriginIsolated:
        typeof globalThis.crossOriginIsolated === 'boolean'
          ? globalThis.crossOriginIsolated
          : false,
      preflightCapabilities: null,
    },
    runtime: {},
    lifecycle: readSqlSandboxLifecycleEvents(),
  }
}

export function withSqlSandboxPreflightCapabilities(
  state: SqlSandboxDiagnosticsState,
  capabilities: { webAssembly: boolean; worker: boolean },
): SqlSandboxDiagnosticsState {
  return {
    ...state,
    browser: { ...state.browser, preflightCapabilities: capabilities },
  }
}

export function applySqlSandboxDiagnosticPhase(
  state: SqlSandboxDiagnosticsState,
  event: SqlSandboxDiagnosticPhase,
): SqlSandboxDiagnosticsState {
  const phases = [...state.phases]
  if (event.status === 'running') {
    phases.push(event)
  } else {
    let runningIndex = -1
    for (let index = phases.length - 1; index >= 0; index -= 1) {
      if (phases[index].phase === event.phase && phases[index].status === 'running') {
        runningIndex = index
        break
      }
    }
    if (runningIndex >= 0) {
      phases[runningIndex] = event
    } else {
      phases.push(event)
    }
  }

  return { ...state, phases: phases.slice(-MAX_PHASE_EVENTS) }
}

export function applySqlSandboxRuntimeMetadata(
  state: SqlSandboxDiagnosticsState,
  metadata: SqlSandboxRuntimeMetadata,
): SqlSandboxDiagnosticsState {
  return { ...state, runtime: { ...state.runtime, ...metadata } }
}

export function updateRunningPhaseElapsed(
  state: SqlSandboxDiagnosticsState,
  now = Date.now(),
): SqlSandboxDiagnosticsState {
  let changed = false
  const phases = state.phases.map((phase) => {
    if (phase.status !== 'running') {
      return phase
    }
    changed = true
    const startedAt = Date.parse(phase.startedAt)
    return {
      ...phase,
      elapsedMs: Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : phase.elapsedMs,
    }
  })
  return changed ? { ...state, phases } : state
}

function getSessionStorage(storage?: Storage): Storage | null {
  if (storage) {
    return storage
  }
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function isLifecycleEvent(value: unknown): value is SqlSandboxLifecycleEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<SqlSandboxLifecycleEvent>
  return (
    (event.event === 'pageshow' ||
      event.event === 'pagehide' ||
      event.event === 'visibilitychange') &&
    typeof event.occurredAt === 'string' &&
    typeof event.navigationType === 'string' &&
    typeof event.visibilityState === 'string'
  )
}

export function readSqlSandboxLifecycleEvents(storage?: Storage): SqlSandboxLifecycleEvent[] {
  const session = getSessionStorage(storage)
  if (!session) return []
  try {
    const raw = session.getItem(SQL_SANDBOX_LIFECYCLE_SESSION_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isLifecycleEvent).slice(-MAX_LIFECYCLE_EVENTS) : []
  } catch {
    return []
  }
}

export function applySqlSandboxLifecycleEvent(
  state: SqlSandboxDiagnosticsState,
  event: SqlSandboxLifecycleEvent,
): SqlSandboxDiagnosticsState {
  return { ...state, lifecycle: [...state.lifecycle, event].slice(-MAX_LIFECYCLE_EVENTS) }
}

export function persistSqlSandboxLifecycleEvent(
  event: SqlSandboxLifecycleEvent,
  storage?: Storage,
): void {
  const session = getSessionStorage(storage)
  if (!session) return
  try {
    const lifecycle = [...readSqlSandboxLifecycleEvents(session), event].slice(
      -MAX_LIFECYCLE_EVENTS,
    )
    session.setItem(SQL_SANDBOX_LIFECYCLE_SESSION_KEY, JSON.stringify(lifecycle))
  } catch {
    // Session storage can be unavailable in private / restricted browsing modes.
  }
}

export function appendSqlSandboxLifecycleEvent(
  state: SqlSandboxDiagnosticsState,
  event: SqlSandboxLifecycleEvent,
  storage?: Storage,
): SqlSandboxDiagnosticsState {
  persistSqlSandboxLifecycleEvent(event, storage)
  return applySqlSandboxLifecycleEvent(state, event)
}

export function createSqlSandboxLifecycleEvent(
  event: SqlSandboxLifecycleEvent['event'],
  navigationType: string,
  options: { persisted?: boolean; visibilityState?: string } = {},
): SqlSandboxLifecycleEvent {
  return {
    event,
    occurredAt: new Date().toISOString(),
    navigationType,
    visibilityState:
      options.visibilityState ??
      (typeof document === 'undefined' ? 'unknown' : document.visibilityState),
    ...(options.persisted === undefined ? {} : { persisted: options.persisted }),
  }
}

export function getSqlSandboxNavigationType(): string {
  if (typeof performance === 'undefined') return 'unknown'
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined
    return navigation?.type ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function getCurrentSqlSandboxPhase(
  state: SqlSandboxDiagnosticsState,
): SqlSandboxDiagnosticPhase | null {
  return (
    [...state.phases].reverse().find((phase) => phase.status === 'running') ??
    state.phases[state.phases.length - 1] ??
    null
  )
}

export function getLastCompletedSqlSandboxPhase(
  state: SqlSandboxDiagnosticsState,
): SqlSandboxDiagnosticPhase | null {
  return [...state.phases].reverse().find((phase) => phase.status === 'success') ?? null
}

export function getLatestSqlSandboxDiagnosticError(
  state: SqlSandboxDiagnosticsState,
): SqlSandboxDiagnosticPhase | null {
  return (
    [...state.phases].reverse().find((phase) => phase.status === 'failed' && phase.errorName) ??
    null
  )
}

function formatFeatureDetection(
  features: SqlSandboxDiagnosticFeatureDetection | undefined,
): string {
  if (!features) return 'not available'
  return Object.entries(features)
    .map(([name, supported]) => `${name}: ${supported ? 'true' : 'false'}`)
    .join(', ')
}

export function formatSqlSandboxDiagnostics(state: SqlSandboxDiagnosticsState): string {
  const current = getCurrentSqlSandboxPhase(state)
  const lastCompleted = getLastCompletedSqlSandboxPhase(state)
  const error = getLatestSqlSandboxDiagnosticError(state)
  const currentStartedAt = current?.status === 'running' ? Date.parse(current.startedAt) : NaN
  const currentElapsed =
    current?.status === 'running' && Number.isFinite(currentStartedAt)
      ? Math.max(current.elapsedMs, Date.now() - currentStartedAt)
      : (current?.elapsedMs ?? 0)

  return [
    'SQL Sandbox Diagnostics',
    '',
    'UA:',
    state.browser.userAgent,
    '',
    'Platform:',
    state.browser.platform,
    '',
    `crossOriginIsolated: ${state.browser.crossOriginIsolated}`,
    `DuckDB package version: ${state.runtime.packageVersion ?? 'not available'}`,
    `DuckDB engine version: ${state.runtime.engineVersion ?? 'not available'}`,
    `Bundle: ${state.runtime.selectedBundle?.toUpperCase() ?? 'not selected'}`,
    `Feature detection: ${formatFeatureDetection(state.runtime.featureDetection)}`,
    `Preflight WebAssembly: ${state.browser.preflightCapabilities?.webAssembly ?? 'not checked'}`,
    `Preflight Worker: ${state.browser.preflightCapabilities?.worker ?? 'not checked'}`,
    `Worker: ${state.runtime.workerUrl ?? 'not available'}`,
    `WASM: ${state.runtime.wasmUrl ?? 'not available'}`,
    `pthread worker: ${state.runtime.pthreadWorkerUrl ?? 'none'}`,
    '',
    `Current phase: ${current?.phase ?? 'none'}`,
    `Status: ${current?.status ?? 'idle'}`,
    `Elapsed: ${current ? `${Math.round(currentElapsed)}ms` : '0ms'}`,
    `Last completed: ${lastCompleted?.phase ?? 'none'}`,
    `Error phase: ${error?.phase ?? 'none'}`,
    `Error elapsed: ${error ? `${error.elapsedMs}ms` : 'none'}`,
    `Error name: ${error?.errorName ?? 'none'}`,
    `Error message: ${error?.errorMessage ?? 'none'}`,
    '',
    'Lifecycle:',
    ...(state.lifecycle.length
      ? state.lifecycle.map(
          (entry) =>
            `${entry.occurredAt} ${entry.event} (navigation=${entry.navigationType}, visibility=${entry.visibilityState}${entry.persisted === undefined ? '' : `, persisted=${entry.persisted}`})`,
        )
      : ['none']),
    '',
    'Privacy: no SQL text, query results, seed content, or business storage data is included.',
  ].join('\n')
}
