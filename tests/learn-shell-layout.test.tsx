import { readFileSync, readdirSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import { LearnShell } from '../src/components/course/LearnShell'

function renderLearnShell(): string {
  const lesson = getLessonBySlug('why-data-warehouse')

  if (!lesson) {
    throw new Error('Unknown lesson: why-data-warehouse')
  }

  return renderToStaticMarkup(
    <LearnShell
      lessons={lessons}
      initialLesson={lesson}
      initialContent={getLessonContent(lesson)}
    />,
  )
}

describe('学习页 Learning Shell 布局', () => {
  it('将课程正文滚动区与三段式底部导航分开，并移除学习页 Footer', () => {
    const markup = renderLearnShell()
    const scrollStart = markup.indexOf('class="learn-main__scroll"')
    const navigationStart = markup.indexOf('class="lesson-nav"')

    expect(scrollStart).toBeGreaterThanOrEqual(0)
    expect(navigationStart).toBeGreaterThan(scrollStart)
    expect(markup).toContain('class="lesson-nav__link lesson-nav__link--previous')
    expect(markup).toContain('class="complete-button')
    expect(markup).toContain('class="lesson-nav__link lesson-nav__link--next"')
    expect(markup).not.toContain('class="site-footer')
    expect(markup).not.toContain('learn-footer')
  })

  it('移除速览与正文小节的装饰性编号，并保留原有内容', () => {
    const markup = renderLearnShell()

    expect(markup).toContain('class="quick-summary"')
    expect(markup).toContain('一句话速览')
    expect(markup).not.toContain('quick-summary__mark')
    expect(markup).not.toContain('lesson-section__index')
  })

  it('保留首页 Footer 的使用入口', () => {
    const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')

    expect(homepage).toContain('<SiteFooter variant="home" />')
  })

  it('使用固定视口与独立滚动布局，底栏不依赖 fixed 或 sidebar 偏移', () => {
    const stylesheet = readFileSync(
      new URL('../src/styles/layouts/learn-shell.css', import.meta.url),
      'utf8',
    )
    const navigationRuleStart = stylesheet.indexOf('.learn-main > .lesson-nav')
    const navigationRuleEnd = stylesheet.indexOf('.learn-main__crumbs', navigationRuleStart)
    const navigationRule = stylesheet.slice(navigationRuleStart, navigationRuleEnd)

    expect(stylesheet).toContain('height: 100vh;')
    expect(stylesheet).toContain('height: 100dvh;')
    expect(stylesheet).toContain('overflow-y: auto;')
    expect(stylesheet).toContain('.learn-main__scroll')
    expect(navigationRule).toContain('flex-shrink: 0;')
    expect(navigationRule).not.toContain('position: fixed')
    expect(navigationRule).not.toContain('left:')
  })

  it('声明桌面侧边栏收起网格轨道与平滑过渡样式', () => {
    const stylesheet = readFileSync(
      new URL('../src/styles/layouts/learn-shell.css', import.meta.url),
      'utf8',
    )

    expect(stylesheet).toContain('transition: grid-template-columns 300ms')
    expect(stylesheet).toContain('grid-template-columns: 0 minmax(0, 1fr);')
    expect(stylesheet).toContain('transform: translateX(-100%);')
    expect(stylesheet).toContain('.sidebar-collapse-toggle')
  })
})

const stylesRoot = new URL('../src/styles/', import.meta.url)
const visualizationsRoot = new URL('../src/components/visualizations/', import.meta.url)

function readCssFiles(dir: URL): Array<{ path: string; source: string }> {
  const files: Array<{ path: string; source: string }> = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    if (entry.isDirectory()) {
      files.push(...readCssFiles(entryUrl))
    } else if (entry.name.endsWith('.css')) {
      files.push({ path: entry.name, source: readFileSync(entryUrl, 'utf8') })
    }
  }

  return files
}

const HIDDEN_CAPTION_COMPONENTS = [
  'BankingCustomerHistoryLab.tsx',
  'BankingFactTypesLab.tsx',
  'BankingMetricLabs.tsx',
  'BankingStarSchemaLab.tsx',
  'HeroDataFlow.tsx',
  'LakehouseArchitectureLab.tsx',
  'LineageTeachingLab.tsx',
  'LoanGrainLab.tsx',
  'MetricDefinitionLab.tsx',
  'SchedulerRunSimulator.tsx',
  'SqlTransformationWorkbench.tsx',
  'StarSchemaFlow.tsx',
] as const

