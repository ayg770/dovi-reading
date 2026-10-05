import { useEffect, useMemo, useRef, useState } from 'react'
import { parseText } from '../../data/hebrew'
import { speak, stopAudio } from '../../lib/audio'
import { ensureContent } from '../../lib/content'
import { wordsOf } from '../../lib/texts'
import { t } from '../../lib/i18n'
import { finishSession, startSession } from '../../lib/supabase'
import { FinishScreen } from '../ui/FinishScreen'

type Props = {
  groupId: string
  /** seconds per word at the start (can be changed while reading) */
  pace: number
  onExit: () => void
  onRestart: () => void
}

/**
 * The text is shown one line at a time and its words light up one after another at the
 * chosen pace, so the reader keeps up with the highlight. Longer words get a little longer.
 */
export function TextAutoGame({ groupId, pace: startPace, onExit, onRestart }: Props) {
  const [lines, setLines] = useState<string[] | null>(null)
  const [name, setName] = useState('')
  const [line, setLine] = useState(0)
  const [word, setWord] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [pace, setPace] = useState(startPace)
  const [done, setDone] = useState(false)
  const session = useRef<Promise<string | null> | null>(null)

  useEffect(() => {
    session.current ??= startSession('read_text')
    void ensureContent().then((c) => {
      const g = c.texts.find((x) => x.id === groupId)
      setLines(g ? g.words.map((w) => w.text) : [])
      setName(g?.name ?? '')
    })
    return () => stopAudio()
  }, [groupId])

  const words = useMemo(() => (lines ? wordsOf(lines[line] ?? '') : []), [lines, line])
  // How long each word stays lit: the pace for a one-syllable word, a bit more for longer ones.
  const durations = useMemo(
    () => words.map((w) => pace * (0.5 + 0.5 * Math.max(1, parseText(w).length))),
    [words, pace],
  )

  // The clock: light the next word, or after the last one wait a moment and go to the next line.
  useEffect(() => {
    if (!playing || !lines || done || !words.length) return
    const last = word >= words.length - 1
    const wait = last ? pace * 2 : durations[word]
    const id = window.setTimeout(() => {
      if (!last) return setWord((w) => w + 1)
      if (line + 1 >= lines.length) {
        setDone(true)
        void session.current?.then((sid) => finishSession(sid, lines.length, lines.length, []))
      } else {
        setLine((l) => l + 1)
        setWord(0)
      }
    }, wait * 1000)
    return () => window.clearTimeout(id)
  }, [playing, lines, done, words, word, line, pace, durations])

  if (!lines) return <div className="game loading">…</div>
  if (!lines.length) return <div className="game loading">{t('אין שורות בטקסט')}</div>
  if (done) return <FinishScreen score={lines.length} total={lines.length} groupName={name} onRestart={onRestart} onExit={onExit} onPlayGroup={() => {}} />

  const goLine = (to: number) => {
    stopAudio()
    setLine(Math.min(lines.length - 1, Math.max(0, to)))
    setWord(0)
  }

  return (
    <div className="game text-auto">
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label={t('חזרה')}>
          ✕
        </button>
        <div className="progress-bar" aria-label={`${line + 1} / ${lines.length}`}>
          <div className="progress-fill" style={{ width: `${(line / lines.length) * 100}%` }} />
        </div>
        <span className="score">
          {line + 1}/{lines.length}
        </span>
      </header>
      <p className="group-tag">{name}</p>

      <div className="text-card" dir="rtl">
        {words.map((w, i) => (
          <span key={i} className={i === word ? 'tword on' : i < word ? 'tword past' : 'tword'}>
            {w}
          </span>
        ))}
      </div>

      <div className="finish-actions">
        <button className="btn icon-btn" onClick={() => goLine(line - 1)} disabled={line === 0} aria-label={t('הקודם')}>
          ⏮
        </button>
        <button className="btn primary icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('עצור') : t('המשך')}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="btn icon-btn" onClick={() => goLine(line + 1)} aria-label={t('דלג')}>
          ⏭
        </button>
        <button
          className="btn icon-btn"
          onClick={() => {
            setPlaying(false)
            void speak(lines[line], 0.8)
          }}
          aria-label={t('שמע')}
        >
          🔊
        </button>
      </div>

      <div className="pace" dir="ltr">
        <span>🐢</span>
        <input
          type="range"
          min={0.3}
          max={3}
          step={0.1}
          value={3.3 - pace}
          onChange={(e) => setPace(3.3 - Number(e.target.value))}
          aria-label={t('קצב')}
        />
        <span>🐇</span>
      </div>
    </div>
  )
}
