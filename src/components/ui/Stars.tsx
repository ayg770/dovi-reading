import { t } from '../../lib/i18n'

/** Progress through a game: dots for short games, a bar when there are many rounds. */
export function Stars({ total, filled }: { total: number; filled: number }) {
  if (total > 12)
    return (
      <div className="progress-bar" aria-label={t('{score} מתוך {total}', { score: filled, total })}>
        <div className="progress-fill" style={{ width: `${(filled / total) * 100}%` }} />
      </div>
    )
  return (
    <div className="progress-dots" aria-label={t('{score} מתוך {total}', { score: filled, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < filled ? 'dot on' : 'dot'} />
      ))}
    </div>
  )
}
