import { useCallback, useEffect, useRef, useState } from 'react'
import { Syllable, syllableText } from '../../data/hebrew'
import { playLetterName, playSyllable, praise, sfx } from '../../lib/audio'
import { ensureContent } from '../../lib/content'
import { activeGroup, groupSyllables } from '../../lib/items'
import { Question, makeQuestion } from '../../lib/questions'
import {
  ProgressRow,
  finishSession,
  getLearner,
  loadProgress,
  recordAnswer,
  startSession,
} from '../../lib/supabase'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { Stars } from '../ui/Stars'

const ROUNDS = 10
const GAME_TYPE = 'hear_syllable'

type Status = 'asking' | 'right' | 'wrong'

type Props = { onExit: () => void; onRestart: () => void }

export function HearSyllableGame({ onExit, onRestart }: Props) {
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [pool, setPool] = useState<Syllable[]>([])
  const [groupName, setGroupName] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [question, setQuestion] = useState<Question | null>(null)
  const [status, setStatus] = useState<Status>('asking')
  const [picked, setPicked] = useState<Syllable | null>(null)
  const [firstTry, setFirstTry] = useState(true)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)

  const sessionId = useRef<Promise<string | null> | null>(null)
  const recent = useRef<Syllable[]>([])
  const details = useRef<unknown[]>([])
  // Read from setTimeout callbacks, so keep it in a ref as well as state.
  const scoreRef = useRef(0)

  useEffect(() => {
    sessionId.current ??= startSession(GAME_TYPE)
    void Promise.all([ensureContent(), getLearner(), loadProgress()]).then(
      ([content, learner, rows]) => {
        const group = activeGroup(content, learner)
        const syllables = group ? groupSyllables(group) : []
        // A group needs at least two syllables to make a listening question.
        const usable = syllables.length >= 2 ? syllables : []
        setPool(usable)
        setGroupName(usable.length && group ? group.name : null)
        setProgress(rows)
        setQuestion(makeQuestion(rows, [], usable))
        setReady(true)
      },
    )
  }, [])

  // Say the syllable whenever a new question appears.
  useEffect(() => {
    if (question && !done) void playSyllable(question.answer)
  }, [question, done])

  const next = useCallback(() => {
    if (!question) return
    if (round + 1 >= ROUNDS) {
      setDone(true)
      void sessionId.current?.then((id) => finishSession(id, ROUNDS, scoreRef.current, details.current))
      return
    }
    recent.current = [question.answer, ...recent.current].slice(0, 4)
    setRound((r) => r + 1)
    setQuestion(makeQuestion(progress, recent.current, pool))
    setStatus('asking')
    setPicked(null)
    setFirstTry(true)
  }, [round, question, progress, pool])

  if (!ready || !question) return <div className="game loading">…</div>

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
      setConfetti((c) => c + 1)
      sfx.correct()
      void praise(0.3)
      setTimeout(next, 1600)
    } else {
      setStatus('wrong')
      sfx.wrong()
      // Let him hear what he picked, then the target again.
      setTimeout(async () => {
        await playSyllable(choice)
        await new Promise((r) => setTimeout(r, 400))
        await playSyllable(answer)
      }, 600)
    }
  }

  if (done)
    return (
      <FinishScreen
        score={score}
        total={ROUNDS}
        groupName={groupName}
        onRestart={onRestart}
        onExit={onExit}
      />
    )

  return (
    <div className="game">
      <Confetti fire={confetti} />
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label="חזרה">
          ✕
        </button>
        <Stars total={ROUNDS} filled={round} />
        <span className="score">⭐ {score}</span>
      </header>
      {groupName && <p className="group-tag">{groupName}</p>}

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
