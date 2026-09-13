interface CodeBlockProps {
  label: string
  language: string
  code: string
}

export function CodeBlock({ label, language, code }: CodeBlockProps) {
  return (
    <section className="code-block" aria-labelledby="code-block-title">
      <div className="code-block__header">
        <h2 id="code-block-title">{label}</h2>
        <span>{language}</span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </section>
  )
}
