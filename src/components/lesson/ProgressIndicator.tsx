import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'

interface ProgressIndicatorProps {
  completedCount: number
  totalLessons: number
  compact?: boolean
  locale?: Locale
}

export function ProgressIndicator({
  completedCount,
  totalLessons,
  compact = false,
  locale = DEFAULT_LOCALE,
}: ProgressIndicatorProps) {
  const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  return (
    <div className={`progress-indicator${compact ? ' progress-indicator--compact' : ''}`}>
      <div className="progress-indicator__topline">
        <span>{getMessage('learningProgress', locale)}</span>
        <strong data-progress-count>
          {completedCount} <small>/ {totalLessons}</small>
        </strong>
      </div>
      <div
        className="progress-indicator__track"
        data-progress-bar
        role="progressbar"
        aria-label={getMessage('courseCompletionProgress', locale)}
        aria-valuemin={0}
        aria-valuemax={totalLessons}
        aria-valuenow={completedCount}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
