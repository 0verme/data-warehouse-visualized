import type {
  BankingCustomerAttributeUpdate,
  BankingCustomerHistoryChange,
  BankingCustomerHistoryVisualization,
  BankingCustomerVersion,
} from '../types'

export const BANKING_CUSTOMER_HISTORY_OPEN_END = '9999-12-31'

const CUSTOMER_DAY_MS = 24 * 60 * 60 * 1000
const CUSTOMER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

function padCustomerDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function formatCustomerDate(timestamp: number): string {
  const date = new Date(timestamp)

  return `${date.getUTCFullYear()}-${padCustomerDatePart(date.getUTCMonth() + 1)}-${padCustomerDatePart(date.getUTCDate())}`
}

/**
 * 维度历史的日期阶梯只接受 `YYYY-MM-DD` 的确定性教学日期，
 * 用 UTC 计算，避免本地时区把 2026-03-31 / 2026-04-01 这样的边界日期偏移到相邻天。
 */
function parseCustomerDate(value: string): number {
  if (!CUSTOMER_DATE_PATTERN.test(value)) {
    throw new RangeError(`维度历史日期需要 YYYY-MM-DD 格式，收到：${value}`)
  }

  const [year, month, day] = value.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)

  if (formatCustomerDate(timestamp) !== value) {
    throw new RangeError(`维度历史日期不是有效日历日期：${value}`)
  }

  return timestamp
}

export function addCustomerDays(date: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError(`维度历史日期只能按整数天偏移，收到：${days}`)
  }

  return formatCustomerDate(parseCustomerDate(date) + days * CUSTOMER_DAY_MS)
}

export function diffCustomerDays(from: string, to: string): number {
  return Math.round((parseCustomerDate(to) - parseCustomerDate(from)) / CUSTOMER_DAY_MS)
}

function isCustomerOpenEnd(date: string): boolean {
  return date === BANKING_CUSTOMER_HISTORY_OPEN_END
}

function parseTimestamp(value: string): number {
  const normalized = value.trim().replace(' ', 'T')
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized)
  const withTimezone = /^\d{4}-\d{2}-\d{2}$/u.test(normalized)
    ? `${normalized}T00:00:00Z`
    : hasTimezone
      ? normalized
      : `${normalized}Z`

  return Date.parse(withTimezone)
}

export function applyCustomerType1Update(
  version: BankingCustomerVersion,
  update: BankingCustomerAttributeUpdate,
): BankingCustomerVersion {
  return {
    ...version,
    ...update,
  }
}

export function applyCustomerType2Update(
  versions: readonly BankingCustomerVersion[],
  change: BankingCustomerHistoryChange,
): BankingCustomerVersion[] {
  const currentVersion = versions.find((version) => version.isCurrent)

  if (!currentVersion) {
    throw new Error('拉链表更新需要一个 isCurrent=true 的当前版本')
  }

  const changeTimestamp = parseTimestamp(change.effectiveFrom)
  const currentStartTimestamp = parseTimestamp(currentVersion.effectiveFrom)
  const currentEndTimestamp = parseTimestamp(currentVersion.effectiveTo)

  if (
    !Number.isFinite(changeTimestamp) ||
    !Number.isFinite(currentStartTimestamp) ||
    !Number.isFinite(currentEndTimestamp) ||
    changeTimestamp <= currentStartTimestamp ||
    changeTimestamp >= currentEndTimestamp
  ) {
    throw new RangeError('拉链表新版本的生效时间必须位于当前版本的有效区间内')
  }

  const { customerSk, effectiveFrom, ...attributeUpdate } = change
  const closedVersions = versions.map((version) =>
    version === currentVersion
      ? {
          ...version,
          effectiveTo: effectiveFrom,
          isCurrent: false,
        }
      : { ...version },
  )

  return [
    ...closedVersions,
    {
      ...currentVersion,
      ...attributeUpdate,
      customerSk,
      effectiveFrom,
      effectiveTo: BANKING_CUSTOMER_HISTORY_OPEN_END,
      isCurrent: true,
    },
  ]
}

