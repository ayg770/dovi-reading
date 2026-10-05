import { useEffect, useRef, useState } from 'react'
import { parseText } from '../../data/hebrew'
import { playGradual, playItem, playUrl, praise, sfx, speakUi, stopAudio } from '../../lib/audio'
import { ensureContent } from '../../lib/content'
import { Item, groupItems, randomSyllableItems } from '../../lib/items'
import { Selection, roundsOf, windowItems } from '../../lib/selection'
import { earnStar } from '../../lib/stars'
import { Recording, canRecord, startRecording } from '../../lib/recorder'
import { Listening, canRecognize, heardMatches, heardMatchesText, listen } from '../../lib/speech'
import { finishSession, recordAnswer, saveSessionDetails, startSession } from '../../lib/supabase'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { HoldMic } from '../ui/HoldMic'
import { SyllableText } from '../ui/SyllableText'
import { StarBar } from '../ui/StarBar'
import { Stars } from '../ui/Stars'
import { t } from '../../lib/i18n'

const GAME_TYPE = 'read_aloud'
const MAX_TRIES = 3
/** After this many attempts where the recognizer heard nothing, a grown-up decides. */
const MAX_EMPTY = 2
/** Longest hold of the mic button. */
const MAX_HOLD_MS = 8000
/** A shorter press is a tap, not a reading. */
const MIN_HOLD_MS = 400

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

