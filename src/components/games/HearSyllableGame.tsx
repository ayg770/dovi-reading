import { useCallback, useEffect, useRef, useState } from 'react'
import { Syllable } from '../../data/hebrew'
import { playItem, playLetterName, praise, sfx } from '../../lib/audio'
import { ensureContent } from '../../lib/content'
import { Item, asSyllable, groupItems, syllableItem } from '../../lib/items'
import { makeQuestion, makeWordQuestion } from '../../lib/questions'
import { Selection } from '../../lib/selection'
import { earnStar } from '../../lib/stars'
import {
  ProgressRow,
  finishSession,
  loadProgress,
  recordAnswer,
  startSession,
} from '../../lib/supabase'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { StarBar } from '../ui/StarBar'
import { Stars } from '../ui/Stars'

const SINGLES_ROUNDS = 10
const GAME_TYPE = 'hear_syllable'

type Status = 'asking' | 'right' | 'wrong'

type Round = { answer: Item; choices: Item[] }

type Props = {
  selection: Selection
  onExit: () => void
  onRestart: () => void
  onPlayGroup: (groupId: string) => void
}

/** Hear a syllable (or a word from a group) and pick how it is written. */
export function HearSyllableGame({ selection, onExit, onRestart, onPlayGroup }: Props) {
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [groupWords, setGroupWords] = useState<Item[] | null>(null)
  const [groupName, setGroupName] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [question, setQuestion] = useState<Round | null>(null)
  const [status, setStatus] = useState<Status>('asking')
  const [picked, setPicked] = useState<Item | null>(null)
  const [firstTry, setFirstTry] = useState(true)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)

  const sessionId = useRef<Promise<string | null> | null>(null)
  const recent = useRef<Syllable[]>([])
  const details = useRef<unknown[]>([])
  // Read from setTimeout callbacks, so keep it in a ref as well as state.
  const scoreRef = useRef(0)

  const nikudIds = selection.kind === 'singles' ? selection.nikudIds : []
  const total = groupWords ? groupWords.length : SINGLES_ROUNDS

  const singlesQuestion = useCallback(
    (rows: ProgressRow[]): Round => {
      const q = makeQuestion(rows, recent.current, nikudIds)
      recent.current = [q.answer, ...recent.current].slice(0, 4)
      return { answer: syllableItem(q.answer), choices: q.choices.map(syllableItem) }
    },
    [nikudIds.join()],
  )

  useEffect(() => {
    sessionId.current ??= startSession(GAME_TYPE)
    void Promise.all([ensureContent(), loadProgress()]).then(([content, rows]) => {
      setProgress(rows)
      const group =
        selection.kind === 'group' ? content.groups.find((g) => g.id === selection.groupId) : null
      if (group && group.words.length) {
        // A group plays its words in order, each against the most similar others.
        const words = groupItems(group)
        setGroupWords(words)
        setGroupName(group.name)
        setQuestion(makeWordQuestion(words[0], words))
      } else {
        setQuestion(singlesQuestion(rows))
      }
      setReady(true)
    })
  }, [selection, singlesQuestion])

  // Say it whenever a new question appears.
  useEffect(() => {
    if (question && !done) void playItem(question.answer)
  }, [question, done])

  const next = useCallback(() => {
    if (!question) return
    if (round + 1 >= total) {
      setDone(true)
      void sessionId.current?.then((id) => finishSession(id, total, scoreRef.current, details.current))
      return
    }
    setRound((r) => r + 1)
    setQuestion(groupWords ? makeWordQuestion(groupWords[round + 1], groupWords) : singlesQuestion(progress))
    setStatus('asking')
    setPicked(null)
    setFirstTry(true)
  }, [round, total, question, progress, groupWords, singlesQuestion])

  if (!ready || !question) return <div className="game loading">…</div>

  const answerSyllable = asSyllable(question.answer)

  const choose = (choice: Item) => {
    if (status === 'right') return
    const { answer } = question
    const correct = choice.key === answer.key
    setPicked(choice)

    // Only the first try counts toward score and progress.
    if (firstTry) {
      for (const s of answer.syllables)
        if (s.letter_id && s.nikud_id) void recordAnswer(s.letter_id, s.nikud_id, correct)
      details.current.push({ answer: answer.text, chosen: choice.text, correct })
      if (answerSyllable) {
        const { letter, nikud } = answerSyllable
        setProgress((rows) => {
          const row = rows.find((r) => r.letter_id === letter.id && r.nikud_id === nikud.id)
          const updated = {
            letter_id: letter.id,
            nikud_id: nikud.id,
            attempts: (row?.attempts ?? 0) + 1,
            correct: (row?.correct ?? 0) + (correct ? 1 : 0),
          }
          return [...rows.filter((r) => r !== row), updated]
        })
      }
      setFirstTry(false)
    }

    if (correct) {
      if (firstTry) {
        scoreRef.current += 1
        setScore(scoreRef.current)
        earnStar()
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
        await playItem(choice)
        await new Promise((r) => setTimeout(r, 400))
        await playItem(answer)
      }, 600)
    }
  }

  if (done)
    return (
      <FinishScreen
        score={score}
        total={total}
        groupId={selection.kind === 'group' && groupWords ? selection.groupId : null}
        groupName={groupName}
        onRestart={onRestart}
        onExit={onExit}
        onPlayGroup={onPlayGroup}
      />
    )

  return (
    <div className="game">
      <Confetti fire={confetti} />
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label="חזרה">
          ✕
        </button>
        <Stars total={total} filled={round} />
      </header>
      <StarBar />
      {groupName && <p className="group-tag">{groupName}</p>}

      <button className="listen" onClick={() => void playItem(question.answer)} aria-label="שמע שוב">
        🔊
      </button>
      <p className="prompt icon-prompt" aria-label="מה שמעת?">
        👂 ⬅ 👆
      </p>

      <div className={groupWords ? 'choices words' : 'choices'}>
        {question.choices.map((c) => {
          const cls = [
            'choice',
            picked?.key === c.key && status === 'wrong' ? 'wrong' : '',
            c.key === question.answer.key && status === 'right' ? 'right' : '',
          ].join(' ')
          return (
            <button key={c.key} className={cls} onClick={() => choose(c)}>
              {c.text}
            </button>
          )
        })}
      </div>

      {status === 'wrong' && answerSyllable && (
        <button className="hint" onClick={() => void playLetterName(answerSyllable.letter)}>
          💡 🔤
        </button>
      )}
    </div>
  )
}
