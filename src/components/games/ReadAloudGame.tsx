import { useEffect, useRef, useState } from 'react'
import { playItem, playUrl, praise, sfx, stopAudio } from '../../lib/audio'
import { ensureContent } from '../../lib/content'
import { Item, groupItems, randomSyllableItems } from '../../lib/items'
import { Selection } from '../../lib/selection'
import { canRecord, startRecording } from '../../lib/recorder'
import { canRecognize, heardMatches, listen } from '../../lib/speech'
import { finishSession, recordAnswer, startSession } from '../../lib/supabase'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { Stars } from '../ui/Stars'

const GAME_TYPE = 'read_aloud'
const RANDOM_ROUNDS = 10
const MAX_TRIES = 3
/** After this many attempts where the recognizer heard nothing, a grown-up decides. */
const MAX_EMPTY = 2

/**
 * Recording his voice while the recognizer listens needs the mic twice. Phones and
 * Safari give it to only one of them, and then the recognizer hears nothing — so there
 * we only recognize. Desktop Chrome/Edge handle both.
 */
const SHARED_MIC_OK = (() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg/.test(ua)
  return !mobile && !safari
})()

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'צריך לאשר גישה למיקרופון בדפדפן',
  'service-not-allowed': 'צריך לאשר גישה למיקרופון בדפדפן',
  'language-not-supported': 'זיהוי קול בעברית לא זמין במכשיר הזה',
  network: 'אין חיבור לשירות זיהוי הקול',
  'audio-capture': 'המיקרופון לא זמין',
}

type Phase = 'look' | 'listening' | 'judge' | 'right' | 'wrong'

type Props = {
  selection: Selection
  onExit: () => void
  onRestart: () => void
  onPlayGroup: (groupId: string) => void
}

