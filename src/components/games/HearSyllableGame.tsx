import { useCallback, useEffect, useRef, useState } from 'react'
import { Syllable, syllableText } from '../../data/hebrew'
import { playLetterName, playSyllable, sfx } from '../../lib/audio'
import { Question, makeQuestion } from '../../lib/questions'
import {
  ProgressRow,
  finishSession,
  loadProgress,
  recordAnswer,
  startSession,
} from '../../lib/supabase'
import { Stars } from '../ui/Stars'

const ROUNDS = 10
const GAME_TYPE = 'hear_syllable'

type Status = 'asking' | 'right' | 'wrong'

type Props = { onExit: () => void; onRestart: () => void }

export function HearSyllableGame({ onExit, onRestart }: Props) {
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [question, setQuestion] = useState<Question>(() => makeQuestion([], []))
  const [status, setStatus] = useState<Status>('asking')
  const [picked, setPicked] = useState<Syllable | null>(null)
  const [firstTry, setFirstTry] = useState(true)
  const [done, setDone] = useState(false)

  const sessionId = useRef<Promise<string | null> | null>(null)
  const recent = useRef<Syllable[]>([])
  const details = useRef<unknown[]>([])
  // Read from setTimeout callbacks, so keep it in a ref as well as state.
  const scoreRef = useRef(0)

  useEffect(() => {
    sessionId.current ??= startSession(GAME_TYPE)
    loadProgress().then(setProgress)
  }, [])

  // Say the syllable whenever a new question appears.
  useEffect(() => {
    if (!done) void playSyllable(question.answer)
  }, [question, done])

  const next = useCallback(() => {
    if (round + 1 >= ROUNDS) {
      setDone(true)
      sfx.finish()
      void sessionId.current?.then((id) => finishSession(id, ROUNDS, scoreRef.current, details.current))
      return
    }
    recent.current = [question.answer, ...recent.current].slice(0, 4)
    setRound((r) => r + 1)
    setQuestion(makeQuestion(progress, recent.current))
    setStatus('asking')
    setPicked(null)
    setFirstTry(true)
  }, [round, question, progress])

  const choose = (choice: Syllable) => {
    if (status === 'right') return
    const { answer } = question
    const correct = choice.letter.id === answer.letter.id && choice.nikud.id === answer.nikud.id
    setPicked(choice)

    // Only the first try counts toward score and progress.
    if (firstTry) {
      void recordAnswer(answer.letter.id, answer.nikud.id, correct)
      details.current.push({
        answer: syllableText(answer),
        chosen: syllableText(choice),
        correct,
      })
      setProgress((rows) => {
        const row = rows.find(
          (r) => r.letter_id === answer.letter.id && r.nikud_id === answer.nikud.id,
        )
        const updated = {
          letter_id: answer.letter.id,
          nikud_id: answer.nikud.id,
          attempts: (row?.attempts ?? 0) + 1,
          correct: (row?.correct ?? 0) + (correct ? 1 : 0),
        }
        return [...rows.filter((r) => r !== row), updated]
      })
      setFirstTry(false)
    }

    if (correct) {
      if (firstTry) {
        scoreRef.current += 1
        setScore(scoreRef.current)
      }
      setStatus('right')
      sfx.correct()
      setTimeout(next, 1400)
    } else {
      setStatus('wrong')
      sfx.wrong()
      // Let him hear what he picked, then the target again.
      setTimeout(async () => {
        await playSyllable(choice)
        await new Promise((r) => setTimeout(r, 400))
        await playSyllable(answer)
      }, 450)
    }
  }

  if (done) {
    const stars = score >= 9 ? 3 : score >= 6 ? 2 : 1
    return (
      <div className="game finish">
        <div className="big-stars">{'⭐'.repeat(stars)}</div>
        <h2>כל הכבוד דובי!</h2>
        <p className="finish-score">
          {score} מתוך {ROUNDS}
        </p>
        <div className="finish-actions">
          <button className="btn primary" onClick={onRestart}>
            עוד פעם
          </button>
          <button className="btn" onClick={onExit}>
            חזרה
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="game">
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label="חזרה">
          ✕
        </button>
        <Stars total={ROUNDS} filled={round} />
        <span className="score">⭐ {score}</span>
      </header>

      <button
        className="listen"
        onClick={() => void playSyllable(question.answer)}
        aria-label="שמע שוב"
      >
        🔊
      </button>
      <p className="prompt">מה שמעת?</p>

      <div className="choices">
        {question.choices.map((c) => {
          const isPicked = picked && c.letter.id === picked.letter.id && c.nikud.id === picked.nikud.id
          const isAnswer =
            c.letter.id === question.answer.letter.id && c.nikud.id === question.answer.nikud.id
          const cls = [
            'choice',
            isPicked && status === 'wrong' ? 'wrong' : '',
            isAnswer && status === 'right' ? 'right' : '',
          ].join(' ')
          return (
            <button key={c.letter.id + '_' + c.nikud.id} className={cls} onClick={() => choose(c)}>
              {syllableText(c)}
            </button>
          )
        })}
      </div>

      {status === 'wrong' && (
        <button className="hint" onClick={() => void playLetterName(question.answer.letter)}>
          רמז: איזו אות? 🔤
        </button>
      )}
    </div>
  )
}
