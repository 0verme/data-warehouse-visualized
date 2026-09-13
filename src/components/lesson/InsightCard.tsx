interface InsightCardProps {
  label: string
  title: string
  children: string
  tone?: 'blue' | 'amber'
}

export function InsightCard({ label, title, children, tone = 'blue' }: InsightCardProps) {
  return (
    <article className={`insight-card insight-card--${tone}`}>
      <div className="insight-card__label">
        <span className="insight-card__icon" aria-hidden="true">
          {tone === 'amber' ? '!' : 'i'}
        </span>
        {label}
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  )
}
