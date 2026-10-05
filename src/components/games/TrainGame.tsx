import { useEffect, useRef, useState } from 'react'
import { playItem, sfx, stopAudio } from '../../lib/audio'
import { Item } from '../../lib/items'
import { Selection } from '../../lib/selection'
import { Stream, canRecognize, heardMatches, streamListen } from '../../lib/speech'
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

  const stream = useRef<Stream | null>(null)
  const session = useRef<Promise<string | null> | null>(null)
  const idxRef = useRef(0)
  const itemsRef = useRef<Item[]>([])
  const missesRef = useRef(0)
  const used = useRef(new Map<number, number>())
  const scoreRef = useRef(0)
  const details = useRef<unknown[]>([])
  const carRefs = useRef<(HTMLDivElement | null)[]>([])

  itemsRef.current = items ?? []

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

  const finishCar = (result: 'ok' | 'skip') => {
    const i = idxRef.current
    const list = itemsRef.current
    if (i >= list.length) return
    const first = missesRef.current === 0
    for (const s of list[i].syllables)
      if (s.letter_id && s.nikud_id) void recordAnswer(s.letter_id, s.nikud_id, result === 'ok' && first)
    details.current.push({ item: list[i].text, result, misses: missesRef.current })
    if (result === 'ok') {
      sfx.correct()
      if (first) {
        scoreRef.current += 1
        setScore(scoreRef.current)
        earnStar()
        setConfetti((c) => c + 1)
      }
    } else sfx.tap()
    setCars((cs) => cs.map((c, k) => (k === i ? result : c)))
    missesRef.current = 0
    used.current = new Map()
    idxRef.current = i + 1
    if (i + 1 >= list.length) {
      stream.current?.stop()
      setDone(true)
      void session.current?.then((id) => finishSession(id, list.length, scoreRef.current, details.current))
    } else setIdx(i + 1)
  }

  const onHeard = (alts: string[], isFinal: boolean, resultIndex: number) => {
    const cur = itemsRef.current[idxRef.current]
    if (!cur) return
    const from = used.current.get(resultIndex) ?? 0
    // Only what has not been used for an earlier car: a result may hold several syllables.
    for (const alt of alts) {
      const tokens = alt.split(/\s+/).filter(Boolean)
      for (let j = from; j < tokens.length; j++) {
        if (heardMatches([tokens.slice(from, j + 1).join(' ')], cur.syllables)) {
          used.current.set(resultIndex, j + 1)
          finishCar('ok')
          return
        }
      }
    }
    if (isFinal) {
      used.current.set(resultIndex, 9999)
      missesRef.current += 1
      setMiss(true)
      sfx.wrong()
      window.setTimeout(() => setMiss(false), 700)
    }
  }

  const start = () => {
    setStarted(true)
    sfx.start()
    if (!canRecognize) return setMic('error')
    stream.current = streamListen({
      onHeard,
      onState: (state, error) => {
        setMic(state)
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
            <span className="car-text">{it.text}</span>
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
          {micError && <p className="hint-text">{micError}</p>}
          {mic === 'error' && !micError && <p className="hint-text">{t('זיהוי הקול לא זמין כרגע')}</p>}
          <div className="finish-actions">
            <button className="btn icon-btn" onClick={() => void playItem(current)} aria-label={t('שמע')}>
              🔊
            </button>
            <button className="btn good icon-btn" onClick={() => finishCar('ok')} aria-label={t('הורה: הוא אמר נכון ✓')}>
              ✓
            </button>
            <button className="btn icon-btn" onClick={() => finishCar('skip')} aria-label={t('דלג')}>
              ⏭
            </button>
          </div>
          <p className="hint-text">{t('הורה: ✓ מעביר את הקרון, ⏭ מדלג')}</p>
        </>
      )}
    </div>
  )
}
