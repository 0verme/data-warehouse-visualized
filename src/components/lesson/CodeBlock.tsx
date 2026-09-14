interface CodeBlockProps {
  label: string
  language: string
  code: string
  headingId?: string
}

export function CodeBlock({
  label,
  language,
  code,
  headingId = 'code-block-title',
}: CodeBlockProps) {
  return (
    <section className="code-block" aria-labelledby={headingId}>
      <div className="code-block__header">
        <h2 id={headingId}>{label}</h2>
        <span>{language}</span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </section>
  )
}
