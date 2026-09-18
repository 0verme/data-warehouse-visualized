/**
 * Interactive Visualization 2.0 · Phase 1 Golden Sample domain.
 *
 * This feature owns an independent teaching fixture and step kernel for the
 * M:N JOIN amplification experiment. It intentionally does not read or change
 * `src/data/deposit-balance.ts`, which is shared by the existing
 * `sql-transformation` lessons.
 */

export interface JoinFanoutLeftRow {
  readonly id: string
  readonly customerId: string
  readonly accountId: string
  readonly balance: number
}

export interface JoinFanoutRightRow {
  readonly id: string
  readonly customerId: string
  /** 原始行是单个标签；聚合到 key 粒度后可以承载多个标签。 */
  readonly tags: readonly string[]
}

export interface JoinFanoutResultRow {
  readonly id: string
  readonly leftRowId: string
  readonly rightRowId: string
  readonly customerId: string
  readonly accountId: string
  readonly balance: number
  readonly tags: readonly string[]
}

export interface JoinFanoutFixture {
  readonly leftTableName: string
  readonly leftTableLabel: string
  readonly leftGrain: string
  readonly rightTableName: string
  readonly rightTableLabel: string
  readonly rightGrain: string
  readonly joinKey: string
  readonly leftRows: readonly JoinFanoutLeftRow[]
  readonly rightRows: readonly JoinFanoutRightRow[]
}

/**
 * `matchedLeftRows × rightRows = resultRows` 是 Golden Sample 的核心数字关系。
 * 三个数字都由 `joinFanoutRows()` 在 fixture 上真实计算得出，UI 不硬编码结果。
 */
export interface JoinFanoutCounts {
  readonly leftRows: number
  readonly matchedLeftRows: number
  readonly rightRows: number
  readonly resultRows: number
}

export interface JoinFanoutState {
  readonly leftRows: readonly JoinFanoutLeftRow[]
  readonly rightRows: readonly JoinFanoutRightRow[]
  readonly resultRows: readonly JoinFanoutResultRow[]
  readonly counts: JoinFanoutCounts
}

export type JoinFanoutStepKind = 'observe' | 'match' | 'expand' | 'diagnose' | 'fix'

export interface JoinFanoutHighlight {
  readonly kind: JoinFanoutStepKind
  readonly joinKey: string
  readonly leftRowIds: readonly string[]
  readonly rightRowIds: readonly string[]
  readonly resultRowIds: readonly string[]
  /** 根因步骤使用风险语义；其余步骤为 false。 */
  readonly risk: boolean
}

/** Lesson section payload: the fixture and step kernel are self-contained. */
export interface JoinFanoutVisualization {
  readonly kind: 'join-fanout'
}
