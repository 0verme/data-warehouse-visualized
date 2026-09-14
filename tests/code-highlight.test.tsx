import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { lessons } from '../src/data/course'
import { CodeBlock } from '../src/components/lesson/CodeBlock'
import { buildLessonCodeHighlightMap } from '../src/utils/build-code-highlight'
import { getCodeHighlightKey } from '../src/utils/code-highlight'

const warehouseLayersLesson = lessons.find((lesson) => lesson.slug === 'warehouse-layers')
const slowlyChangingDimensionLesson = lessons.find(
  (lesson) => lesson.slug === 'slowly-changing-dimension',
)

if (!warehouseLayersLesson || !slowlyChangingDimensionLesson) {
  throw new Error('Expected code example lessons are missing')
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

  it('escapes SQL special characters while preserving string, number, and comment tokens', () => {
    const allHighlightedCode = Object.values(codeHighlights).join('\n')
    const content = getLessonContent(slowlyChangingDimensionLesson)
    const sql = content.sections.find((section) => section.kind === 'sql')

    expect(sql).toBeDefined()
    expect(allHighlightedCode).toMatch(/<span style="color:[^"]+">--/)
    expect(allHighlightedCode).toMatch(/<span style="color:[^"]+">PAID<\/span>/)
    expect(allHighlightedCode).toMatch(/<span style="color:[^"]+">\s*1<\/span>/)
    expect(codeHighlights[getCodeHighlightKey(sql!.language, sql!.code)]).toContain('&#x3C;')
    expect(codeHighlights[getCodeHighlightKey(sql!.language, sql!.code)]).not.toContain(
      ' order_time < d.effective_to',
    )
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
