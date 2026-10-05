import { useEffect, useMemo, useRef, useState } from 'react'
import { ensureContent } from '../../lib/content'
import { sfx } from '../../lib/audio'
import { t } from '../../lib/i18n'
import {
  Feeling,
  Frame,
  MAX_WPM,
  MIN_WPM,
  RsvpRecord,
  Success,
  buildFrames,
  letterClusters,
  sliderFromWpm,
  textWords,
  wpmFromSlider,
} from '../../lib/rsvp'
import { earnStar } from '../../lib/stars'
import { finishSession, saveSessionDetails, startSession } from '../../lib/supabase'
import { Confetti } from '../ui/Confetti'
import { RsvpChoice } from '../ui/RsvpPicker'
import { StarBar } from '../ui/StarBar'

type Props = { choice: RsvpChoice; onExit: () => void; onRestart: () => void }

function Shown({ frame, choice }: { frame: Frame; choice: RsvpChoice }) {
  return (
    <>
      {frame.parts.map((p, i) => {
        if (choice.focal && frame.parts.length === 1) {
          const { pieces, focal } = letterClusters(p.text)
          return (
            <span key={i} className="rsvp-word">
              {pieces.map((c, k) => (
                <span key={k} className={k === focal ? 'focal' : undefined}>
                  {c}
                </span>
              ))}
            </span>
          )
        }
        // Optional: the last syllable of a word, for those who use regular (not Ashkenazi) pronunciation.
        if (choice.stress && p.syllables.length > 1) {
          return (
            <span key={i} className="rsvp-word">
              {p.syllables.map((s, k) => (
                <span key={k} className={k === p.syllables.length - 1 ? 'stress' : undefined}>
                  {s.text}
                </span>
              ))}
            </span>
          )
        }
        return (
          <span key={i} className="rsvp-word">
            {p.text}
          </span>
        )
      })}
    </>
  )
}

/**
 * Continuous reading: the words appear one after another in one place, at a pace in words per
 * minute. No voice recognition: at the end the reader says how it felt and how much they understood,
 * and can keep the text and the pace for next time.
 */