export function ReadAloudGame({ selection, onExit, onRestart, onPlayGroup }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [groupName, setGroupName] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('look')
  const [tries, setTries] = useState(0)
  const [heard, setHeard] = useState<string>('')
  const [notice, setNotice] = useState<string | null>(null)
  const [empties, setEmpties] = useState(0)
  const [myVoice, setMyVoice] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)

  const sessionId = useRef<Promise<string | null> | null>(null)
  const details = useRef<unknown[]>([])
  const scoreRef = useRef(0)
  const recordAlongside = useRef(canRecord && (SHARED_MIC_OK || !canRecognize))
  const stopListening = useRef<() => void>(() => {})

  useEffect(() => {
    sessionId.current ??= startSession(GAME_TYPE)
    void ensureContent().then((content) => {
      const group =
        selection.kind === 'group' ? content.groups.find((g) => g.id === selection.groupId) : null
      if (group && group.words.length) {
        setItems(groupItems(group))
        setGroupName(group.name)
      } else {
        setItems(randomSyllableItems(RANDOM_ROUNDS, selection.kind === 'singles' ? selection.nikudIds : undefined))
      }
    })
    return () => {
      stopListening.current()
      stopAudio()
    }
  }, [selection])

  // Free the previous attempt's audio.
  useEffect(() => {
    return () => {
      if (myVoice) URL.revokeObjectURL(myVoice)
    }
  }, [myVoice])

  if (!items) return <div className="game loading">…</div>

  const item = items[index]
  const total = items.length

  const finishItem = (correct: boolean, how: string) => {
    const firstTry = tries === 0
    if (how === 'parent-override' && tries === 1) {
      // The recognizer got his first try wrong; count it as the right answer it was.
      const last = details.current[details.current.length - 1] as { correct: boolean; how: string }
      last.correct = true
      last.how = how
      scoreRef.current += 1
      setScore(scoreRef.current)
    } else if (firstTry) {
      for (const s of item.syllables)
        if (s.letter_id && s.nikud_id) void recordAnswer(s.letter_id, s.nikud_id, correct)
      details.current.push({ item: item.text, correct, how, heard })
      if (correct) {
        scoreRef.current += 1
        setScore(scoreRef.current)
      }
    }
    setTries((t) => t + 1)
    if (correct) {
      setPhase('right')
      setConfetti((c) => c + 1)
      sfx.correct()
      setTimeout(() => void praise(0.6), 700)
    } else {
      setPhase('wrong')
      sfx.wrong()
    }
  }

  const goNext = () => {
    stopAudio()
    setNotice(null)
    setMyVoice(null)
    setHeard('')
    setTries(0)
    setEmpties(0)
    if (index + 1 >= total) {
      setDone(true)
      void sessionId.current?.then((id) => finishSession(id, total, scoreRef.current, details.current))
      return
    }
    setIndex((i) => i + 1)
    setPhase('look')
  }

  const startTurn = async () => {
    stopAudio()
    setNotice(null)
    setHeard('')
    setMyVoice(null)
    sfx.start()
    await new Promise((r) => setTimeout(r, 250))

    let rec: Awaited<ReturnType<typeof startRecording>> | null = null
    if (recordAlongside.current) {
      try {
        rec = await startRecording(6000)
      } catch {
        recordAlongside.current = false
      }
    }

    if (!canRecognize) {
      // No speech recognition in this browser: record, then a grown-up decides.
      setPhase('listening')
      stopListening.current = () => {
        void rec?.stop().then((b) => setMyVoice(URL.createObjectURL(b)))
        setPhase('judge')
      }
      if (!rec) setPhase('judge')
      return
    }

    setPhase('listening')
    const l = listen()
    stopListening.current = l.stop
    const result = await l.result
    const blob = rec ? await rec.stop() : null
    if (blob && blob.size) setMyVoice(URL.createObjectURL(blob))

    if (!result.alternatives.length) {
      // Recording alongside may have taken the mic from the recognizer: stop doing that.
      if (rec) recordAlongside.current = false
      const code = result.error ?? 'empty'
      const soft = !result.error || result.error === 'no-speech' || result.error === 'aborted'
      if (soft && empties + 1 < MAX_EMPTY) {
        // Heard nothing: let him try again without counting it.
        setEmpties((n) => n + 1)
        setNotice(`לא שמעתי, ננסה שוב? (${code})`)
        setPhase('look')
      } else {
        // The recognizer keeps failing (no permission, no network, silence…): a grown-up decides.
        setNotice(`${ERROR_TEXT[code] ?? 'הזיהוי לא שמע'} (${code})`)
        setPhase('judge')
      }
      return
    }
    setEmpties(0)
    setHeard(result.alternatives[0])
    finishItem(heardMatches(result.alternatives, item.syllables), 'speech')
  }

  if (done)
    return (
      <FinishScreen
        score={score}
        total={total}
        groupId={selection.kind === 'group' && groupName ? selection.groupId : null}
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
        <Stars total={total} filled={index} />
        <span className="score">⭐ {score}</span>
      </header>
      {groupName && <p className="group-tag">{groupName}</p>}

      <div className={`read-card ${phase === 'right' ? 'right' : phase === 'wrong' ? 'wrong' : ''}`}>
        <span className="read-text">{item.text}</span>
      </div>

      {phase === 'look' && (
        <>
          <p className="prompt">קרא בקול!</p>
          <div className="read-actions">
            <button className="round-btn mic" onClick={() => void startTurn()} aria-label="עכשיו אני">
              🎤
            </button>
            <button className="round-btn listen-small" onClick={() => void playItem(item)} aria-label="שמע">
              🔊
            </button>
          </div>
          <p className="hint-text">{notice ?? 'לוחצים על 🎤 ואומרים. אפשר לשמוע קודם ב-🔊'}</p>
        </>
      )}

      {phase === 'listening' && (
        <>
          <button className="round-btn mic listening" onClick={() => stopListening.current()}>
            🎤
          </button>
          <p className="prompt">מקשיב…</p>
        </>
      )}

      {phase === 'judge' && (
        <div className="judge">
          {notice && <p className="heard">{notice}</p>}
          {heard && <p className="heard">{heard}</p>}
          {myVoice && (
            <button className="btn" onClick={() => void playUrl(myVoice)}>
              ▶ שמע את עצמך
            </button>
          )}
          <p className="hint-text">הורה: האם הוא קרא נכון?</p>
          <div className="finish-actions">
            <button className="btn good" onClick={() => finishItem(true, 'parent')}>
              ✓ נכון
            </button>
            <button className="btn bad" onClick={() => finishItem(false, 'parent')}>
              ✗ עוד לא
            </button>
          </div>
          {canRecognize && (
            <button className="parent-link" onClick={() => void startTurn()}>
              🎤 לנסות שוב את זיהוי הקול
            </button>
          )}
        </div>
      )}

      {(phase === 'right' || phase === 'wrong') && (
        <div className="judge">
          <p className="prompt">{phase === 'right' ? 'יופי! 🎉' : 'כמעט! ננסה שוב?'}</p>
          {heard && <p className="heard">שמעתי: {heard}</p>}
          <div className="finish-actions">
            {myVoice && (
              <button className="btn" onClick={() => void playUrl(myVoice)}>
                ▶ אני
              </button>
            )}
            <button className="btn" onClick={() => void playItem(item)}>
              🔊 איך אומרים
            </button>
          </div>
          <div className="finish-actions">
            {phase === 'wrong' && tries < MAX_TRIES && (
              <button className="btn primary" onClick={() => void startTurn()}>
                🎤 שוב
              </button>
            )}
            <button className={phase === 'right' || tries >= MAX_TRIES ? 'btn primary' : 'btn'} onClick={goNext}>
              הבא ➜
            </button>
          </div>
          {phase === 'wrong' && canRecognize && (
            <button className="parent-link" onClick={() => finishItem(true, 'parent-override')}>
              הורה: הוא אמר נכון ✓
            </button>
          )}
        </div>
      )}
    </div>
  )
}
