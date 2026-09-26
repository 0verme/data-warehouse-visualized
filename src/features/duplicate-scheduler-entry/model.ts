export type DuplicateSchedulerEntryId = 'old-job' | 'new-job'
export type TargetWriteSemantics = 'idempotent' | 'non-idempotent'

export interface DuplicateSchedulerEntryConfiguration {
  oldJobEnabled: boolean
  newJobEnabled: boolean
  targetSemantics: TargetWriteSemantics
}

export interface DuplicateSchedulerEntryInput extends DuplicateSchedulerEntryConfiguration {
  businessDate: string
  productionLogicId: string
  outputTable: string
}

export interface DuplicateSchedulerTriggerRecord {
  entryId: DuplicateSchedulerEntryId
  entryLabel: string
  runId: string
  productionLogicId: string
  outputTable: string
  businessDate: string
  writeMode: 'overwrite-partition' | 'append'
}

export interface DuplicateSchedulerEntryResult {
  businessDate: string
  productionLogicId: string
  outputTable: string
  targetSemantics: TargetWriteSemantics
  triggerCount: number
  executionCount: number
  writeCount: number
  outputRows: number
  duplicateRows: number
  fileCount: number
  pushCount: number
  records: readonly DuplicateSchedulerTriggerRecord[]
}

export const DEFAULT_DUPLICATE_SCHEDULER_CONFIGURATION: Readonly<DuplicateSchedulerEntryConfiguration> =
  {
    oldJobEnabled: true,
    newJobEnabled: true,
    targetSemantics: 'idempotent',
  }

const SCHEDULE_ENTRIES: readonly {
  id: DuplicateSchedulerEntryId
  label: string
  enabledKey: 'oldJobEnabled' | 'newJobEnabled'
}[] = [
  { id: 'old-job', label: '旧 JOB · deposit-balance-v1', enabledKey: 'oldJobEnabled' },
  { id: 'new-job', label: '新 JOB · deposit-balance-v2', enabledKey: 'newJobEnabled' },
]

/**
 * One deterministic cutover window: every enabled production schedule fires once
 * for the same business date and reaches the same logic and target successfully.
 * Queueing, retries, concurrency and platform-specific de-duplication are out of scope.
 */
export function simulateDuplicateSchedulerEntries({
  oldJobEnabled,
  newJobEnabled,
  targetSemantics,
  businessDate,
  productionLogicId,
  outputTable,
}: DuplicateSchedulerEntryInput): DuplicateSchedulerEntryResult {
  const enabledEntries = SCHEDULE_ENTRIES.filter(({ enabledKey }) =>
    enabledKey === 'oldJobEnabled' ? oldJobEnabled : newJobEnabled,
  )
  const executionCount = enabledEntries.length
  const writeMode = targetSemantics === 'idempotent' ? 'overwrite-partition' : 'append'
  const outputRows =
    executionCount === 0 ? 0 : targetSemantics === 'idempotent' ? 1 : executionCount

  return {
    businessDate,
    productionLogicId,
    outputTable,
    targetSemantics,
    triggerCount: enabledEntries.length,
    executionCount,
    writeCount: executionCount,
    outputRows,
    duplicateRows: Math.max(0, outputRows - 1),
    // Table idempotency does not make per-run file generation or API pushes idempotent.
    fileCount: executionCount,
    pushCount: executionCount,
    records: enabledEntries.map(({ id, label }) => ({
      entryId: id,
      entryLabel: label,
      runId: `run.deposit-balance.daily.${businessDate.replace(/-/gu, '')}.${id}.001`,
      productionLogicId,
      outputTable,
      businessDate,
      writeMode,
    })),
  }
}
