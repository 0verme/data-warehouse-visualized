interface ProgressIndicatorProps {
  completedCount: number
  totalLessons: number
  compact?: boolean
}

export function ProgressIndicator({
  completedCount,
  totalLessons,
  compact = false,
}: ProgressIndicatorProps) {
  const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  return (
    <div className={`progress-indicator${compact ? ' progress-indicator--compact' : ''}`}>
      <div className="progress-indicator__topline">
        <span>学习进度</span>
        <strong data-progress-count>
          {completedCount} <small>/ {totalLessons}</small>
        </strong>
      </div>
      <div
        className="progress-indicator__track"
        data-progress-bar
        role="progressbar"
        aria-label="课程完成进度"
        aria-valuemin={0}
        aria-valuemax={totalLessons}
        aria-valuenow={completedCount}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
