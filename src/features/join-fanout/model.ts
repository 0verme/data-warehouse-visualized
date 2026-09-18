import type {
  JoinFanoutFixture,
  JoinFanoutLeftRow,
  JoinFanoutResultRow,
  JoinFanoutRightRow,
  JoinFanoutState,
} from './types'

/**
 * Minimal M:N teaching fixture:
 *
 * ```
 * 左表 account                右表 customer_tag
 * customer_id | account_id    customer_id | tag
 * A           | A-001         A           | X
 * A           | A-002         A           | Y
 * ```
 *
 * 两边都不是唯一 key，所以按 customer_id JOIN 会得到 2 × 2 = 4 行。
 * 数据保持最小，只保留能解释放大机制所需的列。
 */
export const joinFanoutFixture: JoinFanoutFixture = {
  leftTableName: 'account',
  leftTableLabel: '账户表（左表）',
  leftGrain: '一行 = 一个账户',
  rightTableName: 'customer_tag',
  rightTableLabel: '客户标签表（右表）',
  rightGrain: '一行 = 一个客户标签',
  joinKey: 'customer_id',
  leftRows: [
    { id: 'L1', customerId: 'A', accountId: 'A-001', balance: 100 },
    { id: 'L2', customerId: 'A', accountId: 'A-002', balance: 200 },
  ],
  rightRows: [
    { id: 'R1', customerId: 'A', tags: ['X'] },
    { id: 'R2', customerId: 'A', tags: ['Y'] },
  ],
}

/**
 * 逐 key 匹配（嵌套循环 Join）。输出行数完全来自实际匹配次数，
 * 不在任何地方写死 4。
 */
export function joinFanoutRows(
  leftRows: readonly JoinFanoutLeftRow[],
  rightRows: readonly JoinFanoutRightRow[],
): JoinFanoutResultRow[] {
  const rightRowsByKey = new Map<string, JoinFanoutRightRow[]>()
  for (const rightRow of rightRows) {
    const bucket = rightRowsByKey.get(rightRow.customerId) ?? []
    bucket.push(rightRow)
    rightRowsByKey.set(rightRow.customerId, bucket)
  }

  const resultRows: JoinFanoutResultRow[] = []
  for (const leftRow of leftRows) {
    for (const rightRow of rightRowsByKey.get(leftRow.customerId) ?? []) {
      resultRows.push({
        id: `${leftRow.id}×${rightRow.id}`,
        leftRowId: leftRow.id,
        rightRowId: rightRow.id,
        customerId: leftRow.customerId,
        accountId: leftRow.accountId,
        balance: leftRow.balance,
        tags: rightRow.tags,
      })
    }
  }

  return resultRows
}

/**
 * Step 6 的修复方式：右表先按 join key 聚合到目标结果所需的粒度，
 * 每个 key 只保留一行；这样 2 个账户 × 1 行聚合标签 = 2 行输出。
 */
export function aggregateRightByKey(
  rightRows: readonly JoinFanoutRightRow[],
): JoinFanoutRightRow[] {
  const tagsByKey = new Map<string, string[]>()
  for (const rightRow of rightRows) {
    const tags = tagsByKey.get(rightRow.customerId) ?? []
    tags.push(...rightRow.tags)
    tagsByKey.set(rightRow.customerId, tags)
  }

  return [...tagsByKey.entries()].map(([customerId, tags]) => ({
    id: `AGG:${customerId}`,
    customerId,
    tags,
  }))
}

/**
 * 确定性完整快照：给定「已匹配的左表行数」和当前右表，就能直接得到
 * resultRows 与 counts，不需要 replay 之前的步骤。
 */
export function createJoinFanoutState(
  leftRows: readonly JoinFanoutLeftRow[],
  rightRows: readonly JoinFanoutRightRow[],
  matchedLeftRows: number,
): JoinFanoutState {
  const normalizedMatched = Math.min(Math.max(Math.trunc(matchedLeftRows), 0), leftRows.length)
  const resultRows = joinFanoutRows(leftRows.slice(0, normalizedMatched), rightRows)

  return {
    leftRows,
    rightRows,
    resultRows,
    counts: {
      leftRows: leftRows.length,
      matchedLeftRows: normalizedMatched,
      rightRows: rightRows.length,
      resultRows: resultRows.length,
    },
  }
}