describe('sr-only 视觉隐藏统一语义', () => {
  it('项目级 .sr-only 固定定位并锚定 containing block 原点，不依赖祖先 position/transform', () => {
    const utilities = readFileSync(new URL('../src/styles/utilities.css', import.meta.url), 'utf8')
    const ruleStart = utilities.indexOf('.sr-only {')
    expect(ruleStart).toBeGreaterThanOrEqual(0)
    const rule = utilities.slice(ruleStart, utilities.indexOf('}', ruleStart))

    expect(rule).toContain('position: absolute;')
    // top/left 是本次修复的关键：没有它们时会退化为静态位置，落到 document 坐标系。
    expect(rule).toContain('top: 0;')
    expect(rule).toContain('left: 0;')
    expect(rule).toContain('width: 1px;')
    expect(rule).toContain('height: 1px;')
    expect(rule).toContain('overflow: hidden;')
    expect(rule).toContain('clip: rect(0, 0, 0, 0);')
    expect(rule).toContain('clip-path: inset(50%);')
    // 不能把视觉隐藏退化为从可访问性树移除。
    expect(rule).not.toContain('display: none')
    expect(rule).not.toContain('visibility: hidden')
  })

  it('所有隐藏 caption 组件复用共享 .sr-only，移除了 .lineage-teaching-sr-only 私有实现', () => {
    for (const file of HIDDEN_CAPTION_COMPONENTS) {
      const source = readFileSync(new URL(file, visualizationsRoot), 'utf8')
      expect(source, `${file} 的隐藏 caption 应使用共享 .sr-only`).toContain('className="sr-only"')
      expect(source, `${file} 不应保留私有 sr-only 实现`).not.toContain('lineage-teaching-sr-only')
    }
  })

  it('没有样式表再以内联 absolute + clip 方式隐藏 caption', () => {
    const offenders: string[] = []

    for (const { path, source } of readCssFiles(stylesRoot)) {
      if (path === 'utilities.css') continue
      if (/caption[^{}]*\{[^}]*position:\s*absolute/s.test(source)) {
        offenders.push(`${path}: caption 仍依赖局部 absolute 定位`)
      }
      if (source.includes('clip: rect')) {
        offenders.push(`${path}: caption 仍在使用 clip 隐藏`)
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('Learn document scroll ownership', () => {
  it('BaseLayout 支持页面级 root class，home 页不携带 learn-page', () => {
    const layout = readFileSync(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8')
    expect(layout).toContain('pageClass?: string')
    expect(layout).toContain('class={pageClass}')

    const home = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')
    expect(home).not.toContain('learn-page')
  })

  it('两个 Learn 页面在 SSR 阶段就声明 learn-page', () => {
    for (const page of ['../src/pages/learn/index.astro', '../src/pages/learn/[slug].astro']) {
      const source = readFileSync(new URL(page, import.meta.url), 'utf8')
      expect(source).toContain('pageClass="learn-page"')
    }
  })

  it('document 滚动锁只作用于 html.learn-page', () => {
    const shell = readFileSync(
      new URL('../src/styles/layouts/learn-shell.css', import.meta.url),
      'utf8',
    )
    expect(shell).toMatch(/html\.learn-page[^{}]*\{[^}]*overflow:\s*hidden/s)

    for (const { path, source } of readCssFiles(stylesRoot)) {
      if (path === 'learn-shell.css') continue
      expect(source, `${path} 不应全局锁定 html/body 纵向滚动`).not.toMatch(
        /(?:^|[\s,{])(?:html|body)\s*(?:,[^{}]*)?\{[^}]*overflow-y:\s*hidden/s,
      )
    }
  })

  it('Learning Shell 继续使用固定视口与独立滚动所有权', () => {
    const shell = readFileSync(
      new URL('../src/styles/layouts/learn-shell.css', import.meta.url),
      'utf8',
    )
    expect(shell).toMatch(/\.learn-app\s*\{[^}]*height:\s*100dvh/s)
    expect(shell).toMatch(/\.learn-app\s*\{[^}]*overflow:\s*hidden/s)
    expect(shell).toMatch(/\.learn-main__scroll\s*\{[^}]*overflow-y:\s*auto/s)
    expect(shell).toMatch(/\.course-sidebar\s*\{[^}]*overflow-y:\s*auto/s)
  })
})
