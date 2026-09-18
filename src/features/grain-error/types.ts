/**
 * Interactive Visualization 2.0 · Phase 2B：Grain 错误演示的三步骨架。
 *
 * 只抽「错误模型 → 执行聚合暴露问题 → 修复到目标 Grain」的推进结构；表格、
 * SQL 与课程文案仍由各 visualization 自己负责。每一步都携带确定性的完整
 * 结果快照（result），player 只负责在三个步骤之间做 index 推进。
 */

export interface GrainErrorHighlight {
  /** 错误模型 / 计算暴露阶段为 true；修复阶段为 false。 */
  readonly risk: boolean
}

export interface GrainErrorStepState<Id extends string, Result> {
  /** 当前步骤的 domain id，用于保留各 visualization 原有的 class 与条件分支。 */
  readonly step: Id
  /** 该步骤对应的确定性完整结果快照。 */
  readonly result: Result
}

export interface GrainErrorStepSpec<Id extends string> {
  readonly id: Id
  readonly title: string
  /** 当前步骤的一句话解释，进入 aria-live 状态文案。 */
  readonly description: string
  readonly risk: boolean
}
