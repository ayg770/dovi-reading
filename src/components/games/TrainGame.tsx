import { useEffect, useRef, useState } from 'react'
import { playItem, sfx, stopAudio } from '../../lib/audio'
import { Selection } from '../../lib/selection'
import { LiveMatcher } from '../../lib/liveReader'
import { Stream, canRecognize, streamListen } from '../../lib/speech'
import { earnStar } from '../../lib/stars'
import { finishSession, recordAnswer, startSession } from '../../lib/supabase'
import { t } from '../../lib/i18n'
import { useGameItems } from '../../lib/useGameItems'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { StarBar } from '../ui/StarBar'

type Car = 'wait' | 'ok' | 'skip'
type Props = { selection: Selection; onExit: () => void; onRestart: () => void; onPlayGroup: (groupId: string) => void }

/**
 * A train of syllables with the microphone open the whole time: the car in front is lit; when
 * he says it the car turns green and the train moves on, if not it flashes red and he tries
 * again. A button skips a car (for a technical hiccup), another lets a grown-up pass it.
 * Without speech recognition (or the microphone) the grown-up moves the train.
 */
export function TrainGame({ selection, onExit, onRestart, onPlayGroup }: Props) {
  const { items, groupName } = useGameItems(selection, 'train', { fallback: 'singles' })
  const [started, setStarted] = useState(false)
  const [idx, setIdx] = useState(0)
  const [cars, setCars] = useState<Car[]>([])
  const [miss, setMiss] = useState(false)
  const [mic, setMic] = useState<'off' | 'listening' | 'restarting' | 'error'>('off')
  const [micError, setMicError] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)
  const [syl, setSyl] = useState(0)
  const [heard, setHeard] = useState('')

  const stream = useRef<Stream | null>(null)
  const session = useRef<Promise<string | null> | null>(null)
  const matcher = useRef<LiveMatcher | null>(null)
  const used = useRef(new Map<number, number>())
  const scoreRef = useRef(0)
  const details = useRef<unknown[]>([])
  const carRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    session.current ??= startSession('syllable_train')
    return () => {
      stream.current?.stop()
      stopAudio()
    }
  }, [])

  useEffect(() => {
    if (items) setCars(items.map(() => 'wait'))
  }, [items])

  // Keep the lit car in the middle of the screen.
  useEffect(() => {
    carRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [idx, started])

  /** Build the matcher once the cars are known: one word (car) after the other. */
  useEffect(() => {
    if (!items) return
    matcher.current = new LiveMatcher(
      items.map((it) => ({ text: it.text, syllables: it.syllables })),
      {
        onSyllable: (_wi, si) => {
          setSyl(si + 1)
          sfx.tap()
        },
        onWord: (wi, result, m) => {
          const it = items[wi]
          for (const s of it.syllables) if (s.letter_id && s.nikud_id) void recordAnswer(s.letter_id, s.nikud_id, result === 'ok' && m === 0)
          details.current.push({ item: it.text, result, misses: m })
          setCars((cs) => cs.map((c, k) => (k === wi ? (result === 'ok' ? 'ok' : 'skip') : c)))
          setSyl(0)
          setIdx(wi + 1)
          if (result === 'ok') {
            sfx.correct()
            if (m === 0) {
              scoreRef.current += 1
              setScore(scoreRef.current)
              earnStar()
              setConfetti((c) => c + 1)
            }
          }
        },
        onMiss: () => {
          setMiss(true)
          sfx.wrong()
          window.setTimeout(() => setMiss(false), 700)
        },
        onDone: () => {
          stream.current?.stop()
          setDone(true)
          void session.current?.then((id) => finishSession(id, items.length, scoreRef.current, details.current))
        },
      },
      used.current,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const start = () => {
    setStarted(true)
    sfx.start()
    if (!canRecognize) return setMic('error')
    stream.current = streamListen({
      onHeard: (alts, isFinal, ri) => {
        setHeard(alts[0])
        matcher.current?.feed(alts, isFinal, ri)
      },
      onState: (state, error) => {
        setMic(state)
        if (state === 'restarting') used.current.clear()
        if (state === 'error') {
          setMicError(
            error === 'not-allowed' || error === 'service-not-allowed'
              ? t('צריך לאשר גישה למיקרופון בדפדפן')
              : t('זיהוי הקול לא זמין כרגע'),
          )
        }
      },
    })
  }

  if (!items) return <div className="game loading">…</div>

  if (done)
    return (
      <FinishScreen score={score} total={items.length} groupId={null} groupName={groupName} onRestart={onRestart} onExit={onExit} onPlayGroup={onPlayGroup} />
    )

  const current = items[idx]

  return (
    <div className="game train">
      <Confetti fire={confetti} />
      <header className="game-bar">
        <button
          className="btn small"
          onClick={() => {
            stream.current?.stop()
            onExit()
          }}
          aria-label={t('חזרה')}
        >
          ✕
        </button>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(idx / items.length) * 100}%` }} />
        </div>
      </header>
      <StarBar />
      {groupName && <p className="group-tag">{groupName}</p>}

      <div className="track" dir="rtl">
        <div className="engine">🚂</div>
        {items.map((it, i) => (
          <div
            key={i}
            ref={(el) => {
              carRefs.current[i] = el
            }}
            className={`car ${cars[i] ?? 'wait'}${started && i === idx ? ' on' : ''}${i === idx && miss ? ' miss' : ''}`}
          >
            <span className="car-text">
              {i === idx && it.syllables.length > 1
                ? it.syllables.map((sy, k) => (
                    <span key={k} className={k < syl ? 'ls ok' : 'ls'}>
                      {sy.text}
                    </span>
                  ))
                : it.text}
            </span>
            <span className="wheels">⚫ ⚫</span>
          </div>
        ))}
      </div>

      {!started ? (
        <button className="btn primary start-btn" onClick={start}>
          {t('יוצאים לדרך ▶')}
        </button>
      ) : (
        <>
          <div className={`mic-light ${mic}`}>
            <span className="mic-dot" />
            🎤
          </div>
          <p className="heard">{heard ? t('שמעתי: {text}', { text: heard }) : '👂'}</p>
          {micError && <p className="hint-text">{micError}</p>}
          {mic === 'error' && !micError && <p className="hint-text">{t('זיהוי הקול לא זמין כרגע')}</p>}
          <div className="finish-actions">
            <button className="btn icon-btn" onClick={() => void playItem(current)} aria-label={t('שמע')}>
              🔊
            </button>
            <button className="btn good icon-btn" onClick={() => matcher.current?.settle('ok')} aria-label={t('הורה: הוא אמר נכון ✓')}>
              ✓
            </button>
            <button className="btn icon-btn" onClick={() => matcher.current?.settle('miss')} aria-label={t('דלג')}>
              ⏭
            </button>
          </div>
          <p className="hint-text">{t('הורה: ✓ מעביר את הקרון, ⏭ מדלג')}</p>
        </>
      )}
    </div>
  )
}
