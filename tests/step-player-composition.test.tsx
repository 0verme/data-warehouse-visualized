import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JoinFanoutSimulator } from '../src/components/visualizations/JoinFanoutSimulator'
import { SchedulerRunSimulator } from '../src/components/visualizations/SchedulerRunSimulator'
import { createBankingSchedulerVisualization } from '../src/features/scheduler/banking'

/**
 * #145 Pattern 2 — structural half of the contract.
 *
 * `tests/e2e/step-player-composition.mjs` proves the *geometry* (step control ↔
 * current Step state ≤ 1 viewport, state on screen, no automatic scroll). This
 * file proves the *structure* that keeps that geometry stable:
 *
 *   - the four focused scheduler lessons declare their current-Step state block
 *     (`[data-scheduler-step-change]`) **inside** the control card, between the
 *     clock / run status and the step buttons;
 *   - the failure lesson keeps the propagation strip directly under the control
 *     card instead of behind the run evidence;
 *   - the join Step Player keeps the equation summary directly under its toolbar
 *     and moves the changed result table above the source tables on phones via
 *     the documented container-query order contract (DOM and desktop reading
 *     order stay unchanged).
 *
 * Markup order is DOM order in the server-rendered output, so these stay fast
 * unit guards instead of browser tests.
 */

const COMPONENTS_DIR = join(import.meta.dirname, '..', 'src', 'components', 'visualizations')
const STYLES_DIR = join(import.meta.dirname, '..', 'src', 'styles', 'lessons')

function position(source: string, needle: string, from = 0): number {
  const index = source.indexOf(needle, from)
  expect(index, `markup 中缺少 ${needle}`).toBeGreaterThanOrEqual(0)
  return index
}

function expectOrder(source: string, markers: readonly string[]): void {
  let previous = -1
  for (const marker of markers) {
    const index = position(source, marker)
    expect(
      index,
      `DOM 顺序错误：${marker} 出现在前一个标记之前（${markers.join(' → ')}）`,
    ).toBeGreaterThan(previous)
    previous = index
  }
}

function componentSource(fileName: string): string {
  return readFileSync(join(COMPONENTS_DIR, fileName), 'utf8')
}

const FOCUSED_LESSONS = ['business-date', 'readiness', 'failure', 'sla'] as const

