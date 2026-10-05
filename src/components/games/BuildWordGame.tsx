import { useEffect, useRef, useState } from 'react'
import { playGradual, playItem, playWordSyllable, praise, sfx, stopAudio } from '../../lib/audio'
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

function shuffled(texts: string[]): Tile[] {
  const tiles = texts.map((text, id) => ({ id, text, used: false }))
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
    }
    // Don't hand him the answer already in order.
    if (tiles.length < 2 || tiles.some((tile, i) => tile.text !== texts[i])) break
  }
  return tiles
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
    setTiles(shuffled(item.syllables.map((s) => s.text)))
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
