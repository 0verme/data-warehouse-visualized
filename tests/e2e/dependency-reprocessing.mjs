#!/usr/bin/env node
/**
 * Dependency Reprocessing series browser contract (E1 + E2).
 *
 * Covers the two shipped experiment modes on desktop and phone widths:
 * - E1 incident timeline: step player advances / resets and stays usable;
 * - E2 impact scope: clicking the ODS source computes the four sets, the
 *   deduplicated redo list and the evidence panel.
 *
 * Layout / a11y guardrails checked on every viewport + theme:
 * - no page-level horizontal overflow and no node-level clipping;
 * - step and source controls keep a touch-friendly height;
 * - the primary aria-live region exists and no page errors are thrown.
 *
 * Opt-in and read-only: the script never writes progress or triggers real
 * scheduling; it only drives the study fixtures in the browser.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChecker, launchChromium, startPreview, trackPageErrors } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_NAME = 'dependency-reprocessing'
const E1_PATH = '/learn/reprocessing-incident-timeline/'
const E2_PATH = '/learn/reprocessing-impact-scope/'
const E3_PATH = '/learn/reprocessing-auto-stop-wait/'
const E4_PATH = '/learn/reprocessing-historical-parallel/'
const E5_PATH = '/learn/reprocessing-version-boundary/'
const E6_PATH = '/learn/reprocessing-downstream-reload/'
const E7_PATH = '/learn/reprocessing-rolling-backfill/'
const E8_PATH = '/learn/reprocessing-platform-design/'
const SOURCE_TASK_ID = 'ingest.ods-transaction.daily.v2'

const VIEWPORTS = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '320x720', width: 320, height: 720 },
]
const THEMES = ['light', 'dark']
const THEME_STORAGE_KEY = 'data-warehouse-visualized:theme'

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const baseArgIndex = args.indexOf('--base')
const externalBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : null
const preview = await startPreview({
  root: ROOT,
  base: externalBase,
  skipBuild,
  scriptName: SCRIPT_NAME,
})
const browser = await launchChromium()
const { check, report } = createChecker()

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement
    const controls = Array.from(
      document.querySelectorAll(
        '[data-reprocessing-mode] button, [data-reprocessing-mode] a.button',
      ),
    )
    const smallControls = controls
      .map((control) => {
        const rect = control.getBoundingClientRect()
        return {
          text: control.textContent?.trim() ?? '',
          width: rect.width,
          height: rect.height,
        }
      })
      .filter((control) => control.height > 0 && control.height < 24)

    return {
      overflow: root ? root.scrollWidth - window.innerWidth : 0,
      clippedNodes: Array.from(
        document.querySelectorAll('[data-reprocessing-chain] [data-node]'),
      ).filter((node) => node.scrollWidth - node.clientWidth > 1).length,
      smallControls,
      liveRegions: document.querySelectorAll('[data-reprocessing-mode] [aria-live="polite"]')
        .length,
    }
  })
}

async function checkSharedLayout(tag, page, errors) {
  const metrics = await layoutMetrics(page)
  check(`${tag} 无页面横向溢出`, metrics.overflow <= 1, `overflow=${metrics.overflow}`)
  check(`${tag} 节点无内部溢出`, metrics.clippedNodes === 0, `clipped=${metrics.clippedNodes}`)
  check(
    `${tag} 可操作控件高度 ≥24px`,
    metrics.smallControls.length === 0,
    metrics.smallControls.map((control) => control.text).join(', '),
  )
  check(`${tag} 存在主 aria-live 反馈`, metrics.liveRegions >= 1)
  check(`${tag} 无 pageerror`, errors.length === 0, errors.join('; '))
}

async function openLesson(browser, viewport, theme, path) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const errors = trackPageErrors(page)
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [THEME_STORAGE_KEY, theme],
  )
  await page.goto(`${preview.baseUrl}${path}`, { waitUntil: 'networkidle' })
  return { page, errors }
}

try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const tag = `${viewport.name} ${theme}`

      // ------------------------------------------------------------ E1
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E1_PATH)
        await page.waitForSelector('[data-reprocessing-mode="incident-timeline"]', {
          timeout: 20000,
        })
        const stepId = () => page.getAttribute('[data-reprocessing-mode]', 'data-step-id')

        check(`${tag} E1 初始步骤 arrival`, (await stepId()) === 'arrival')
        check(
          `${tag} E1 时间线节点 8 个`,
          (await page.locator('[data-reprocessing-chain] [data-node]').count()) === 8,
        )
        await page.getByRole('button', { name: '下一步' }).click()
        check(`${tag} E1 下一步到 validation-gap`, (await stepId()) === 'validation-gap')
        await page.getByRole('button', { name: '重置' }).click()
        check(`${tag} E1 重置回 arrival`, (await stepId()) === 'arrival')

        await checkSharedLayout(`${tag} E1`, page, errors)
        await page.close()
      }

      // ------------------------------------------------------------ E2
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E2_PATH)
        await page.waitForSelector('[data-reprocessing-mode="impact-scope"]', { timeout: 20000 })

        check(
          `${tag} E2 初始未圈定`,
          (
            (await page.locator('.dependency-reprocessing__scope-summary').textContent()) ?? ''
          ).includes('尚未选择源实例'),
        )
        check(
          `${tag} E2 源节点可选`,
          (await page.locator('[data-scope-chain] [data-node] button').count()) === 8,
        )

        await page.click(`[data-scope-chain] [data-node="${SOURCE_TASK_ID}"] button`)
        await page.waitForSelector('[data-panel="dedup-list"]', { timeout: 10000 })

        const setCount = async (setId) =>
          (await page.locator(`[data-set="${setId}"] header strong`).textContent())?.trim()
        check(`${tag} E2 停止集合 = 1`, (await setCount('stop')) === '1')
        check(`${tag} E2 重做集合 = 4`, (await setCount('redo')) === '4')
        check(`${tag} E2 等待集合 = 3`, (await setCount('waiting')) === '3')
        check(`${tag} E2 通知集合 = 2`, (await setCount('notify')) === '2')
        check(
          `${tag} E2 去重清单 8 个任务`,
          (await page
            .locator('[data-panel="dedup-list"] .dependency-reprocessing__dedup li')
            .count()) === 8,
        )
        check(
          `${tag} E2 调度依赖任务被标注`,
          await page.locator('[data-panel-detail="scheduler-only"]').isVisible(),
        )
        check(
          `${tag} E2 血缘证据可见`,
          (await page
            .locator('[data-panel="impact-evidence"] [data-evidence-kind="lineage"]')
            .count()) > 0,
        )
        check(
          `${tag} E2 调度证据可见`,
          (await page
            .locator('[data-panel="impact-evidence"] [data-evidence-kind="scheduler"]')
            .count()) > 0,
        )

        await page.getByRole('button', { name: '重置' }).click()
        check(
          `${tag} E2 重置回未圈定`,
          (
            (await page.locator('.dependency-reprocessing__scope-summary').textContent()) ?? ''
          ).includes('尚未选择源实例'),
        )

        await checkSharedLayout(`${tag} E2`, page, errors)
        await page.close()
      }

      // ------------------------------------------------------------ E3
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E3_PATH)
        await page.waitForSelector('[data-reprocessing-mode="stop-wait-redo"]', { timeout: 20000 })

        const phase = () => page.getAttribute('.dependency-reprocessing__phase', 'data-phase')
        const stateCount = (state) =>
          page.locator(`[data-swr-chain] [data-state="${state}"]`).count()

        check(`${tag} E3 初始阶段 detected`, (await phase()) === 'detected')
        check(`${tag} E3 初始等待 3`, (await stateCount('waiting')) === 3)
        check(`${tag} E3 初始运行中 1`, (await stateCount('running')) === 1)

        await page.getByRole('button', { name: '停止受影响任务' }).click()
        check(`${tag} E3 停止后阶段 stopped`, (await phase()) === 'stopped')
        check(`${tag} E3 停止后无运行中实例`, (await stateCount('running')) === 0)
        check(`${tag} E3 停止后等待 4`, (await stateCount('waiting')) === 4)

        await page.getByRole('button', { name: 'ODS 验证不通过' }).click()
        check(`${tag} E3 验证不通过被阻断`, (await phase()) === 'blocked')
        check(
          `${tag} E3 门禁面板展示失败项`,
          (await page.locator('[data-panel="gate-blocked"] [data-passed="false"]').count()) >= 1,
        )

        await page.getByRole('button', { name: 'ODS 验证通过' }).click()
        check(`${tag} E3 验证通过后放行`, (await phase()) === 'validated')

        await page.getByRole('button', { name: '生成重做计划' }).click()
        check(`${tag} E3 生成重做计划`, (await phase()) === 'scheduled')
        check(
          `${tag} E3 计划包含 8 个实例`,
          (await page.locator('[data-panel="redo-schedule"] li').count()) === 8,
        )

        await page.getByRole('button', { name: '执行重做' }).click()
        check(`${tag} E3 重做完成`, (await phase()) === 'completed')
        check(`${tag} E3 完成后 8 个 SUCCESS`, (await stateCount('success')) === 8)

        await checkSharedLayout(`${tag} E3`, page, errors)
        await page.close()
      }

      // ------------------------------------------------------------ E4
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E4_PATH)
        await page.waitForSelector('[data-reprocessing-mode="historical-parallel"]', {
          timeout: 20000,
        })

        check(
          `${tag} E4 默认历史模式 · 门禁阻断`,
          (await page.getAttribute('[data-panel="current-batch-gate"]', 'data-gate-status')) ===
            'blocked',
        )

        await page.getByRole('button', { name: '生成平行 Job / Plan' }).click()
        check(
          `${tag} E4 当日未完时计划被阻断`,
          (await page.getAttribute('[data-panel="parallel-plan"]', 'data-plan-status')) ===
            'blocked',
        )

        await page.getByRole('button', { name: '模拟当日跑批完成' }).click()
        check(
          `${tag} E4 模拟完成后门禁通过`,
          (await page.getAttribute('[data-panel="current-batch-gate"]', 'data-gate-status')) ===
            'completed',
        )

        await page.getByRole('button', { name: '生成平行 Job / Plan' }).click()
        check(
          `${tag} E4 平行计划生成`,
          (await page.getAttribute('[data-panel="parallel-plan"]', 'data-plan-status')) ===
            'allowed',
        )
        check(
          `${tag} E4 平行计划 8 个实例`,
          (await page.locator('[data-plan-items] li').count()) === 8,
        )
        check(
          `${tag} E4 绑定历史日期 2026-10-10`,
          (await page.locator('[data-plan-items] li[data-target-date="2026-10-10"]').count()) === 8,
        )
        check(
          `${tag} E4 隔离说明可见`,
          await page.locator('[data-plan-note="isolation"]').isVisible(),
        )

        await page.selectOption('[data-role="target-date"]', '2026-10-15')
        await page.getByRole('button', { name: '生成平行 Job / Plan' }).click()
        check(
          `${tag} E4 切换日期后绑定 2026-10-15`,
          (await page.locator('[data-plan-items] li[data-target-date="2026-10-15"]').count()) === 8,
        )

        await page.getByRole('button', { name: '当日重做' }).click()
        check(
          `${tag} E4 当日模式面板可见`,
          await page.locator('[data-panel="current-mode"]').isVisible(),
        )

        await checkSharedLayout(`${tag} E4`, page, errors)
        await page.close()
      }

      // ------------------------------------------------------------ E5
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E5_PATH)
        await page.waitForSelector('[data-reprocessing-mode="version-boundary"]', {
          timeout: 20000,
        })

        const verdict = () => page.getAttribute('[data-panel="version-verdict"]', 'data-verdict')

        check(`${tag} E5 默认 SQL 逻辑调整兼容`, (await verdict()) === 'compatible')
        check(
          `${tag} E5 兼容时可生成平行计划`,
          (await page.locator('[data-plan-items] li').count()) === 8,
        )

        await page.click('[data-change-type="major-refactor"]')
        check(`${tag} E5 重大重构禁止直接重做`, (await verdict()) === 'forbidden')
        check(
          `${tag} E5 禁止时给出专项修复动作`,
          await page.locator('[data-role="required-action"]').isVisible(),
        )
        check(
          `${tag} E5 禁止时无平行计划`,
          (await page.locator('[data-plan-items] li').count()) === 0,
        )

        await page.getByRole('button', { name: '模拟仅凭 SQL 试跑通过' }).click()
        check(
          `${tag} E5 试跑结论可见且不改变判定`,
          (await page.locator('[data-role="trial-note"]').isVisible()) &&
            (await verdict()) === 'forbidden',
        )

        await page.click('[data-change-type="schema-breaking"]')
        check(`${tag} E5 表结构破坏性变更禁止`, (await verdict()) === 'forbidden')
        check(
          `${tag} E5 切换类型后试跑结论清除`,
          (await page.locator('[data-role="trial-note"]').count()) === 0,
        )

        await page.click('[data-change-type="none"]')
        check(`${tag} E5 无变更恢复兼容`, (await verdict()) === 'compatible')
        check(
          `${tag} E5 恢复兼容后计划重新出现`,
          (await page.locator('[data-plan-items] li').count()) === 8,
        )

        await checkSharedLayout(`${tag} E5`, page, errors)
        await page.close()
      }

      // ------------------------------------------------------------ E6
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E6_PATH)
        await page.waitForSelector('[data-reprocessing-mode="consumer-closure"]', {
          timeout: 20000,
        })

        check(`${tag} E6 六类消费方可见`, (await page.locator('[data-consumer-id]').count()) === 6)
        check(
          `${tag} E6 初始待确认 4 个`,
          ((await page.locator('[data-role="closure-status"]').textContent()) ?? '').includes(
            '待确认 4 个',
          ),
        )
        check(
          `${tag} E6 初始未闭环`,
          (await page.getAttribute('[data-panel="downstream-closure"]', 'data-all-confirmed')) ===
            'false',
        )

        await page.click('[data-consumer-id="interface.push"] button')
        check(
          `${tag} E6 单项确认生效`,
          (await page.getAttribute('[data-consumer-id="interface.push"]', 'data-confirmation')) ===
            'confirmed',
        )
        check(
          `${tag} E6 待确认降为 3`,
          ((await page.locator('[data-role="closure-status"]').textContent()) ?? '').includes(
            '待确认 3 个',
          ),
        )

        await page.getByRole('button', { name: '一键确认全部受影响消费方' }).click()
        check(
          `${tag} E6 全部确认后闭环`,
          (await page.getAttribute('[data-panel="downstream-closure"]', 'data-all-confirmed')) ===
            'true',
        )
        check(
          `${tag} E6 闭环状态可解释`,
          ((await page.locator('[data-role="closure-status"]').textContent()) ?? '').includes(
            '消费端恢复闭环已完成',
          ),
        )

        await page.getByRole('button', { name: '重置' }).click()
        check(
          `${tag} E6 重置回到待确认`,
          (await page.getAttribute('[data-panel="downstream-closure"]', 'data-all-confirmed')) ===
            'false',
        )

        await checkSharedLayout(`${tag} E6`, page, errors)
        await page.close()
      }

      // ------------------------------------------------------------ E7
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E7_PATH)
        await page.waitForSelector('[data-reprocessing-mode="rolling-backfill"]', {
          timeout: 20000,
        })

        check(
          `${tag} E7 默认 7 天窗口`,
          (await page.locator('[data-role="rolling-order"] li').count()) === 7,
        )
        check(
          `${tag} E7 跨天依赖 6 条`,
          (await page.locator('[data-panel="cross-day-dependencies"] li').count()) === 6,
        )

        await page.getByRole('button', { name: '检查并行可行性' }).click()
        check(
          `${tag} E7 简单并行判定为不可并行`,
          (await page.getAttribute('[data-panel="parallel-check"]', 'data-check')) === 'unsafe',
        )
        check(
          `${tag} E7 列出 6 条跨天冲突`,
          (await page.locator('[data-role="parallel-conflicts"] li').count()) === 6,
        )

        await page.getByRole('button', { name: '执行下一日' }).click()
        check(
          `${tag} E7 按顺序完成第一日`,
          (await page.getAttribute('li[data-date="2026-10-10"]', 'data-completed')) === 'true',
        )

        await page.getByRole('button', { name: '一键按顺序完成' }).click()
        check(
          `${tag} E7 全部日期完成`,
          (await page.locator('[data-role="rolling-order"] li[data-completed="true"]').count()) ===
            7,
        )
        check(
          `${tag} E7 完成状态可解释`,
          ((await page.locator('[data-role="rolling-status"]').textContent()) ?? '').includes(
            '补数完成',
          ),
        )

        await page.click('[data-window-size="3"]')
        check(
          `${tag} E7 切换 3 天窗口`,
          (await page.locator('[data-role="rolling-order"] li').count()) === 3,
        )
        check(
          `${tag} E7 切换窗口后依赖同步`,
          (await page.locator('[data-panel="cross-day-dependencies"] li').count()) === 2,
        )

        await checkSharedLayout(`${tag} E7`, page, errors)
        await page.close()
      }

      // ------------------------------------------------------------ E8
      {
        const { page, errors } = await openLesson(browser, viewport, theme, E8_PATH)
        await page.waitForSelector('[data-reprocessing-mode="platform-design"]', {
          timeout: 20000,
        })

        check(`${tag} E8 六个平台能力可见`, (await page.locator('[data-pillar]').count()) === 6)
        check(
          `${tag} E8 默认聚焦影响分析`,
          (await page.getAttribute('[data-panel="platform-pillar"]', 'data-pillar-id')) ===
            'impact-analysis',
        )
        check(
          `${tag} E8 真实 / 演示 / 边界三层可读`,
          (await page.locator('[data-role="real-experience"]').count()) === 1 &&
            (await page.locator('[data-role="demo-architecture"]').count()) === 1 &&
            (await page.locator('[data-role="boundary"]').count()) === 1,
        )

        await page.click('[data-pillar="run-control"]')
        check(
          `${tag} E8 切换到运行控制`,
          (await page.getAttribute('[data-panel="platform-pillar"]', 'data-pillar-id')) ===
            'run-control',
        )
        check(
          `${tag} E8 状态行同步`,
          ((await page.locator('[data-role="platform-status"]').textContent()) ?? '').includes(
            '运行控制',
          ),
        )

        await page.click('[data-pillar="recovery-closure"]')
        check(
          `${tag} E8 切换到恢复闭环`,
          (await page.getAttribute('[data-panel="platform-pillar"]', 'data-pillar-id')) ===
            'recovery-closure',
        )

        await checkSharedLayout(`${tag} E8`, page, errors)
        await page.close()
      }
    }
  }

  // ------------------------------------------------------------ E3 failure + re-repair journey
  {
    const viewport = { width: 1280, height: 800 }
    const { page, errors } = await openLesson(browser, viewport, 'light', E3_PATH)
    await page.waitForSelector('[data-reprocessing-mode="stop-wait-redo"]', { timeout: 20000 })
    const tag = '1280x800 light 失败旅程'
    const phase = () => page.getAttribute('.dependency-reprocessing__phase', 'data-phase')

    await page.getByRole('button', { name: '停止受影响任务' }).click()
    await page.getByRole('button', { name: 'ODS 验证通过' }).click()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '生成重做计划' }).click()
    await page.getByRole('button', { name: '执行重做' }).click()

    check(`${tag} 失败阶段 failed`, (await phase()) === 'failed')
    check(
      `${tag} DWD 处于 FAILED`,
      (await page.locator('[data-swr-chain] [data-state="failed"]').count()) === 1,
    )
    // ingest / check 重做成功，dwsChannel 事故前已成功且未到重做点；全部保持 SUCCESS。
    check(
      `${tag} 已成功上游保持 SUCCESS`,
      (await page.locator('[data-swr-chain] [data-state="success"]').count()) === 3,
    )

    await page.getByRole('button', { name: '重试失败任务' }).click()
    check(`${tag} 重试后 completed`, (await phase()) === 'completed')

    await page.getByRole('button', { name: 'ODS 再次修复' }).click()
    check(`${tag} 再次修复后 repaired`, (await phase()) === 'repaired')
    check(
      `${tag} 再次修复后 8 个等待`,
      (await page.locator('[data-swr-chain] [data-state="waiting"]').count()) === 8,
    )

    await page.getByRole('button', { name: '重新入队' }).click()
    check(`${tag} 重新入队 scheduled`, (await phase()) === 'scheduled')
    await page.getByRole('button', { name: '执行重做' }).click()
    check(`${tag} 重新重做 completed`, (await phase()) === 'completed')
    check(
      `${tag} 重新重做后 8 个 SUCCESS`,
      (await page.locator('[data-swr-chain] [data-state="success"]').count()) === 8,
    )
    check(`${tag} 无 pageerror`, errors.length === 0, errors.join('; '))
    await page.close()
  }

  // ------------------------------------------------------------ reduced motion
  {
    const { page, errors } = await openLesson(
      browser,
      { width: 320, height: 720 },
      'light',
      E1_PATH,
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForSelector('[data-reprocessing-mode="incident-timeline"]', { timeout: 20000 })
    await page.getByRole('button', { name: '下一步' }).click()
    check(
      '320x720 reduced-motion 步骤仍可推进',
      (await page.getAttribute('[data-reprocessing-mode]', 'data-step-id')) === 'validation-gap',
    )
    check('320x720 reduced-motion 无 pageerror', errors.length === 0)
    await page.close()
  }
} finally {
  await browser.close()
  preview.stop()
}

const failures = report(SCRIPT_NAME)
process.exit(failures === 0 ? 0 : 1)