describe('#145 Pattern 2：Step Player / Timeline 移动端合成结构契约', () => {
  it.each(FOCUSED_LESSONS)(
    'SchedulerRunSimulator(%s)：本步变化块在控件卡内部、位于状态与按钮之间',
    (focus) => {
      const markup = renderToStaticMarkup(
        <SchedulerRunSimulator visualization={createBankingSchedulerVisualization(focus)} />,
      )

      const controlStart = position(markup, 'scheduler-focused-controls')
      const statusIndex = position(markup, 'RUN TIMELINE', controlStart)
      const changeIndex = position(markup, 'data-scheduler-step-change', controlStart)
      const buttonsIndex = position(markup, 'scheduler-toolbar__buttons', controlStart)

      expect(statusIndex).toBeLessThan(changeIndex)
      expect(changeIndex).toBeLessThan(buttonsIndex)
      // The declared primary state block is the current-Step change summary.
      expect(markup.slice(changeIndex, buttonsIndex)).toContain('scheduler-step-change__label')
      expect(markup).toContain('aria-live="polite"')
    },
  )

  it('SchedulerRunSimulator：初始状态也声明最近事件，不出现空白主状态块', () => {
    const markup = renderToStaticMarkup(
      <SchedulerRunSimulator visualization={createBankingSchedulerVisualization('readiness')} />,
    )

    expect(markup).toContain('data-scheduler-step-change')
    expect(markup).toContain('最近事件')
    expect(markup).toContain('queued')
  })

  it('SchedulerRunSimulator(failure)：传播链紧跟在控件卡之后、完整证据之前', () => {
    const markup = renderToStaticMarkup(
      <SchedulerRunSimulator visualization={createBankingSchedulerVisualization('failure')} />,
    )

    expectOrder(markup, [
      'scheduler-focused-controls',
      'scheduler-propagation',
      'scheduler-focused-evidence',
      'scheduler-dag',
      'scheduler-event-log',
    ])
  })

  it('SchedulerRunSimulator(rerun)：#144 的「执行计划 → 运行结论」顺序保持不变', () => {
    const markup = renderToStaticMarkup(
      <SchedulerRunSimulator visualization={createBankingSchedulerVisualization('rerun')} />,
    )

    expectOrder(markup, [
      'scheduler-rerun__plan',
      'scheduler-rerun__reason',
      'data-rerun-result',
      'scheduler-output-comparison',
      'scheduler-focused-controls',
    ])
  })

  it('JoinFanoutSimulator：equation 摘要紧跟控件，DOM 顺序与桌面阅读顺序保持不变', () => {
    const markup = renderToStaticMarkup(<JoinFanoutSimulator />)

    expectOrder(markup, [
      'join-fanout__toolbar',
      'join-fanout__progress',
      'join-fanout__equation',
      'join-fanout__tables',
      'join-fanout__result',
    ])
  })

  it('JoinFanoutSimulator：窄容器把结果表排到输入表之前（#145 移动端合成唯一策略）', () => {
    const stylesheet = readFileSync(join(STYLES_DIR, 'join-fanout.css'), 'utf8')
    const containerStart = position(stylesheet, '@container visualization (max-width: 660px)')
    const containerEnd = position(
      stylesheet,
      '@container visualization (max-width: 480px)',
      containerStart,
    )
    const mobileBlock = stylesheet.slice(containerStart, containerEnd)

    expect(mobileBlock).toContain('.join-fanout__result')
    expect(mobileBlock).toContain('order: 3')
    expect(mobileBlock).toContain('.join-fanout__tables')
    expect(mobileBlock).toContain('order: 4')
  })

  it('SchedulerRunSimulator：窄容器按 状态 → 本步变化 → 按钮 排列、本步变化块样式存在', () => {
    const stylesheet = readFileSync(join(STYLES_DIR, 'scheduler.css'), 'utf8')
    const containerStart = position(stylesheet, '@container visualization (max-width: 560px)')
    const mobileBlock = stylesheet.slice(containerStart)

    expect(stylesheet).toContain('.scheduler-step-change')
    expect(stylesheet).toContain("'status actions'")
    expect(mobileBlock).toMatch(/grid-template-areas:\s*'status'\s+'change'\s+'actions';/)
  })

  it('Pattern 2 由信息结构实现：两个 Step Player 不使用 scrollIntoView / 程序化 focus', () => {
    for (const fileName of ['JoinFanoutSimulator.tsx', 'SchedulerRunSimulator.tsx']) {
      const source = componentSource(fileName)
      expect(source, `${fileName} 不应使用 scrollIntoView`).not.toContain('scrollIntoView')
      expect(source, `${fileName} 不应使用 scrollTo`).not.toContain('scrollTo(')
      expect(source, `${fileName} 不应主动 focus 控件`).not.toMatch(/\.focus\(\)/)
    }
  })

  it('Step Kernel primitive 保持冻结：#119 §15.5 的导出面没有新增播放能力', () => {
    const primitive = readFileSync(
      join(import.meta.dirname, '..', 'src', 'utils', 'visualization-steps.ts'),
      'utf8',
    )
    const exported = [...primitive.matchAll(/export function (\w+)/g)].map((match) => match[1])

    expect(primitive).toContain("export type VisualizationPlayerAction = 'prev' | 'next' | 'reset'")
    expect(exported).toEqual([
      'createStepKernel',
      'createVisualizationPlayer',
      'applyVisualizationPlayerAction',
      'isVisualizationPlayerAtStart',
      'isVisualizationPlayerAtEnd',
      'getVisualizationPlayerProgress',
      'getCurrentVisualizationStep',
    ])
  })
})
