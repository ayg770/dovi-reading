export function Stars({ total, filled }: { total: number; filled: number }) {
  return (
    <div className="progress-dots" aria-label={`${filled} מתוך ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < filled ? 'dot on' : 'dot'} />
      ))}
    </div>
  )
}
