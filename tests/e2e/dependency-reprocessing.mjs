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
    }
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