export function getCustomerVersionAt(
  versions: readonly BankingCustomerVersion[],
  timestamp: string,
): BankingCustomerVersion | undefined {
  const targetTimestamp = parseTimestamp(timestamp)

  if (!Number.isFinite(targetTimestamp)) {
    return undefined
  }

  return versions.find((version) => {
    const effectiveFrom = parseTimestamp(version.effectiveFrom)
    const effectiveTo = parseTimestamp(version.effectiveTo)

    return (
      Number.isFinite(effectiveFrom) &&
      Number.isFinite(effectiveTo) &&
      effectiveFrom <= targetTimestamp &&
      targetTimestamp < effectiveTo
    )
  })
}

/**
 * 画面上的一条版本区间条。
 * 比例以视图窗口 `[windowStart, windowEnd]` 为分母，`endRatio` 对应 `end_date` 本身。
 * 由于命中语义是半开区间 `[start_date, end_date)`，相邻两个版本的 `endRatio` / `startRatio`
 * 会落在同一个位置上，视觉上区间相接但不重叠。
 */
export interface CustomerHistoryIntervalBar {
  version: BankingCustomerVersion
  ordinal: number
  startRatio: number
  endRatio: number
  isOpenEnd: boolean
  isActive: boolean
}

export interface CustomerHistoryCursorView {
  windowStart: string
  windowEnd: string
  totalDays: number
  boundaryDate: string
  boundaryDayBefore: string
  cursorDate: string
  hit: BankingCustomerVersion | undefined
  bars: CustomerHistoryIntervalBar[]
}

function clampRangeValue(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? Math.trunc(value) : min

  return Math.min(Math.max(safeValue, min), max)
}

/**
 * 把「激活的版本集合 + 日期游标下标」解析成渲染所需的确定性视图：
 * 当前业务日期、命中的版本，以及每个版本在视图窗口内的区间位置。
 */
export function getCustomerHistoryCursorView(
  visualization: Pick<
    BankingCustomerHistoryVisualization,
    'initialVersion' | 'change' | 'timeline'
  >,
  versions: readonly BankingCustomerVersion[],
  cursorIndex: number,
): CustomerHistoryCursorView {
  const windowStart = visualization.initialVersion.effectiveFrom
  const windowEnd = [
    visualization.change.effectiveFrom,
    ...visualization.timeline.map((point) => point.date),
  ].reduce(
    (latest, date) =>
      diffCustomerDays(windowStart, date) > diffCustomerDays(windowStart, latest) ? date : latest,
    windowStart,
  )
  const totalDays = Math.max(1, diffCustomerDays(windowStart, windowEnd))
  const cursorDate = addCustomerDays(windowStart, clampRangeValue(cursorIndex, 0, totalDays))
  const boundaryDate = visualization.change.effectiveFrom
  const hit = getCustomerVersionAt(versions, cursorDate)
  const bars = versions.map((version, index) => {
    const isOpenEnd = isCustomerOpenEnd(version.effectiveTo)
    const startOffset = clampRangeValue(
      diffCustomerDays(windowStart, version.effectiveFrom),
      0,
      totalDays,
    )
    const endOffset = isOpenEnd
      ? totalDays
      : Math.max(
          startOffset,
          clampRangeValue(diffCustomerDays(windowStart, version.effectiveTo), 0, totalDays),
        )

    return {
      version,
      ordinal: index + 1,
      startRatio: startOffset / totalDays,
      endRatio: endOffset / totalDays,
      isOpenEnd,
      isActive: hit?.customerSk === version.customerSk,
    }
  })

  return {
    windowStart,
    windowEnd,
    totalDays,
    boundaryDate,
    boundaryDayBefore: addCustomerDays(boundaryDate, -1),
    cursorDate,
    hit,
    bars,
  }
}