export function RsvpGame({ choice, onExit, onRestart }: Props) {
  const [text, setText] = useState<{ name: string; words: string[] } | null>(null)
  const [count, setCount] = useState<number | null>(3) // 3-2-1 before starting
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [wpm, setWpm] = useState(choice.wpm)
  const [size, setSize] = useState(1)
  const [done, setDone] = useState(false)
  const session = useRef<Promise<string | null> | null>(null)
  const peak = useRef(choice.wpm)

  useEffect(() => {
    session.current ??= startSession('rsvp')
    void ensureContent().then((c) => {
      const g = [...c.texts, ...c.groups].find((x) => x.id === choice.groupId)
      setText({ name: g?.name ?? '', words: g ? textWords(g.words.map((w) => w.text)) : [] })
    })
  }, [choice.groupId])

  const frames = useMemo(() => (text ? buildFrames(text.words, choice.chunk, choice.nikud) : []), [text, choice.chunk, choice.nikud])

  // 3 - 2 - 1
  useEffect(() => {
    if (count === null) return
    if (count === 0) return setCount(null)
    const id = window.setTimeout(() => setCount(count - 1), 800)
    return () => window.clearTimeout(id)
  }, [count])

  // The clock: show the frame, wait, show the next. Starts slower and speeds up over the first words.
  useEffect(() => {
    if (!playing || count !== null || done || !frames.length) return
    const f = frames[idx]
    const factor = choice.ramp ? Math.min(1, 0.55 + 0.45 * (f.word / 12)) : 1
    const eff = Math.max(MIN_WPM, wpm * factor)
    const ms = (60000 / eff) * (f.weight + f.pause)
    const id = window.setTimeout(() => {
      if (idx + 1 >= frames.length) setDone(true)
      else setIdx(idx + 1)
    }, ms)
    return () => window.clearTimeout(id)
  }, [playing, count, done, frames, idx, wpm, choice.ramp])

  useEffect(() => {
    peak.current = Math.max(peak.current, wpm)
  }, [wpm])

  if (!text) return <div className="game loading">…</div>
  if (!frames.length) return <div className="game loading">{t('אין שורות בטקסט')}</div>

  if (done)
    return (
      <RsvpFinish
        choice={choice}
        wpm={wpm}
        words={text.words.length}
        name={text.name}
        session={session.current}
        onRestart={onRestart}
        onExit={onExit}
      />
    )

  const back = () => {
    const target = Math.max(0, frames[idx].word - 10)
    setIdx(frames.findIndex((f) => f.word >= target))
  }

  return (
    <div className="game rsvp">
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label={t('חזרה')}>
          ✕
        </button>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(idx / frames.length) * 100}%` }} />
        </div>
        <span className="score">{wpm}</span>
      </header>
      <p className="group-tag">{text.name}</p>

      <div className="rsvp-stage" dir="rtl" style={{ fontSize: `calc(clamp(2.2rem, 11vw, 4rem) * ${size})` }}>
        {count !== null ? <span className="rsvp-count">{count || '▶'}</span> : <Shown frame={frames[idx]} choice={choice} />}
      </div>

      <div className="finish-actions">
        <button className="btn icon-btn" onClick={back} aria-label={t('חזרה 10 מילים')}>
          ⏪
        </button>
        <button className="btn primary icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('עצור') : t('המשך')}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="btn icon-btn" onClick={() => setSize((s) => Math.max(0.6, s - 0.2))} aria-label={t('אות קטנה יותר')}>
          א−
        </button>
        <button className="btn icon-btn" onClick={() => setSize((s) => Math.min(1.6, s + 0.2))} aria-label={t('אות גדולה יותר')}>
          א+
        </button>
      </div>

      <div className="pace" dir="ltr">
        <span>🐢</span>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={sliderFromWpm(wpm)}
          onChange={(e) => setWpm(wpmFromSlider(Number(e.target.value)))}
          aria-label={t('קצב')}
        />
        <span>🐇</span>
      </div>
      <p className="hint-text">
        {wpm} {t('מילים בדקה')} ({MIN_WPM}–{MAX_WPM})
      </p>
    </div>
  )
}

const FEELINGS: { v: Feeling; icon: string; label: string }[] = [
  { v: 1, icon: '😓', label: 'היה קשה' },
  { v: 2, icon: '🙂', label: 'בסדר' },
  { v: 3, icon: '😀', label: 'היה קל' },
]
const SUCCESSES: { v: Success; icon: string; label: string }[] = [
  { v: 1, icon: '🌱', label: 'קצת' },
  { v: 2, icon: '🌿', label: 'רוב הטקסט' },
  { v: 3, icon: '🌳', label: 'כמעט הכול' },
]

function RsvpFinish({
  choice,
  wpm,
  words,
  name,
  session,
  onRestart,
  onExit,
}: {
  choice: RsvpChoice
  wpm: number
  words: number
  name: string
  session: Promise<string | null> | null
  onRestart: () => void
  onExit: () => void
}) {
  const [feeling, setFeeling] = useState<Feeling | null>(null)
  const [success, setSuccess] = useState<Success | null>(null)
  const [keep, setKeep] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    sfx.finish()
    earnStar()
  }, [])

  const save = async () => {
    const record: RsvpRecord = { textId: choice.groupId, wpm, feeling, success, saved: keep }
    const id = await session
    await saveSessionDetails(id, words, words, [record])
    await finishSession(id, words, words, [record])
    setSaved(true)
  }

  const harder = feeling === 3 && success === 3
  return (
    <div className="game finish">
      <Confetti fire={1} />
      <StarBar />
      <h2>{t('סיימנו!')}</h2>
      <p className="group-tag">
        {name} · {words} {t('מילים')} · {wpm} {t('מילים בדקה')}
      </p>

      {saved ? (
        <>
          <p className="prompt">{keep ? t('נשמר! בפעם הבאה נמשיך מהקצב הזה.') : t('תודה!')}</p>
          <div className="finish-actions">
            <button className="btn primary" onClick={onRestart}>
              {t('עוד פעם')}
            </button>
            <button className="btn" onClick={onExit}>
              {t('סיום')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="prompt">{t('איך היה?')}</p>
          <div className="presets">
            {FEELINGS.map((f) => (
              <button key={f.v} className={feeling === f.v ? 'toggle on' : 'toggle'} onClick={() => setFeeling(f.v)}>
                <span className="toggle-sample">{f.icon}</span>
                {t(f.label)}
              </button>
            ))}
          </div>
          <p className="prompt">{t('כמה הבנתי וקראתי?')}</p>
          <div className="presets">
            {SUCCESSES.map((s) => (
              <button key={s.v} className={success === s.v ? 'toggle on' : 'toggle'} onClick={() => setSuccess(s.v)}>
                <span className="toggle-sample">{s.icon}</span>
                {t(s.label)}
              </button>
            ))}
          </div>
          {harder && <p className="muted">{t('נראה שאפשר לנסות קצב קצת יותר מהיר בפעם הבאה.')}</p>}
          <label className="keep">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {t('לשמור את הטקסט והקצב לפעם הבאה')}
          </label>
          <div className="finish-actions">
            <button className="btn primary" onClick={() => void save()}>
              {t('סיום')}
            </button>
            <button className="btn" onClick={onRestart}>
              {t('בלי לשמור, עוד פעם')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
