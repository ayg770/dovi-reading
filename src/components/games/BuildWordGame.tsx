import { useEffect, useRef, useState } from 'react'
import { playGradual, playItem, playWordSyllable, praise, sfx, stopAudio } from '../../lib/audio'
import { BASIC_NIKUD_IDS, LETTERS, NIKUD, asOpenSyllable, nikudVowel, similarLetters, syllableText } from '../../data/hebrew'
import { Item } from '../../lib/items'
import { Selection } from '../../lib/selection'
import { earnStar } from '../../lib/stars'
import { finishSession, recordAnswer, startSession } from '../../lib/supabase'
import { t } from '../../lib/i18n'
import { useGameItems } from '../../lib/useGameItems'
import { Confetti } from '../ui/Confetti'
import { FinishScreen } from '../ui/FinishScreen'
import { StarBar } from '../ui/StarBar'
import { Stars } from '../ui/Stars'

type Tile = { id: number; text: string; used: boolean }

function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/**
 * Wrong tiles that are easy to mix up with the right ones: the same letter with another vowel
 * (only vowels he knows, and only ones that sound different), or a look-alike letter with the
 * same vowel.
 */
function distractors(item: Item, count: number): string[] {
  const real = new Set(item.syllables.map((s) => s.text))
  const known = new Set([...BASIC_NIKUD_IDS, ...item.syllables.map((s) => s.nikud_id).filter((x): x is number => !!x)])
  const pool: string[] = []
  for (const ws of item.syllables) {
    const open = asOpenSyllable(ws)
    if (!open) continue
    for (const n of NIKUD)
      if (known.has(n.id) && nikudVowel(n) !== nikudVowel(open.nikud)) pool.push(syllableText({ letter: open.letter, nikud: n }))
    for (const g of similarLetters(open.letter.glyph)) {
      const letter = LETTERS.find((l) => l.glyph === g)
      if (letter && !letter.isFinal) pool.push(syllableText({ letter, nikud: open.nikud }))
    }
  }
  return [...new Set(shuffle(pool))].filter((x) => !real.has(x)).slice(0, count)
}

/** The syllables and the wrong tiles, in any order — also the right one: the position tells nothing. */
function makeTiles(item: Item): Tile[] {
  const texts = [...item.syllables.map((s) => s.text), ...distractors(item, item.syllables.length > 2 ? 3 : 2)]
  return shuffle(texts.map((text, id) => ({ id, text, used: false })))
}

type Props = { selection: Selection; onExit: () => void; onRestart: () => void; onPlayGroup: (groupId: string) => void }

/**
 * Hear a word, then put its syllables in order: tap the syllable tiles one by one and they
 * land in the slots; when all are in place the slots slide together and the word is read.
 */
export function BuildWordGame({ selection, onExit, onRestart, onPlayGroup }: Props) {
  const { items, groupName } = useGameItems(selection, 'build', { minSyllables: 2, fallback: 'pairs' })
  const [index, setIndex] = useState(0)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [placed, setPlaced] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [shake, setShake] = useState<number | null>(null)
  const [lit, setLit] = useState<number | null>(null)
  const [joined, setJoined] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [confetti, setConfetti] = useState(0)
  const session = useRef<Promise<string | null> | null>(null)
  const timer = useRef<number>(0)
  const scoreRef = useRef(0)

  const item: Item | undefined = items?.[index]

  useEffect(() => {
    session.current ??= startSession('build_word')
    return () => {
      window.clearTimeout(timer.current)
      stopAudio()
    }
  }, [])

  // A new word: shuffle its syllables and say it.
  useEffect(() => {
    if (!item) return
    setTiles(makeTiles(item))
    setPlaced(0)
    setMistakes(0)
    setJoined(false)
    setLit(null)
    void playItem(item)
  }, [item])

  if (!items || !item) return <div className="game loading">…</div>
  const total = items.length

  const next = () => {
    window.clearTimeout(timer.current)
    if (index + 1 >= total) {
      setDone(true)
      void session.current?.then((id) => finishSession(id, total, scoreRef.current, []))
    } else setIndex((i) => i + 1)
  }

  const tap = (tile: Tile) => {
    if (tile.used || joined) return
    const expected = item.syllables[placed]
    if (tile.text === expected.text) {
      setTiles((ts) => ts.map((x) => (x.id === tile.id ? { ...x, used: true } : x)))
      const now = placed + 1
      setPlaced(now)
      void playWordSyllable(expected)
      if (now === item.syllables.length) {
        // All in place: slide together, then say the whole word.
        timer.current = window.setTimeout(() => {
          setJoined(true)
          sfx.correct()
          setConfetti((c) => c + 1)
          for (const s of item.syllables) if (s.letter_id && s.nikud_id) void recordAnswer(s.letter_id, s.nikud_id, mistakes === 0)
          if (mistakes === 0) {
            scoreRef.current += 1
            setScore(scoreRef.current)
            earnStar()
          }
          timer.current = window.setTimeout(() => {
            void playItem(item).then(() => void praise(0.4))
          }, 600)
          timer.current = window.setTimeout(next, 3200)
        }, 500)
      }
    } else {
      setMistakes((m) => m + 1)
      setShake(tile.id)
      sfx.wrong()
      window.setTimeout(() => setShake(null), 450)
    }
  }

  if (done)
    return (
      <FinishScreen score={score} total={total} groupId={null} groupName={groupName} onRestart={onRestart} onExit={onExit} onPlayGroup={onPlayGroup} />
    )

  return (
    <div className="game build">
      <Confetti fire={confetti} />
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label={t('חזרה')}>
          ✕
        </button>
        <Stars total={total} filled={index} />
      </header>
      <StarBar />
      {groupName && <p className="group-tag">{groupName}</p>}

      <div className="listen-row">
        <button className="round-btn listen-small" onClick={() => void playItem(item)} aria-label={t('שמע')}>
          🔊
        </button>
        <button className="round-btn listen-small slow" onClick={() => void playGradual(item.syllables, setLit)} aria-label={t('הקראה הדרגתית')}>
          🐢
        </button>
      </div>

      <div className={joined ? 'slots joined' : 'slots'} dir="rtl">
        {item.syllables.map((s, i) => (
          <span key={i} className={`slot-box${i < placed ? ' full' : ''}${lit === i ? ' lit' : ''}`}>
            {i < placed ? s.text : ''}
          </span>
        ))}
      </div>

      <div className="tiles" dir="rtl">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            className={`tile${tile.used ? ' used' : ''}${shake === tile.id ? ' wrong' : ''}`}
            onClick={() => tap(tile)}
            disabled={tile.used}
          >
            {tile.text}
          </button>
        ))}
      </div>
      {joined && (
        <button className="btn icon-btn" onClick={next} aria-label={t('הבא')}>
          ⏭
        </button>
      )}
    </div>
  )
}
