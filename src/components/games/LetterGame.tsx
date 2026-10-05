import { useEffect, useMemo, useRef, useState } from 'react'
import { LETTERS, Letter, SIMILAR_GROUPS, similarLetters } from '../../data/hebrew'
import { playLetterName, praise, sfx, stopAudio } from '../../lib/audio'
import { earnStar } from '../../lib/stars'
import { finishSession, startSession } from '../../lib/supabase'
import { t } from '../../lib/i18n'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { StarBar } from '../ui/StarBar'
import { Stars } from '../ui/Stars'

const ROUNDS = 10

type Mode = 'similar' | 'right'
type Distortion = 'normal' | 'mirror' | 'flip' | 'rotate' | 'broken' | 'extras'
const DISTORTIONS: Exclude<Distortion, 'normal'>[] = ['mirror', 'flip', 'rotate', 'broken', 'extras']

type Option = { key: string; letter: Letter; distortion: Distortion }
type Question = { target: Letter; options: Option[] }

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

const SIMILAR_POOL = SIMILAR_GROUPS.flat().map((g) => LETTERS.find((l) => l.glyph === g)!).filter(Boolean)
const PLAIN_POOL = LETTERS.filter((l) => !l.isFinal)

function makeQuestion(mode: Mode, recent: string[]): Question {
  const pool = (mode === 'similar' ? SIMILAR_POOL : PLAIN_POOL).filter((l) => !recent.includes(l.glyph))
  const target = pick(pool)
  if (mode === 'similar') {
    const others = similarLetters(target.glyph).map((g) => LETTERS.find((l) => l.glyph === g)!)
    const extra = shuffle(SIMILAR_POOL.filter((l) => l.glyph !== target.glyph && !others.includes(l)))
    const picks = [...shuffle(others), ...extra].slice(0, 2)
    return {
      target,
      options: shuffle([target, ...picks].map((letter) => ({ key: letter.glyph, letter, distortion: 'normal' as const }))),
    }
  }
  const wrong = shuffle(DISTORTIONS).slice(0, 2)
  return {
    target,
    options: shuffle([
      { key: 'normal', letter: target, distortion: 'normal' as const },
      ...wrong.map((d) => ({ key: d, letter: target, distortion: d })),
    ]),
  }
}

type Props = { mode: Mode; onExit: () => void; onRestart: () => void }

/**
 * 'similar': hear a letter's name and find it among look-alikes (ב כ פ, ד ר, ה ח ת …).
 * 'right': hear a letter's name and find the correct one among mirrored, upside-down, broken
 * or decorated copies of it.
 */
export function LetterGame({ mode, onExit, onRestart }: Props) {
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const recent = useRef<string[]>([])
  const [question, setQuestion] = useState<Question>(() => makeQuestion(mode, []))
  const [picked, setPicked] = useState<string | null>(null)
  const [status, setStatus] = useState<'asking' | 'right' | 'wrong'>('asking')
  const [firstTry, setFirstTry] = useState(true)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)
  const session = useRef<Promise<string | null> | null>(null)
  const scoreRef = useRef(0)
  const details = useRef<unknown[]>([])

  useEffect(() => {
    session.current ??= startSession(mode === 'similar' ? 'similar_letters' : 'right_letter')
    return () => stopAudio()
  }, [mode])

  useEffect(() => {
    if (!done) void playLetterName(question.target)
  }, [question, done])

  const answer = useMemo(() => question.options.find((o) => o.distortion === 'normal' && o.letter.glyph === question.target.glyph)!, [question])

  const choose = (o: Option) => {
    if (status === 'right') return
    const correct = o.key === answer.key
    setPicked(o.key)
    if (firstTry) {
      details.current.push({ letter: question.target.glyph, chosen: o.key, correct })
      if (correct) {
        scoreRef.current += 1
        setScore(scoreRef.current)
        earnStar()
      }
      setFirstTry(false)
    }
    if (correct) {
      setStatus('right')
      setConfetti((c) => c + 1)
      sfx.correct()
      void praise(0.3)
      window.setTimeout(() => {
        if (round + 1 >= ROUNDS) {
          setDone(true)
          void session.current?.then((id) => finishSession(id, ROUNDS, scoreRef.current, details.current))
        } else {
          recent.current = [question.target.glyph, ...recent.current].slice(0, 4)
          setRound((r) => r + 1)
          setQuestion(makeQuestion(mode, recent.current))
          setStatus('asking')
          setPicked(null)
          setFirstTry(true)
        }
      }, 1500)
    } else {
      setStatus('wrong')
      sfx.wrong()
      window.setTimeout(() => void playLetterName(question.target), 600)
    }
  }

  if (done)
    return <FinishScreen score={score} total={ROUNDS} groupId={null} onRestart={onRestart} onExit={onExit} onPlayGroup={() => {}} />

  return (
    <div className="game">
      <Confetti fire={confetti} />
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label={t('חזרה')}>
          ✕
        </button>
        <Stars total={ROUNDS} filled={round} />
      </header>
      <StarBar />

      <button className="listen" onClick={() => void playLetterName(question.target)} aria-label={t('שמע שוב')}>
        🔊
      </button>
      <p className="prompt icon-prompt">{mode === 'similar' ? '👂 ⬅ 🔍' : '👂 ⬅ ✅'}</p>

      <div className="choices letters">
        {question.options.map((o) => (
          <button
            key={o.key}
            className={`choice${picked === o.key && status === 'wrong' ? ' wrong' : ''}${o.key === answer.key && status === 'right' ? ' right' : ''}`}
            onClick={() => choose(o)}
          >
            <span className={`glyph ${o.distortion}`}>{o.letter.glyph}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
