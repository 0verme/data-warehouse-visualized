export type TeachingAsideTone = 'engineering' | 'pitfall'

export interface TeachingAsideProps {
  label: string
  text: string
  title?: string
  tone: TeachingAsideTone
}

export function TeachingAside({ label, text, title, tone }: TeachingAsideProps) {
  return (
    <aside className={`teaching-aside teaching-aside--${tone}`} aria-label={label}>
      <div className="teaching-aside__label">
        <span className="teaching-aside__icon" aria-hidden="true">
          {tone === 'pitfall' ? '!' : 'i'}
        </span>
        {label}
      </div>
      {title && <strong className="teaching-aside__title">{title}</strong>}
      <p>{text}</p>
    </aside>
  )
}
