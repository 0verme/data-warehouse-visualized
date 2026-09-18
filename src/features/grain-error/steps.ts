import {
  createStepKernel,
  type StepKernel,
  type VisualizationStep,
} from '../../utils/visualization-steps'
import type { GrainErrorHighlight, GrainErrorStepSpec, GrainErrorStepState } from './types'

export type GrainErrorStep<Id extends string, Result> = VisualizationStep<
  GrainErrorStepState<Id, Result>,
  GrainErrorHighlight
>

/** 三个步骤的顺序是「错误 → 暴露 → 修复」，不允许少一个或多一个。 */
export type GrainErrorStepSpecs<Id extends string> = readonly [
  GrainErrorStepSpec<Id>,
  GrainErrorStepSpec<Id>,
  GrainErrorStepSpec<Id>,
]

/**
 * 3 步 Grain 错误演示：错误模型 → 执行聚合 → 修复。
 * 三个步骤共享同一份确定性 result 快照，避免各组件各自维护步骤枚举。
 */
export function buildGrainErrorSteps<Id extends string, Result>(
  result: Result,
  specs: GrainErrorStepSpecs<Id>,
): readonly GrainErrorStep<Id, Result>[] {
  return specs.map((spec) => ({
    id: spec.id,
    title: spec.title,
    description: spec.description,
    state: { step: spec.id, result },
    highlight: { risk: spec.risk },
  }))
}

export function createGrainErrorKernel<Id extends string, Result>(
  result: Result,
  specs: GrainErrorStepSpecs<Id>,
): StepKernel<GrainErrorStepState<Id, Result>, GrainErrorHighlight> {
  return createStepKernel(buildGrainErrorSteps(result, specs))
}
