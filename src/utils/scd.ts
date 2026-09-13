import type { ScdAttributeUpdate, ScdDimensionVersion } from '../types'

export const SCD_OPEN_END = '9999-12-31'

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

/**
 * 直接覆盖维度属性。它返回新对象，不改变传入的历史快照。
 */
export function applyType1Update(
  version: ScdDimensionVersion,
  update: ScdAttributeUpdate,
): ScdDimensionVersion {
  return {
    ...version,
    ...update,
  }
}

/**
 * 关闭当前版本并插入一个新版本，时间区间采用 [effectiveFrom, effectiveTo)。
 */
export function applyType2Update(
  versions: readonly ScdDimensionVersion[],
  update: ScdAttributeUpdate,
  effectiveFrom: string,
): ScdDimensionVersion[] {
  const currentVersion = versions.find((version) => version.isCurrent)

  if (!currentVersion) {
    throw new Error('SCD Type 2 更新需要一个 isCurrent=true 的当前版本')
  }

  const updateTimestamp = parseTimestamp(effectiveFrom)
  const currentStartTimestamp = parseTimestamp(currentVersion.effectiveFrom)
  const currentEndTimestamp = parseTimestamp(currentVersion.effectiveTo)

  if (
    !Number.isFinite(updateTimestamp) ||
    !Number.isFinite(currentStartTimestamp) ||
    !Number.isFinite(currentEndTimestamp) ||
    updateTimestamp <= currentStartTimestamp ||
    updateTimestamp >= currentEndTimestamp
  ) {
    throw new RangeError('SCD Type 2 的新版本开始时间必须位于当前版本的有效区间内')
  }

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
      ...update,
      effectiveFrom,
      effectiveTo: SCD_OPEN_END,
      isCurrent: true,
    },
  ]
}

/**
 * 按半开区间查找某个时间点有效的维度版本。
 */
export function getDimensionVersionAt(
  versions: readonly ScdDimensionVersion[],
  timestamp: string,
): ScdDimensionVersion | undefined {
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
