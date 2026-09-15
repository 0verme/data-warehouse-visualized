import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { lessons } from '../src/data/course'
import { CodeBlock } from '../src/components/lesson/CodeBlock'
import { CodeRenderer } from '../src/components/lesson/CodeRenderer'
import {
  buildCodeHighlightMap,
  buildLessonCodeHighlightMap,
} from '../src/utils/build-code-highlight'
import { getCodeHighlightKey } from '../src/utils/code-highlight'
import { HERO_METRIC_SQL, HERO_METRIC_SQL_EXAMPLE } from '../src/data/code-examples'
import { TRANSFORMATION_STEPS } from '../src/utils/sql-transformation'

const warehouseLayersLesson = lessons.find((lesson) => lesson.slug === 'warehouse-layers')

if (!warehouseLayersLesson) {
  throw new Error('Expected code example lesson is missing')
}

let codeHighlights: Awaited<ReturnType<typeof buildLessonCodeHighlightMap>>

describe('build-time code highlighting', () => {
  beforeAll(async () => {
    codeHighlights = await buildLessonCodeHighlightMap(lessons)
  })

  it('renders the warehouse SQL example with Shiki token markup', () => {
    const content = getLessonContent(warehouseLayersLesson)
    const code = content.code

    expect(code).toBeDefined()

    const highlightedCode = codeHighlights[getCodeHighlightKey(code!.language, code!.code)]
    expect(highlightedCode).toContain('<pre class="shiki nord"')
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">INSERT INTO<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">SELECT<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">\s*SUM<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">FROM<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">GROUP BY<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">AS<\/span>/)
    expect(highlightedCode).toContain('\n<span class="line">')
    expect(highlightedCode).toContain('  paid_date')
  })

  it('collects and highlights all eight SQL workbench steps at build time', () => {
    expect(TRANSFORMATION_STEPS).toHaveLength(8)

    const stepHighlights = TRANSFORMATION_STEPS.map(
      (step) => codeHighlights[getCodeHighlightKey('sql', step.sql)],
    )
    expect(
      stepHighlights.every((highlightedCode) => highlightedCode?.includes('class="shiki nord"')),
    ).toBe(true)

    const wrongJoin = TRANSFORMATION_STEPS.find((step) => step.id === 'wrong-join')
    expect(wrongJoin).toBeDefined()
    const highlightedCode = codeHighlights[getCodeHighlightKey('sql', wrongJoin!.sql)]

    expect(highlightedCode).toMatch(/<span style="color:[^"]+">SELECT<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">FROM<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">LEFT JOIN<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">ON<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">AS<\/span>/)

    const html = renderToStaticMarkup(
      <CodeRenderer
        className="sql-workbench__code"
        code={wrongJoin!.sql}
        highlightedCode={highlightedCode}
      />,
    )
    expect(html).toContain('class="shiki nord"')
  })

  it('reuses the build-time renderer for the standalone homepage SQL block', async () => {
    const highlights = await buildCodeHighlightMap([HERO_METRIC_SQL_EXAMPLE])
    const highlightedCode = highlights[getCodeHighlightKey('sql', HERO_METRIC_SQL)]

    expect(highlightedCode).toContain('<pre class="shiki nord"')
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">SELECT<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">\s*SUM<\/span>/)
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">FROM<\/span>/)
    expect(highlightedCode).toContain('dwd_order')
  })

  it('escapes SQL special characters while preserving string, number, and comment tokens', async () => {
    const code = `SELECT
  'PAID' AS status,
  1 AS version -- keep the historical value
FROM dim_customer
WHERE customer_id < 'C002'`
    const highlights = await buildCodeHighlightMap([{ language: 'sql', code }])
    const highlightedCode = highlights[getCodeHighlightKey('sql', code)]

    expect(highlightedCode).toMatch(/<span style="color:[^"]+">[^<]*--/)
    expect(highlightedCode).toContain('>PAID</span>')
    expect(highlightedCode).toMatch(/<span style="color:[^"]+">\s*1<\/span>/)
    expect(highlightedCode).toContain('&#x3C;')
    expect(highlightedCode).not.toContain("customer_id < 'C002'")
  })

  it('keeps the pre/code fallback when highlighting is missing', () => {
    const html = renderToStaticMarkup(
      <CodeRenderer className="sql-workbench__code" code="SELECT <missing>" />,
    )

    expect(html).toContain('<pre><code>SELECT &lt;missing&gt;</code></pre>')
    expect(html).not.toContain('class="shiki nord"')
  })

  it('uses the highlighted HTML without changing the code block contract', () => {
    const content = getLessonContent(warehouseLayersLesson)
    const code = content.code!
    const highlightedCode = codeHighlights[getCodeHighlightKey(code.language, code.code)]
    const html = renderToStaticMarkup(
      <CodeBlock
        label={code.label}
        language={code.language}
        code={code.code}
        highlightedCode={highlightedCode}
        headingId="warehouse-code-title"
      />,
    )

    expect(html).toContain('class="code-block"')
    expect(html).toContain('aria-labelledby="warehouse-code-title"')
    expect(html).toContain('一段加工关系')
    expect(html).toContain('class="shiki nord"')
    expect(html).toContain('INSERT INTO')
    expect(html).toContain('SUM')
  })
})
