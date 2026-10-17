import { useEffect, useMemo, useRef, useState } from 'react'
import { parseWord } from '../../data/hebrew'
import { playGradual, playItem, sfx, stopAudio } from '../../lib/audio'
import { ensureContent } from '../../lib/content'
import { Item, groupItems, randomSyllableItems } from '../../lib/items'
import { LiveMatcher, ReadUnit, WordState } from '../../lib/liveReader'
import { Selection, roundsOf, windowItems } from '../../lib/selection'
import { Stream, canRecognize, streamListen } from '../../lib/speech'
import { earnStar } from '../../lib/stars'
import { finishSession, recordAnswer, saveSessionDetails, startSession } from '../../lib/supabase'
import { t } from '../../lib/i18n'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { StarBar } from '../ui/StarBar'
import { Stars } from '../ui/Stars'

type Props = {
  selection: Selection
  onExit: () => void
  onRestart: () => void
  onPlayGroup: (groupId: string) => void
}

const GAME_TYPE = 'read_aloud'
/** Pause after a finished line before the next one shows. */
const NEXT_DELAY_MS = 900

const unitsOf = (item: Item): ReadUnit[] =>
  /\s/.test(item.text.trim())
    ? item.text
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({ text: w, syllables: parseWord(w) }))
    : [{ text: item.text, syllables: item.syllables }]

/**
 * Reading aloud with the microphone open: every syllable or word that is said right turns green
 * on the screen, and the reading does not move on until the word is green — or red, after two
 * wrong tries, so nobody gets stuck. Used for syllables, words and whole texts.
 */
