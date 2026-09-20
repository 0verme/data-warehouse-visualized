/**
 * 生产实践案例 13-1 · 7 步确定性教学序列。
 *
 * Step 1–2 只显示现象与第一批证据，不泄露根因；Step 3 揭示生命周期路径分叉；
 * Step 4 才展开 maintain.prepare 的规则缺口；Step 5 处理；Step 6 Rerun 与
 * 5 项验证；Step 7 给出最小防复发矩阵。
 *
 * 每一步都直接携带完整快照与 reveal 语义，prev / next / reset 只做 index 推进。
 */

import {
  createStepKernel,
  type StepKernel,
  type VisualizationStep,
} from '../../utils/visualization-steps'
import {
  MAINTAIN_PREPARE_RULE_GAP,
  accountBalanceSnapshotFixture,
  createDay1Run,
  createDay2FailedRun,
  createDay2RerunRun,
  createDay2ValidatedRun,
  rerunSameBusinessDate,
  runInitialize,
  validateMaintainWithFix,
  verifySnapshot,
} from './model'
import type {
  LifecycleDataset,
  LifecycleDayRun,
  LifecyclePathHighlight,
  LifecyclePathReveal,
  LifecycleSnapshotState,
} from './types'

export type LifecyclePathStep = VisualizationStep<LifecycleSnapshotState, LifecyclePathHighlight>

const fixture = accountBalanceSnapshotFixture

const NO_REVEAL: LifecyclePathReveal = {
  run: false,
  target: false,
  writeUnit: false,
  fix: false,
  rerun: false,
  verification: false,
  matrix: false,
}

function reveal(overrides: Partial<LifecyclePathReveal>): LifecyclePathReveal {
  return { ...NO_REVEAL, ...overrides }
}

export function buildLifecyclePathSteps(): readonly LifecyclePathStep[] {
  const day1Dataset = runInitialize(fixture)
  const failedDataset = day1Dataset
  const validation = validateMaintainWithFix(fixture, failedDataset)
  const validatedDataset = validation.dataset
  const { dataset: rerunDataset, idempotency } = rerunSameBusinessDate(fixture, validatedDataset)

  const day1Run = createDay1Run(fixture, day1Dataset)
  const day2Failed = createDay2FailedRun(fixture)
  const day2Validated = createDay2ValidatedRun(fixture, validatedDataset)
  const day2Rerun = createDay2RerunRun(fixture, rerunDataset)

  const verification = verifySnapshot(fixture, rerunDataset, day1Dataset.rows, idempotency)

  const snapshot = (
    day2: LifecycleDayRun,
    dataset: LifecycleDataset,
    includeVerification = false,
  ): LifecycleSnapshotState => ({
    day1: day1Run,
    day2,
    dataset,
    verification: includeVerification ? verification : [],
    idempotency: includeVerification ? idempotency : null,
  })

  return [
    {
      id: 'symptom',
      title: '现象：两天结果不同',
      description: `同一个任务 ${fixture.taskName}、同一段代码：${fixture.day1BusinessDate} 成功，${fixture.day2BusinessDate} 失败。先只看这两天发生了什么，不急着下结论。`,
      state: snapshot(day2Failed, failedDataset),
      highlight: { kind: 'symptom', focus: 'both', risk: false, reveal: reveal({}) },
    },
    {
      id: 'first-evidence',
      title: '第一批证据：先排除两个假设',
      description: `两天输入结构和契约一致，源端数据已经到达；Day 2 停在 ${day2Failed.phase}，rows written = ${day2Failed.rowsWritten}。输入结构变化不是当前首要嫌疑，也没有发生写了一半的部分写入。`,
      state: snapshot(day2Failed, failedDataset),
      highlight: { kind: 'evidence', focus: 'both', risk: true, reveal: reveal({ run: true }) },
    },
    {
      id: 'lifecycle-divergence',
      title: '判断：生命周期路径分叉',
      description: `Day 1 目标对象不存在，进入 initialize；Day 2 目标对象已经存在，进入 maintain。同一个任务因为生命周期状态不同走了两条不同路径，Day 1 从来没有执行过 maintain。`,
      state: snapshot(day2Failed, failedDataset),
      highlight: {
        kind: 'divergence',
        focus: 'both',
        risk: true,
        reveal: reveal({ run: true, target: true }),
      },
    },
    {
      id: 'prepare-rule-gap',
      title: '定位：展开 maintain.prepare',
      description: `目标对象已有的写入单元只有 ${failedDataset.writeUnits.join('、')}，本次 business_date 需要 ${fixture.day2BusinessDate}。${MAINTAIN_PREPARE_RULE_GAP} write 因此没有执行。`,
      state: snapshot(day2Failed, failedDataset),
      highlight: {
        kind: 'diagnose',
        focus: 'day2',
        risk: true,
        reveal: reveal({ run: true, target: true, writeUnit: true }),
      },
    },
    {
      id: 'fix-prepare-rule',
      title: '处理：修正准备规则',
      description: `把写入单元准备规则改成由 business_date 推导并确保当前写入单元存在；在「目标对象已经存在」条件下单独验证 maintain：prepare 通过，目标对象没有被重新创建。下一步才对 ${fixture.day2BusinessDate} 做 Rerun。`,
      state: snapshot(day2Validated, validatedDataset),
      highlight: {
        kind: 'fix',
        focus: 'day2',
        risk: false,
        reveal: reveal({ run: true, target: true, writeUnit: true, fix: true }),
      },
    },
    {
      id: 'rerun-and-verify',
      title: '验证：同业务日期 Rerun 与 5 项检查',
      description: `对 ${fixture.day2BusinessDate} 做同 business_date 的 Rerun，写入 ${day2Rerun.rowsWritten} 行。Job SUCCESS 之后继续检查 5 项数据结果，每项都给出由状态计算出的实际数值。`,
      state: snapshot(day2Rerun, rerunDataset, true),
      highlight: {
        kind: 'rerun',
        focus: 'day2',
        risk: false,
        reveal: reveal({
          run: true,
          target: true,
          writeUnit: true,
          fix: true,
          rerun: true,
          verification: true,
        }),
      },
    },
    {
      id: 'prevent-regression',
      title: '防复发：三状态最小矩阵',
      description:
        '生命周期任务至少覆盖 object not exists、object already exists、rerun same business_date 三种运行状态，不无限扩大测试矩阵。',
      state: snapshot(day2Rerun, rerunDataset, true),
      highlight: {
        kind: 'prevent',
        focus: 'both',
        risk: false,
        reveal: reveal({
          run: true,
          target: true,
          writeUnit: true,
          fix: true,
          rerun: true,
          verification: true,
          matrix: true,
        }),
      },
    },
  ]
}

export function createLifecyclePathKernel(): StepKernel<
  LifecycleSnapshotState,
  LifecyclePathHighlight
> {
  return createStepKernel(buildLifecyclePathSteps())
}
