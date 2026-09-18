/**
 * Interactive Visualization 2.0 · Phase 2C：Lineage Impact 逐层展开状态。
 *
 * 只描述「预测提交后向下逐层展开影响」这一确定性单调 reveal；Prediction
 * 交互、lineage domain 计算与 graph / canvas 渲染仍由 LineageTeachingLab
 * 与 `src/utils/lineage.ts` 负责。
 */

export interface LineageImpactRevealState {
  /** 当前步骤已经展开的下游节点，完整快照，不需要 replay 之前的步骤。 */
  readonly revealedNodeIds: readonly string[]
  /** 是否已经展开到最后一个下游对象。 */
  readonly complete: boolean
}
