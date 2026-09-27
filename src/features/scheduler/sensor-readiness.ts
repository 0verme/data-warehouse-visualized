export const SENSOR_READINESS_START_AT = '2026-10-01 02:00'
export const SENSOR_DATA_FILE_APPEARS_AT = '2026-10-01 02:07'
export const SENSOR_READY_SIGNAL_APPEARS_AT = '2026-10-01 02:10'

export const SENSOR_POLL_INTERVAL_OPTIONS = [1, 2, 4, 5] as const
export const SENSOR_TIMEOUT_OPTIONS = [6, 10, 14] as const

export type SensorFileState = 'absent' | 'incomplete' | 'complete'
export type SensorRunStatus =
  'waiting' | 'polling' | 'success' | 'timeout' | 'manual-action' | 'failed'

export interface SensorReadinessConfig {
  pollingIntervalMinutes: number
  timeoutMinutes: number
  requireReadySignal: boolean
}

export interface SensorPollRecord {
  checkedAt: string
  fileState: SensorFileState
  conditionSatisfied: boolean
}

export interface SensorReadinessRun {
  config: SensorReadinessConfig
  startedAt: string
  currentAt: string
  status: SensorRunStatus
  polls: readonly SensorPollRecord[]
  downstreamEligible: boolean
}

export const DEFAULT_SENSOR_READINESS_CONFIG: SensorReadinessConfig = {
  pollingIntervalMinutes: 2,
  timeoutMinutes: 14,
  requireReadySignal: true,
}

function addMinutes(timestamp: string, minutes: number): string {
  const date = new Date(`${timestamp.replace(' ', 'T')}:00Z`)
  date.setUTCMinutes(date.getUTCMinutes() + minutes)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function getTimeoutAt(run: SensorReadinessRun): string {
  return addMinutes(run.startedAt, run.config.timeoutMinutes)
}

function getNextPollAt(run: SensorReadinessRun): string {
  return addMinutes(run.startedAt, run.config.pollingIntervalMinutes * (run.polls.length + 1))
}

function isTerminal(status: SensorRunStatus): boolean {
  return status === 'success' || status === 'manual-action' || status === 'failed'
}

export function getSensorFileState(at: string): SensorFileState {
  if (at < SENSOR_DATA_FILE_APPEARS_AT) {
    return 'absent'
  }

  return at < SENSOR_READY_SIGNAL_APPEARS_AT ? 'incomplete' : 'complete'
}

export function getNextSensorActionAt(run: SensorReadinessRun): string | null {
  if (isTerminal(run.status) || run.status === 'timeout') {
    return null
  }

  const nextPollAt = getNextPollAt(run)
  const timeoutAt = getTimeoutAt(run)
  return nextPollAt <= timeoutAt ? nextPollAt : timeoutAt
}

export function createSensorReadinessRun(
  config: Partial<SensorReadinessConfig> = {},
): SensorReadinessRun {
  const resolvedConfig = { ...DEFAULT_SENSOR_READINESS_CONFIG, ...config }
  if (
    !Number.isInteger(resolvedConfig.pollingIntervalMinutes) ||
    resolvedConfig.pollingIntervalMinutes < 1
  ) {
    throw new Error('pollingIntervalMinutes 必须是正整数')
  }
  if (!Number.isInteger(resolvedConfig.timeoutMinutes) || resolvedConfig.timeoutMinutes < 1) {
    throw new Error('timeoutMinutes 必须是正整数')
  }

  return {
    config: resolvedConfig,
    startedAt: SENSOR_READINESS_START_AT,
    currentAt: SENSOR_READINESS_START_AT,
    status: 'waiting',
    polls: [],
    downstreamEligible: false,
  }
}

export function advanceSensorReadinessRun(run: SensorReadinessRun): SensorReadinessRun {
  if (isTerminal(run.status) || run.status === 'timeout') {
    return run
  }

  const nextPollAt = getNextPollAt(run)
  const timeoutAt = getTimeoutAt(run)
  if (nextPollAt > timeoutAt) {
    return { ...run, currentAt: timeoutAt, status: 'timeout' }
  }

  const fileState = getSensorFileState(nextPollAt)
  const conditionSatisfied = run.config.requireReadySignal
    ? fileState === 'complete'
    : fileState !== 'absent'
  const poll: SensorPollRecord = {
    checkedAt: nextPollAt,
    fileState,
    conditionSatisfied,
  }
  const polls = [...run.polls, poll]

  if (conditionSatisfied) {
    return {
      ...run,
      currentAt: nextPollAt,
      status: 'success',
      polls,
      downstreamEligible: true,
    }
  }

  return {
    ...run,
    currentAt: nextPollAt,
    status: nextPollAt >= timeoutAt ? 'timeout' : 'polling',
    polls,
  }
}

export function resolveSensorTimeout(
  run: SensorReadinessRun,
  action: 'manual-action' | 'failed',
): SensorReadinessRun {
  if (run.status !== 'timeout') {
    return run
  }

  return { ...run, status: action, downstreamEligible: false }
}
