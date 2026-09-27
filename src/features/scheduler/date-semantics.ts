export const DATE_SEMANTICS_TIME_ZONE = 'Asia/Shanghai (UTC+08:00)'
export const DATE_SEMANTICS_PARTITION_COLUMN = 'snapshot_date'
export const DEFAULT_DATE_SEMANTICS_SCENARIO = 'nightly-t1'

export interface DateSemanticsScenario {
  id: string
  label: string
  operation: string
  wallClock: string
  scheduleDate: string
  businessDate: string
  scheduleDateMeaning: string
  explanation: string
}

/**
 * Each preset is an explicit task-contract example, not a date derivation rule.
 * Wall-clock values are local to the declared Asia/Shanghai teaching timezone.
 */
export const DATE_SEMANTICS_SCENARIOS = [
  {
    id: 'nightly-t1',
    label: '夜间 T-1 日批',
    operation: '日终余额日批',
    wallClock: '2026-09-27 01:00',
    scheduleDate: '2026-09-27',
    businessDate: '2026-09-26',
    scheduleDateMeaning: '本例以日批计划日作为 schedule_date。',
    explanation:
      '本例任务契约约定：9 月 27 日的日批实例处理 9 月 26 日的日终余额。T-1 是这个任务的配置选择，不是行业规则。',
  },
  {
    id: 'same-day',
    label: '当日微批',
    operation: '当日新增余额微批',
    wallClock: '2026-09-27 14:00',
    scheduleDate: '2026-09-27',
    businessDate: '2026-09-27',
    scheduleDateMeaning: '本例以当日实例日期作为 schedule_date。',
    explanation:
      '本例任务契约明确处理当天已确认的数据；current_date、schedule_date 和 biz_date 恰好同日，不代表这三个字段含义相同。',
  },
  {
    id: 'late-retry',
    label: '迟到后跨日 Retry',
    operation: '上游迟到 · Retry Attempt 2',
    wallClock: '2026-09-28 00:20',
    scheduleDate: '2026-09-27',
    businessDate: '2026-09-26',
    scheduleDateMeaning: 'Retry 沿用 9 月 27 日原调度实例的 schedule_date。',
    explanation:
      '9 月 27 日 01:00 的实例先等待迟到上游；输入在 9 月 28 日 00:10 就绪后，首个 attempt 失败，00:20 的 Retry 仍属于原实例，处理 9 月 26 日业务数据。',
  },
  {
    id: 'next-day-rerun',
    label: '次日 Rerun',
    operation: '修复后重跑前一业务日',
    wallClock: '2026-09-28 01:00',
    scheduleDate: '2026-09-28',
    businessDate: '2026-09-26',
    scheduleDateMeaning: '本例把手工 Rerun 的创建/派发日记为 schedule_date。',
    explanation:
      '本例次日创建了一个新的 Rerun 实例，因此 schedule_date 记为 9 月 28 日；目标 biz_date 仍由任务参数明确指定为 9 月 26 日。其他系统可采用不同记录约定。',
  },
  {
    id: 'cross-day-backfill',
    label: '跨日 Backfill',
    operation: '批量补跑历史日期中的一个实例',
    wallClock: '2026-09-28 01:15',
    scheduleDate: '2026-09-28',
    businessDate: '2026-09-25',
    scheduleDateMeaning: '本例记录 Backfill 发起/派发日；biz_date 是这一个历史目标。',
    explanation:
      '9 月 28 日发起的 Backfill 可以创建多个历史业务日期实例；当前选中的实例处理 9 月 25 日。它不必沿用原始触发时间。',
  },
] as const satisfies readonly DateSemanticsScenario[]

export type DateSemanticsScenarioId = (typeof DATE_SEMANTICS_SCENARIOS)[number]['id']

export interface DateSemanticsSnapshot {
  scenario: (typeof DATE_SEMANTICS_SCENARIOS)[number]
  currentDate: string
  partition: { column: typeof DATE_SEMANTICS_PARTITION_COLUMN; value: string }
  usesCurrentDateForPartition: boolean
  partitionMatchesBusinessDate: boolean
}

export function getDateSemanticsSnapshot(
  scenarioId: DateSemanticsScenarioId,
  useCurrentDateForPartition = false,
): DateSemanticsSnapshot {
  const scenario = DATE_SEMANTICS_SCENARIOS.find((candidate) => candidate.id === scenarioId)
  if (!scenario) {
    throw new Error(`未知的日期语义场景: ${scenarioId}`)
  }

  const currentDate = scenario.wallClock.slice(0, 10)
  const partitionValue = useCurrentDateForPartition ? currentDate : scenario.businessDate

  return {
    scenario,
    currentDate,
    partition: {
      column: DATE_SEMANTICS_PARTITION_COLUMN,
      value: partitionValue,
    },
    usesCurrentDateForPartition: useCurrentDateForPartition,
    partitionMatchesBusinessDate: partitionValue === scenario.businessDate,
  }
}
