import { useRef } from 'react'
import { t } from '../../lib/i18n'

type Props = {
  /** true from press until the recording ends */
  active: boolean
  /** the mic is live — show "speak now" */
  ready: boolean
  /** longest hold; the ring fills over this time */
  maxMs: number
  onPress: () => void
  onRelease: () => void
  disabled?: boolean
}

const R = 66
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * Press and hold to talk, release to stop. A ring around the button fills over
 * the maximum hold time; it glows green once the microphone is actually listening.
 */
export function HoldMic({ active, ready, maxMs, onPress, onRelease, disabled }: Props) {
  const held = useRef(false)

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || held.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    held.current = true
    onPress()
  }
  const release = () => {
    if (!held.current) return
    held.current = false
    onRelease()
  }

  return (
    <button
      className={`hold-mic${active ? ' active' : ''}${ready ? ' ready' : ''}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={t('לחץ והחזק כדי לדבר')}
      disabled={disabled}
    >
      <svg className="hold-ring" viewBox="0 0 150 150" aria-hidden>
        <circle className="hold-track" cx="75" cy="75" r={R} />
        {active && (
          <circle
            key="fill"
            className="hold-fill"
            cx="75"
            cy="75"
            r={R}
            style={{
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: CIRCUMFERENCE,
              animationDuration: `${maxMs}ms`,
            }}
          />
        )}
      </svg>
      {active && ready && (
        <>
          <span className="hold-wave" />
          <span className="hold-wave second" />
        </>
      )}
      <span className="hold-icon">🎤</span>
    </button>
  )
}
