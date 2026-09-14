import { CodeRenderer } from './CodeRenderer'

interface CodeBlockProps {
  label: string
  language: string
  code: string
  highlightedCode?: string
  headingId?: string
}

export function CodeBlock({
  label,
  language,
  code,
  highlightedCode,
  headingId = 'code-block-title',
}: CodeBlockProps) {
  return (
    <section className="code-block" aria-labelledby={headingId}>
      <div className="code-block__header">
        <h2 id={headingId}>{label}</h2>
        <span>{language}</span>
      </div>
      <CodeRenderer className="code-block__body" code={code} highlightedCode={highlightedCode} />
    </section>
  )
}
