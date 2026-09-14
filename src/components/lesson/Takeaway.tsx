export interface TakeawayProps {
  title: string
  text: string
  bullets?: string[]
  headingId?: string
}

export function Takeaway({ title, text, bullets, headingId = 'takeaway-title' }: TakeawayProps) {
  return (
    <aside className="takeaway" aria-labelledby={headingId}>
      <div className="takeaway__mark" aria-hidden="true">
        →
      </div>
      <div>
        <span className="eyebrow eyebrow--small">Takeaway</span>
        <h2 id={headingId}>{title}</h2>
        <p>{text}</p>
        {bullets && bullets.length > 0 && (
          <ul className="takeaway__list">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
