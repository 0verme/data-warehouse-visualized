/**
 * SQL Sandbox（Issue #35 Stage 1）真实结果 ↔ 确定性参考的对照语义。
 *
 * 输入是「真实 DuckDB 结果的行数 / 金额 / 目标口径命中」与
 * `getLayerSnapshots()` 给出的 DWS / ADS 参考。函数只做数值对照，
 * 不生成也不修改任何查询结果。
 */
import type { SqlResultSummary } from './types'

export interface SqlSandboxReferenceMetrics {
  dwsRowCount: number
  dwsTotalBalance: number
  adsRowCount: number
  adsTotalBalance: number
}

export type SqlSandboxComparisonKind =
  | 'exact'
  | 'same-total-different-grain'
  | 'ads-target'
  | 'no-balance-column'
  | 'different'
  | 'unavailable'

export interface SqlSandboxComparison {
  kind: SqlSandboxComparisonKind
  headline: string
  detail: string
}

export function compareSummaryToReference(
  summary: SqlResultSummary | null,
  reference: SqlSandboxReferenceMetrics,
): SqlSandboxComparison {
  if (!summary) {
    return {
      kind: 'unavailable',
      headline: '还没有可对照的运行结果',
      detail: '运行 SQL 后，这里会把真实结果与主课程的 DWS / ADS 参考并排显示。',
    }
  }

  if (summary.balanceColumn === null) {
    return {
      kind: 'no-balance-column',
      headline: '当前结果没有 balance 列，无法与参考金额对照',
      detail: `真实行数 ${summary.rowCount}。参考 DWS 为 ${reference.dwsRowCount} 行 / ${reference.dwsTotalBalance}。`,
    }
  }

  const total = summary.totalBalance ?? 0
  const targetRows = summary.targetScopeRowCount
  const targetBalance = summary.targetScopeBalance

  if (summary.rowCount === reference.dwsRowCount && total === reference.dwsTotalBalance) {
    const targetMatches =
      targetRows === reference.adsRowCount && targetBalance === reference.adsTotalBalance

    return {
      kind: 'exact',
      headline: '与 DWS 参考快照一致',
      detail: targetMatches
        ? `行数 ${summary.rowCount}、合计 ${total} 与参考一致，目标口径也正好收敛为 ${reference.adsRowCount} 行 / ${reference.adsTotalBalance}。`
        : `行数 ${summary.rowCount}、合计 ${total} 与参考一致；本次目标口径命中 ${targetRows} 行 / ${targetBalance ?? '—'}。`,
    }
  }

  if (
    summary.rowCount === reference.adsRowCount &&
    total === reference.adsTotalBalance &&
    targetRows === reference.adsRowCount &&
    targetBalance === reference.adsTotalBalance
  ) {
    return {
      kind: 'ads-target',
      headline: '命中 ADS 目标口径',
      detail: `整次查询正好收敛为 ${summary.rowCount} 行 / ${total}，与主课程 ADS 指标卡参考一致；DWS 里还有其它分组不在目标口径内。`,
    }
  }

  if (total === reference.dwsTotalBalance) {
    return {
      kind: 'same-total-different-grain',
      headline: '合计与参考一致，但行粒度不同',
      detail: `合计 ${total} 等于 DWS 参考合计，但行数为 ${summary.rowCount}，参考是 ${reference.dwsRowCount} 行——GROUP BY 的字段组合改变了“一行代表什么”。`,
    }
  }

  return {
    kind: 'different',
    headline: '与参考快照不一致',
    detail: `真实行数 ${summary.rowCount}（参考 ${reference.dwsRowCount}），真实合计 ${total}（参考 ${reference.dwsTotalBalance}），目标口径 ${targetRows} 行 / ${targetBalance ?? '—'}（参考 ${reference.adsRowCount} 行 / ${reference.adsTotalBalance}）。`,
  }
}
