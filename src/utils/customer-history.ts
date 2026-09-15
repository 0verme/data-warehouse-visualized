import type {
  BankingCustomerAttributeUpdate,
  BankingCustomerHistoryChange,
  BankingCustomerVersion,
} from '../types'

export const BANKING_CUSTOMER_HISTORY_OPEN_END = '9999-12-31'

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
