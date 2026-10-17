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
