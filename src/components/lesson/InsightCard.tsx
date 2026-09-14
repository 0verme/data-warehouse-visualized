import { TeachingAside } from './TeachingAside'

interface InsightCardProps {
  label: string
  title: string
  children: string
  tone?: 'blue' | 'amber'
}

/** @deprecated Use EngineeringNote or Pitfall for new lesson sections. */
export function InsightCard({ label, title, children, tone = 'blue' }: InsightCardProps) {
  return (
    <TeachingAside
      label={label}
      title={title}
      text={children}
      tone={tone === 'amber' ? 'pitfall' : 'engineering'}
    />
  )
}