export function LiveReadGame({ selection, onExit, onRestart, onPlayGroup }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [groupName, setGroupName] = useState<string | null>(null)
  const [isText, setIsText] = useState(false)
  const [index, setIndex] = useState(0)
  const [states, setStates] = useState<WordState[]>([])
  const [cur, setCur] = useState(0)
  const [syl, setSyl] = useState(0)
  const [flash, setFlash] = useState(false)
  const [heard, setHeard] = useState('')
  const [mic, setMic] = useState<'off' | 'listening' | 'restarting' | 'error'>('off')
  const [micError, setMicError] = useState<string | null>(null)
  const [lit, setLit] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)

  const stream = useRef<Stream | null>(null)
  const matcher = useRef<LiveMatcher | null>(null)
  const used = useRef(new Map<number, number>())
  const session = useRef<Promise<string | null> | null>(null)
  const scoreRef = useRef(0)
  const details = useRef<unknown[]>([])
  const idxRef = useRef(0)
  const misses = useRef(0)

  useEffect(() => {
    session.current ??= startSession(GAME_TYPE)
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
      stream.current?.stop()
      stopAudio()
    }
  }, [selection])

  const units = useMemo(() => (items ? unitsOf(items[index] ?? items[0]) : []), [items, index])

  // A fresh matcher for each line.
  useEffect(() => {
    if (!items) return
    const item = items[index]
    const us = unitsOf(item)
    idxRef.current = index
    misses.current = 0
    setStates(us.map(() => 'wait'))
    setCur(0)
    setSyl(0)
    setHeard('')
    setLit(null)
    matcher.current = new LiveMatcher(
      us,
      {
        onSyllable: (_wi, si) => {
          setSyl(si + 1)
          sfx.tap()
        },
        onWord: (wi, result, m) => {
          setStates((s) => s.map((x, k) => (k === wi ? result : x)))
          setCur(wi + 1)
          setSyl(0)
          misses.current += m
          if (result === 'ok') sfx.tap()
          for (const s of us[wi].syllables)
            if (s.letter_id && s.nikud_id && us.length === 1) void recordAnswer(s.letter_id, s.nikud_id, result === 'ok' && m === 0)
        },
        onMiss: () => {
          setFlash(true)
          sfx.wrong()
          window.setTimeout(() => setFlash(false), 600)
        },
        onDone: () => finishItem(item, us),
      },
      used.current,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, index])

  const finishItem = (item: Item, us: ReadUnit[]) => {
    const m = matcher.current
    const results = m ? m.states : []
    const allOk = results.length > 0 && results.every((r) => r === 'ok') && misses.current === 0
    details.current.push({ item: item.text, words: results, ok: allOk })
    if (allOk) {
      scoreRef.current += 1
      setScore(scoreRef.current)
      earnStar()
      setConfetti((c) => c + 1)
      sfx.correct()
    }
    void session.current?.then((id) => saveSessionDetails(id, details.current.length, scoreRef.current, details.current))
    const last = idxRef.current + 1 >= (items?.length ?? 0)
    void us
    window.setTimeout(() => {
      if (last) {
        stream.current?.stop()
        setMic('off')
        setDone(true)
        void session.current?.then((id) => finishSession(id, items?.length ?? 0, scoreRef.current, details.current))
      } else setIndex((i) => i + 1)
    }, NEXT_DELAY_MS)
  }

  const startMic = () => {
    stopAudio()
    sfx.start()
    if (!canRecognize) return setMic('error')
    stream.current?.stop()
    stream.current = streamListen({
      onHeard: (alts, isFinal, ri) => {
        setHeard(alts[0])
        matcher.current?.feed(alts, isFinal, ri)
      },
      onState: (state, error) => {
        setMic(state)
        // The recognizer starts counting its results from 0 again after a restart.
        if (state === 'restarting') used.current.clear()
        if (state === 'error')
          setMicError(
            error === 'not-allowed' || error === 'service-not-allowed'
              ? t('צריך לאשר גישה למיקרופון בדפדפן')
              : t('זיהוי הקול לא זמין כרגע'),
          )
      },
    })
  }

  const stopMic = () => {
    stream.current?.stop()
    stream.current = null
    setMic('off')
  }

  if (!items) return <div className="game loading">…</div>

  if (done)
    return (
      <FinishScreen
        score={score}
        total={items.length}
        groupId={selection.kind === 'group' && groupName && !isText ? selection.groupId : null}
        groupName={groupName}
        onRestart={onRestart}
        onExit={onExit}
        onPlayGroup={onPlayGroup}
      />
    )

  const item = items[index]
  const micOn = mic === 'listening' || mic === 'restarting'
  const sentence = units.length > 1

  return (
    <div className="game live-read">
      <Confetti fire={confetti} />
      <header className="game-bar">
        <button
          className="btn small"
          onClick={() => {
            stopMic()
            onExit()
          }}
          aria-label={t('חזרה')}
        >
          ✕
        </button>
        <Stars total={items.length} filled={index} />
      </header>
      <StarBar />
      {groupName && <p className="group-tag">{groupName}</p>}

      <div className={`read-card live${flash ? ' flash' : ''}`} dir="rtl">
        <span className={sentence ? 'read-text sentence' : 'read-text'}>
          {units.map((u, wi) => {
            const state = states[wi] ?? 'wait'
            const isCur = wi === cur && state === 'wait'
            return (
              <span key={wi} className={`lw ${state}${isCur ? ' cur' : ''}`}>
                {u.syllables.length > 1 || !u.syllables.length
                  ? u.syllables.map((s, si) => (
                      <span
                        key={si}
                        className={`ls${state === 'ok' || (isCur && si < syl) ? ' ok' : ''}${lit === si && isCur ? ' on' : ''}`}
                      >
                        {s.text}
                      </span>
                    ))
                  : u.text}
              </span>
            )
          })}
        </span>
      </div>

      <div className="read-actions">
        {micOn ? (
          <button className={`btn big-mic on ${mic}`} onClick={stopMic} aria-label={t('עצור')}>
            <span className="mic-dot" />🎤
          </button>
        ) : (
          <button className="btn primary big-mic" onClick={startMic} aria-label={t('התחל לקרוא')}>
            🎤 {t('התחל לקרוא')}
          </button>
        )}
      </div>
      {micOn && <p className="heard">{heard ? t('שמעתי: {text}', { text: heard }) : '👂'}</p>}
      {micError && <p className="hint-text">{micError}</p>}

      <div className="finish-actions">
        <button className="btn icon-btn" onClick={() => void playItem(item)} aria-label={t('שמע')}>
          🔊
        </button>
        {!sentence && item.syllables.length > 1 && (
          <button className="btn icon-btn" onClick={() => void playGradual(item.syllables, setLit)} aria-label={t('הקראה הדרגתית')}>
            🐢
          </button>
        )}
        {(!canRecognize || mic === 'error') && (
          <button className="btn good icon-btn" onClick={() => matcher.current?.settle('ok')} aria-label={t('הורה: הוא אמר נכון ✓')}>
            ✓
          </button>
        )}
        <button className="btn icon-btn" onClick={() => matcher.current?.settle('miss')} aria-label={t('דלג')}>
          ⏭
        </button>
      </div>
    </div>
  )
}
