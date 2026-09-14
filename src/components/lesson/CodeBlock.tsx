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
      {highlightedCode ? (
        // pi-lens-ignore: dangerously-set-inner-html
        <div className="code-block__body" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      ) : (
        <div className="code-block__body">
          <pre>
            <code>{code}</code>
          </pre>
        </div>
      )}
    </section>
  )
}