function errorText(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return t('צריך לאשר גישה למיקרופון בדפדפן')
    case 'language-not-supported':
      return t('זיהוי קול בעברית לא זמין במכשיר הזה')
    case 'network':
      return t('אין חיבור לשירות זיהוי הקול')
    case 'audio-capture':
      return t('המיקרופון לא זמין')
    default:
      return t('הזיהוי לא שמע')
  }
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
  const [micReady, setMicReady] = useState(false)
  const [lit, setLit] = useState<number | null>(null)
  const [isText, setIsText] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)

  const sessionId = useRef<Promise<string | null> | null>(null)
  const details = useRef<unknown[]>([])
  const scoreRef = useRef(0)
  const recordAlongside = useRef(canRecord && (SHARED_MIC_OK || !canRecognize))
  /** The press in progress: recognizer, recorder, and when it started. */
  const hold = useRef<{
    listening: Listening | null
    rec: Promise<Recording | null> | null
    startedAt: number
    timer: number
    tooShort: boolean
  } | null>(null)
  // endHold can run from the auto-stop timer, after a re-render.
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const phaseIsListening = () => phaseRef.current === 'listening'

  useEffect(() => {
    sessionId.current ??= startSession(GAME_TYPE)
    void ensureContent().then((content) => {
      const group =
        selection.kind === 'group'
          ? (content.groups.find((g) => g.id === selection.groupId) ?? content.texts.find((g) => g.id === selection.groupId))
          : null
      if (group && group.words.length) {
        setIsText(group.kind === 'text')
        setItems(windowItems(groupItems(group), group.id, roundsOf(selection)))
        setGroupName(group.name)
      } else {
        setItems(randomSyllableItems(roundsOf(selection) || 10, selection.kind === 'singles' ? selection.nikudIds : undefined))
      }
    })
    return () => {
      hold.current?.listening?.abort()
      void hold.current?.rec?.then((r) => r?.stop())
      stopAudio()
    }
  }, [selection])

  // He doesn't read instructions: say how it works, once per visit.
  useEffect(() => {
    if (!items) return
    try {
      if (sessionStorage.getItem('dovi-read-aloud-told')) return
      sessionStorage.setItem('dovi-read-aloud-told', '1')
    } catch {
      // no storage: say it every game
    }
    void speakUi(t('לוחצים על המיקרופון ומחזיקים, וקוראים בקול'))
  }, [items])

  // Free the previous attempt's audio.
  useEffect(() => {
    return () => {
      if (myVoice) URL.revokeObjectURL(myVoice)
    }
  }, [myVoice])

  if (!items) return <div className="game loading">…</div>

  const item = items[index]
  const total = items.length

  const finishItem = (correct: boolean, how: string, heardText = '', alternatives: string[] = []) => {
    const firstTry = tries === 0
    if (how === 'parent-override' && tries === 1) {
      // The recognizer got his first try wrong; count it as the right answer it was.
      const last = details.current[details.current.length - 1] as { correct: boolean; how: string }
      last.correct = true
      last.how = how
      scoreRef.current += 1
      setScore(scoreRef.current)
      earnStar()
    } else if (firstTry) {
      for (const s of item.syllables)
        if (s.letter_id && s.nikud_id) void recordAnswer(s.letter_id, s.nikud_id, correct)
      details.current.push({ item: item.text, correct, how, heard: heardText, alternatives })
      if (correct) {
        scoreRef.current += 1
        setScore(scoreRef.current)
        earnStar()
      }
    }
    void sessionId.current?.then((id) => saveSessionDetails(id, details.current.length, scoreRef.current, details.current))
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
    setLit(null)
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

  /** Press: start listening (and, where the mic can be shared, recording). */
  const beginHold = () => {
    stopAudio()
    setNotice(null)
    setHeard('')
    setMyVoice(null)
    setMicReady(false)
    setPhase('listening')
    phaseRef.current = 'listening'
    sfx.start()

    const rec = recordAlongside.current
      ? startRecording(MAX_HOLD_MS + 500).catch(() => {
          recordAlongside.current = false
          return null
        })
      : null
    const h = {
      listening: null as Listening | null,
      rec,
      startedAt: Date.now(),
      timer: window.setTimeout(() => endHold(), MAX_HOLD_MS),
      tooShort: false,
    }
    hold.current = h

    if (canRecognize) {
      h.listening = listen(() => setMicReady(true))
      void h.listening.result.then((result) => void handleResult(h, result))
    } else {
      // No recognition in this browser: just record, then a grown-up decides.
      void rec?.then((r) => r && setMicReady(true))
    }
  }

  /** Release: stop and judge what was said. */
  const endHold = () => {
    const h = hold.current
    if (!h || !phaseIsListening()) return
    window.clearTimeout(h.timer)
    if (Date.now() - h.startedAt < MIN_HOLD_MS) {
      h.tooShort = true
      h.listening?.abort()
      void h.rec?.then((r) => r?.stop())
      hold.current = null
      setNotice(t('צריך להחזיק את 🎤 לחוץ כל זמן שקוראים'))
      setPhase('look')
      return
    }
    if (h.listening) h.listening.stop()
    else void finishRecordingOnly(h)
  }

  const takeVoice = async (h: { rec: Promise<Recording | null> | null }) => {
    const r = h.rec ? await h.rec : null
    const blob = r ? await r.stop() : null
    if (blob && blob.size) setMyVoice(URL.createObjectURL(blob))
    return !!r
  }

  const finishRecordingOnly = async (h: NonNullable<typeof hold.current>) => {
    hold.current = null
    await takeVoice(h)
    setPhase('judge')
  }

  const handleResult = async (h: NonNullable<typeof hold.current>, result: { alternatives: string[]; error?: string }) => {
    if (h.tooShort) return
    if (hold.current === h) hold.current = null
    window.clearTimeout(h.timer)
    const recorded = await takeVoice(h)

    if (!result.alternatives.length) {
      // Recording alongside may have taken the mic from the recognizer: stop doing that.
      if (recorded) recordAlongside.current = false
      const code = result.error ?? 'empty'
      const soft = !result.error || result.error === 'no-speech' || result.error === 'aborted'
      if (soft && empties + 1 < MAX_EMPTY) {
        // Heard nothing: let him try again without counting it.
        setEmpties((n) => n + 1)
        setNotice(`${t('לא שמעתי, ננסה שוב?')} (${code})`)
        setPhase('look')
      } else {
        // The recognizer keeps failing (no permission, no network, silence…): a grown-up decides.
        setNotice(`${errorText(code)} (${code})`)
        setPhase('judge')
      }
      return
    }
    setEmpties(0)
    const text = result.alternatives[result.alternatives.length - 1]
    setHeard(text)
    const ok = /\s/.test(item.text.trim())
      ? heardMatchesText(result.alternatives, item.text, parseText)
      : heardMatches(result.alternatives, item.syllables)
    finishItem(ok, 'speech', text, result.alternatives)
  }

  if (done)
    return (
      <FinishScreen
        score={score}
        total={total}
        groupId={selection.kind === 'group' && groupName && !isText ? selection.groupId : null}
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
        <button className="btn small" onClick={onExit} aria-label={t('חזרה')}>
          ✕
        </button>
        <Stars total={total} filled={index} />
      </header>
      <StarBar />
      {groupName && <p className="group-tag">{groupName}</p>}

      <div className={`read-card ${phase === 'right' ? 'right' : phase === 'wrong' ? 'wrong' : ''}`}>
        <span className={/\s/.test(item.text.trim()) ? 'read-text sentence' : 'read-text'}>
          {lit !== null && item.syllables.length > 1 && !/\s/.test(item.text.trim()) ? (
            <SyllableText syllables={item.syllables} active={lit} />
          ) : (
            item.text
          )}
        </span>
      </div>

      {(phase === 'look' || phase === 'listening') && (
        <>
          <p className="prompt icon-prompt" aria-label={phase === 'look' ? t('קרא בקול') : t('מקשיב')}>
            {phase === 'look' ? '👀 ⬅ 🗣️' : micReady ? <span className="listening-ear">👂</span> : '⏳'}
          </p>
          <div className="read-actions">
            <HoldMic
              active={phase === 'listening'}
              ready={micReady}
              maxMs={MAX_HOLD_MS}
              onPress={beginHold}
              onRelease={endHold}
            />
            {phase === 'look' && (
              <button className="round-btn listen-small" onClick={() => void playItem(item)} aria-label={t('שמע')}>
                🔊
              </button>
            )}
            {phase === 'look' && item.syllables.length > 1 && !/\s/.test(item.text.trim()) && (
              <button
                className="round-btn listen-small slow"
                onClick={() => void playGradual(item.syllables, setLit)}
                aria-label={t('הקראה הדרגתית')}
              >
                🐢
              </button>
            )}
          </div>
          {phase === 'look' && notice && <p className="hint-text">{notice}</p>}
        </>
      )}

      {phase === 'judge' && (
        <div className="judge">
          {notice && <p className="heard">{notice}</p>}
          {heard && <p className="heard">{heard}</p>}
          {myVoice && (
            <button className="btn" onClick={() => void playUrl(myVoice)}>
              {t('▶ שמע את עצמך')}
            </button>
          )}
          <p className="hint-text">{t('הורה: האם הוא קרא נכון?')}</p>
          <div className="finish-actions">
            <button className="btn good" onClick={() => finishItem(true, 'parent')}>
              {t('✓ נכון')}
            </button>
            <button className="btn bad" onClick={() => finishItem(false, 'parent')}>
              {t('✗ עוד לא')}
            </button>
          </div>
          {canRecognize && (
            <button className="parent-link" onClick={() => setPhase('look')}>
              {t('🎤 לנסות שוב את זיהוי הקול')}
            </button>
          )}
        </div>
      )}

      {(phase === 'right' || phase === 'wrong') && (
        <div className="judge">
          <p className="result-face" aria-label={phase === 'right' ? t('יופי') : t('כמעט')}>
            {phase === 'right' ? '🤩' : '🤔'}
          </p>
          {heard && <p className="heard">{t('שמעתי: {text}', { text: heard })}</p>}
          <div className="finish-actions">
            {myVoice && (
              <button className="btn icon-btn" onClick={() => void playUrl(myVoice)} aria-label={t('שמע את עצמך')}>
                ▶ 🧒
              </button>
            )}
            <button className="btn icon-btn" onClick={() => void playItem(item)} aria-label={t('איך אומרים')}>
              🔊
            </button>
          </div>
          <div className="finish-actions">
            {phase === 'wrong' && tries < MAX_TRIES && (
              <button className="btn primary icon-btn" onClick={() => setPhase('look')} aria-label={t('שוב')}>
                🔁 🎤
              </button>
            )}
            <button
              className={phase === 'right' || tries >= MAX_TRIES ? 'btn primary icon-btn' : 'btn icon-btn'}
              onClick={goNext}
              aria-label={t('הבא')}
            >
              ⬅
            </button>
          </div>
          {phase === 'wrong' && canRecognize && (
            <button className="parent-link" onClick={() => finishItem(true, 'parent-override')}>
              {t('הורה: הוא אמר נכון ✓')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
