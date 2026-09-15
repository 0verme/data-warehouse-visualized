interface CodeRendererProps {
  className: string
  code: string
  highlightedCode?: string
}

export function CodeRenderer({ className, code, highlightedCode }: CodeRendererProps) {
  if (highlightedCode) {
    return (
      // pi-lens-ignore: dangerously-set-inner-html
      <div className={className} dangerouslySetInnerHTML={{ __html: highlightedCode }} />
    )
  }

  return (
    <div className={className}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export type { CodeRendererProps }
