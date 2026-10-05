import { useEffect, useMemo, useRef, useState } from 'react'
import { NIKUD, SYLLABLE_LETTERS, Syllable, syllableText } from '../../data/hebrew'
import { saveSyllableRecording } from '../../lib/admin'
import { playUrl, sfx, stopAudio } from '../../lib/audio'
import { ownRecording, storageUrl } from '../../lib/content'
import { t } from '../../lib/i18n'
import { Recording, startRecording } from '../../lib/recorder'
import { HoldMic } from '../ui/HoldMic'

const MAX_MS = 4000
const MIN_MS = 350

type Phase = 'setup' | 'record' | 'done'

/**
 * Record many syllables in a row: the syllable appears, hold the mic and say it, let go —
 * it is saved and the next one comes. Only the missing ones, by default.
 */
export function QuickRecord({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [nikudIds, setNikudIds] = useState<number[]>(NIKUD.map((n) => n.id))
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [queue, setQueue] = useState<Syllable[]>([])
  const [index, setIndex] = useState(0)
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'short' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const rec = useRef<{ promise: Promise<Recording | null>; startedAt: number } | null>(null)
  const advanceTimer = useRef<number>(0)

  useEffect(
    () => () => {
      window.clearTimeout(advanceTimer.current)
      stopAudio()
    },
    [],
  )

  const all = useMemo(
    () =>
      SYLLABLE_LETTERS.flatMap((letter) => NIKUD.filter((n) => nikudIds.includes(n.id)).map((nikud) => ({ letter, nikud }))),
    [nikudIds],
  )
  const missingCount = all.filter((s) => !ownRecording(s.letter.id, s.nikud.id)).length

  const start = () => {
    const q = onlyMissing ? all.filter((s) => !ownRecording(s.letter.id, s.nikud.id)) : all
    setQueue(q)
    setIndex(0)
    setSavedCount(0)
    setStatus('idle')
    setPhase(q.length ? 'record' : 'done')
  }

  const current = queue[index]

  const advance = (to = index + 1) => {
    window.clearTimeout(advanceTimer.current)
    setStatus('idle')
    setError(null)
    if (to >= queue.length) setPhase('done')
    else setIndex(Math.max(0, to))
  }

  const press = () => {
    stopAudio()
    window.clearTimeout(advanceTimer.current)
    setStatus('idle')
    setError(null)
    setReady(false)
    setActive(true)
    sfx.start()
    const promise = startRecording(MAX_MS + 300)
      .then((r) => {
        setReady(true)
        return r
      })
      .catch(() => {
        setError(t('אין גישה למיקרופון'))
        return null
      })
    rec.current = { promise, startedAt: Date.now() }
  }

  const release = async () => {
    const r = rec.current
    rec.current = null
    setActive(false)
    setReady(false)
    if (!r || !current) return
    const recording = await r.promise
    if (!recording) return
    const blob = await recording.stop()
    if (Date.now() - r.startedAt < MIN_MS || !blob.size) return setStatus('short')
    setStatus('saving')
    try {
      await saveSyllableRecording(current.letter.id, current.nikud.id, blob)
      setSavedCount((n) => n + 1)
      setStatus('saved')
      sfx.correct()
      advanceTimer.current = window.setTimeout(() => advance(), 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('השמירה נכשלה'))
      setStatus('error')
    }
  }

  const listen = () => {
    if (!current) return
    const r = ownRecording(current.letter.id, current.nikud.id)
    if (r) void playUrl(storageUrl(r.audio_path))
  }

  if (phase === 'setup')
    return (
      <div className="panel quick">
        <h3>{t('הקלטה מהירה')}</h3>
        <p className="muted">{t('מופיעה הברה, לוחצים על 🎤 ומחזיקים בזמן שאומרים אותה, ועוזבים. ההקלטה נשמרת ועוברים להבאה.')}</p>
        <p className="field-title">{t('אילו ניקודים?')}</p>
        <div className="nikud-toggles">
          {NIKUD.map((n) => (
            <button
              key={n.id}
              className={nikudIds.includes(n.id) ? 'toggle on' : 'toggle'}
              onClick={() =>
                setNikudIds((ids) => {
                  const next = ids.includes(n.id) ? ids.filter((i) => i !== n.id) : [...ids, n.id]
                  return next.length ? next : ids
                })
              }
            >
              <span className="toggle-sample">{'ב' + n.mark}</span>
              {t(n.name)}
            </button>
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          {t('רק הברות שעוד לא הוקלטו')}
        </label>
        <p className="muted">
          {onlyMissing
            ? t('נשארו {n} הברות להקלטה.', { n: missingCount })
            : t('{n} הברות.', { n: all.length })}
        </p>
        <div className="finish-actions">
          <button className="btn primary" onClick={start} disabled={onlyMissing && missingCount === 0}>
            {t('מתחילים ▶')}
          </button>
          <button className="btn" onClick={onExit}>
            {t('חזרה')}
          </button>
        </div>
      </div>
    )

  if (phase === 'done')
    return (
      <div className="panel quick done">
        <div className="trophy">🎉</div>
        <p className="prompt">{t('הוקלטו {n} הברות', { n: savedCount })}</p>
        <button className="btn primary" onClick={onExit}>
          {t('סיום')}
        </button>
      </div>
    )

  const hasRecording = !!ownRecording(current.letter.id, current.nikud.id)

  return (
    <div className="quick">
      <header className="game-bar">
        <button className="btn small" onClick={() => { setPhase('done') }} aria-label={t('סיום')}>
          ✕
        </button>
        <div className="progress-bar" aria-label={`${index + 1} / ${queue.length}`}>
          <div className="progress-fill" style={{ width: `${(index / queue.length) * 100}%` }} />
        </div>
        <span className="score">
          {index + 1}/{queue.length}
        </span>
      </header>

      <div className={`read-card ${status === 'saved' ? 'right' : ''}`}>
        <span className="read-text">{syllableText(current)}</span>
      </div>

      <HoldMic active={active} ready={ready} maxMs={MAX_MS} onPress={press} onRelease={() => void release()} disabled={status === 'saving'} />
      <p className="hint-text quick-status">
        {status === 'saving' && '…'}
        {status === 'saved' && '✓'}
        {status === 'short' && t('קצר מדי, ננסה שוב')}
        {status === 'idle' && !active && t('לחצו והחזיקו, אמרו, ועזבו')}
        {error && <span className="error">{error}</span>}
      </p>

      <div className="finish-actions">
        <button className="btn icon-btn" onClick={() => advance(index - 1)} disabled={index === 0} aria-label={t('הקודם')}>
          ⏮
        </button>
        <button className="btn icon-btn" onClick={listen} disabled={!hasRecording} aria-label={t('השמע')}>
          ▶
        </button>
        <button className="btn icon-btn" onClick={() => advance()} aria-label={t('דלג')}>
          ⏭
        </button>
      </div>
    </div>
  )
}
