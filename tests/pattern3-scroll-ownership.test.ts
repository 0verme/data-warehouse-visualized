import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('#146 Pattern 3：Nested Scroll / Gesture Ownership', () => {
  it('Scheduler event log expands in document flow instead of owning a vertical scroll region', () => {
    const css = readProjectFile('src/styles/lessons/scheduler.css')
    const rule = css.match(/\.scheduler-event-log ol\s*\{([^}]*)\}/)?.[1]

    expect(rule).toBeDefined()
    expect(rule).not.toMatch(/max-height\s*:/)
    expect(rule).not.toMatch(/overflow-y\s*:\s*(auto|scroll)/)
  })

  it('long horizontal rails disclose overflow and can receive keyboard focus', () => {
    const capstone = readProjectFile('src/components/visualizations/CapstoneWorkbench.tsx')
    const governance = readProjectFile('src/components/visualizations/GovernanceWorkbench.tsx')
    const lineage = readProjectFile('src/components/visualizations/LineageTeachingLab.tsx')
    const compactCss = readProjectFile('src/styles/components/visualization-compact.css')

    expect(capstone).toContain('横向查看其余 checkpoint')
    expect(capstone).toContain('checkpointNavRef')
    expect(capstone).toContain('prefers-reduced-motion: reduce')
    expect(governance).toContain('className="pattern3-scroll-hint"')
    expect(governance).toContain('tabIndex={0}')
    expect(lineage).toContain('className="pattern3-scroll-hint"')
    expect(lineage).toContain('tabIndex={0}')
    expect(compactCss).toContain('@container visualization (max-width: 660px)')
    expect(compactCss).toContain('.pattern3-scroll-hint')
  })

  it('wide tables expose a named keyboard-scroll region only when measured overflow exists', () => {
    const region = readProjectFile('src/components/visualizations/HorizontalScrollRegion.tsx')
    const sql = readProjectFile('src/components/visualizations/SqlTransformationWorkbench.tsx')
    const lakehouse = readProjectFile('src/components/visualizations/LakehouseArchitectureLab.tsx')
    const banking = readProjectFile('src/components/visualizations/BankingMetricLabs.tsx')

    expect(region).toContain('viewport.scrollWidth > viewport.clientWidth + 1')
    expect(region).toContain("role={isScrollable ? 'region' : undefined}")
    expect(region).toContain('aria-label={isScrollable ? label : undefined}')
    expect(region).toContain('tabIndex={isScrollable ? 0 : undefined}')
    expect(region).toContain('new ResizeObserver(updateScrollability)')
    expect(sql).toContain('<HorizontalScrollRegion')
    expect(lakehouse).toContain('dataDetailRole="comparison"')
    expect(banking).toContain('className="banking-lab__table-wrap"')
  })
})
