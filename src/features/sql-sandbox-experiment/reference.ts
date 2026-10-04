/**
 * 实验的确定性参考答案（Stage 0 harness / Stage 1 教学闭环共用）。
 *
 * 默认 SQL 直接取现有 `aggregate-layers` 步骤，参考行数 / 金额来自
 * `getLayerSnapshots()` 的 DWS / ADS 快照，避免在实验目录维护第二份口径。
 */
import { DEPOSIT_BALANCE_SCOPE, depositBalanceDataset } from '../../data/deposit-balance'
import { getLayerSnapshots, getTransformationStep } from '../../utils/sql-transformation'
import type { SqlTargetScope } from './types'

export interface SqlSandboxReference {
  tableName: string
  defaultSql: string
  dws: { rowCount: number; totalBalance: number }
  ads: { rowCount: number; totalBalance: number }
  targetScope: SqlTargetScope
}

/** Stage 0 名称，保留兼容；Stage 1 教学 UI 使用 `getSqlSandboxReference()`。 */
export type Stage0Reference = SqlSandboxReference

function sumBalance(rows: readonly Record<string, unknown>[]): number {
  return rows.reduce((total, row) => {
    const value = row.balance
    return typeof value === 'number' && Number.isFinite(value) ? total + value : total
  }, 0)
}

export function getSqlSandboxReference(): SqlSandboxReference {
  const snapshots = getLayerSnapshots(depositBalanceDataset)
  const dws = snapshots.find((snapshot) => snapshot.layer === 'dws')?.tables[0]
  const ads = snapshots.find((snapshot) => snapshot.layer === 'ads')?.tables[0]
  const defaultStep = getTransformationStep('aggregate-layers')

  if (!dws || !ads || !defaultStep) {
    throw new Error('Stage 0 参考答案初始化失败：缺少 DWS / ADS 快照或 aggregate-layers 步骤')
  }

  return {
    tableName: 'dwd_deposit_balance_detail',
    defaultSql: defaultStep.sql,
    dws: { rowCount: dws.rows.length, totalBalance: sumBalance(dws.rows) },
    ads: { rowCount: ads.rows.length, totalBalance: sumBalance(ads.rows) },
    targetScope: { ...DEPOSIT_BALANCE_SCOPE },
  }
}

/** @deprecated Stage 0 名称，保留兼容。 */
export const getStage0Reference = getSqlSandboxReference
