interface QuickSummaryProps {
  children: string
}

export function QuickSummary({ children }: QuickSummaryProps) {
  return (
    <aside className="quick-summary" aria-label="一句话速览">
      <span className="quick-summary__mark" aria-hidden="true">
        01
      </span>
      <div>
        <span className="eyebrow eyebrow--small">一句话速览</span>
        <p>{children}</p>
      </div>
    </aside>
  )
}
