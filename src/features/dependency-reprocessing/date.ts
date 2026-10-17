/**
 * 依赖链重做专题 · 业务日期工具（Phase 1-C）。
 *
 * 只做 `YYYY-MM-DD` 业务日期的确定性加减；不依赖本地时区与系统当前时间。
 */

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** 在业务日期上加减天数；日期格式非法时显式抛错。 */
export function shiftBusinessDate(businessDate: string, days: number): string {
  const match = BUSINESS_DATE_PATTERN.exec(businessDate)
  if (!match) {
    throw new Error(`业务日期格式无效: ${businessDate}`)
  }

  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

/** 生成以 `endBusinessDate` 结尾、长度为 `days` 的连续业务日期（升序）。 */
export function listBusinessDates(endBusinessDate: string, days: number): readonly string[] {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('days 必须是正整数')
  }
  return Array.from({ length: days }, (_, index) =>
    shiftBusinessDate(endBusinessDate, index - (days - 1)),
  )
}
