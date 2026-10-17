import { useEffect, useRef, useState } from 'react'
import { Unit } from '../../data/curriculum'
import { sfx } from '../../lib/audio'
import { lesson } from '../../lib/lesson'
import { installUnit, unitTitle } from '../../lib/plan'
import { Selection } from '../../lib/selection'
import { useStars } from '../../lib/stars'
import { recordUnitProgress } from '../../lib/supabase'
import { t } from '../../lib/i18n'
import { BuildWordGame } from './BuildWordGame'
import { HearSyllableGame } from './HearSyllableGame'
import { LiveReadGame } from './LiveReadGame'
import { TrainGame } from './TrainGame'
import { Confetti } from '../ui/Confetti'

type Props = { unit: Unit; minutes: number; onExit: () => void; onPlan: () => void; onAgain: () => void }

type Step = 'hear_syllable' | 'build_word' | 'read_aloud' | 'syllable_train'
const ROUNDS = 5

const STEP_ICON: Record<Step, string> = { hear_syllable: '👂', build_word: '🧩', read_aloud: '🗣️', syllable_train: '🚂' }

/**
 * A lesson: short rounds of different games over the same unit, one after another, until the
 * time is up. The stars earned and the minutes go to the unit's row in the progress table.
 */
export function LessonRunner({ unit, minutes, onExit, onPlan, onAgain }: Props) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const starsAtStart = useRef<number | null>(null)
  const saved = useRef(false)
  const { stars, loaded } = useStars()
  const [, tick] = useState(0)

  // The clock on screen.
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const sequence: Step[] =
    unit.kind === 'singles' ? ['hear_syllable', 'read_aloud', 'syllable_train'] : ['hear_syllable', 'build_word', 'read_aloud', 'syllable_train']

  useEffect(() => {
    lesson.start()
    startedAt.current = Date.now()
    void installUnit(unit)
      .then(setGroupId)
      .catch((e) => setError(e instanceof Error ? e.message : t('משהו השתבש')))
    return () => lesson.stop()
  }, [unit])

  useEffect(() => {
    if (loaded && starsAtStart.current === null) starsAtStart.current = stars
  }, [loaded, stars])

  const seconds = () => Math.round((Date.now() - startedAt.current) / 1000)
  const points = () => Math.max(0, stars - (starsAtStart.current ?? stars))

  const finish = () => {
    if (saved.current) return
    saved.current = true
    const l = lesson.get()
    void recordUnitProgress(unit.code, points(), seconds(), l.correct, l.total)
    sfx.finish()
    setOver(true)
  }

  // A game ended by itself: on to the next, or the end of the lesson when the time is up.
  const next = () => {
    if (!lesson.takeNext()) return finish() // left with ✕
    if (Date.now() - startedAt.current >= minutes * 60000) return finish()
    setStep((s) => s + 1)
  }

  if (error) return <div className="game loading">{error}</div>
  if (!groupId) return <div className="game loading">…</div>

  if (over) {
    const l = lesson.get()
    const pct = l.total ? Math.round((l.correct / l.total) * 100) : 0
    return (
      <div className="game finish">
        <Confetti fire={1} big />
        <div className="trophy">🏆</div>
        <h2>{t('סיימנו שיעור!')}</h2>
        <p className="group-tag">{unitTitle(unit)}</p>
        <div className="lesson-stats">
          <span>
            ⭐ <b>{points()}</b>
          </span>
          <span>
            ⏱ <b>{Math.max(1, Math.round(seconds() / 60))}</b> {t('דקות')}
          </span>
          {l.total > 0 && (
            <span>
              🎯 <b>{pct}%</b>
            </span>
          )}
        </div>
        <div className="finish-actions big">
          <button className="btn primary icon-btn" onClick={onAgain} aria-label={t('שיעור נוסף')}>
            🔁
          </button>
          <button className="btn icon-btn" onClick={onPlan} aria-label={t('למסלול')}>
            📋
          </button>
          <button className="btn icon-btn" onClick={onExit} aria-label={t('חזרה')}>
            🏠
          </button>
        </div>
      </div>
    )
  }

  const game = sequence[step % sequence.length]
  const selection: Selection = { kind: 'group', groupId, rounds: ROUNDS }
  const props = { key: step, selection, onExit: next, onRestart: () => {}, onPlayGroup: () => {} }
  const remaining = Math.max(0, minutes * 60 - seconds())

  return (
    <>
      <div className="lesson-bar" dir="ltr">
        <span>
          {STEP_ICON[game]} {step + 1}
        </span>
        <span>⏱ {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
      </div>
      {game === 'hear_syllable' && <HearSyllableGame {...props} />}
      {game === 'build_word' && <BuildWordGame {...props} />}
      {game === 'read_aloud' && <LiveReadGame {...props} />}
      {game === 'syllable_train' && <TrainGame {...props} />}
    </>
  )
}
