import { useEffect, useState } from 'react'
import { NIKUD } from '../../data/hebrew'
import { useContent } from '../../lib/content'
import { Selection, loadSelection, saveSelection } from '../../lib/selection'
import { Learner, getLearner } from '../../lib/supabase'

type Props = {
  game: string
  title: string
  icon: string
  onStart: (s: Selection) => void
  onExit: () => void
}

/** Before a game: single syllables (pick the nikud) or one of the word groups. */
export function ContentPicker({ game, title, icon, onStart, onExit }: Props) {
  const content = useContent()
  const [learner, setLearner] = useState<Learner | null>(null)
  const [sel, setSel] = useState<Selection | null>(() => loadSelection(game))
  const [nikudIds, setNikudIds] = useState<number[]>(
    sel?.kind === 'singles' ? sel.nikudIds : NIKUD.map((n) => n.id),
  )

  const groups = content.groups.filter((g) => g.words.length)

  useEffect(() => {
    void getLearner().then(setLearner)
  }, [])

  // First time: start from the current group if there is one.
  useEffect(() => {
    if (sel) return
    if (learner?.current_group_id && groups.some((g) => g.id === learner.current_group_id))
      setSel({ kind: 'group', groupId: learner.current_group_id })
  }, [learner, groups, sel])

  // A remembered group that was deleted in the meantime.
  const chosen: Selection =
    sel?.kind === 'group' && !groups.some((g) => g.id === sel.groupId)
      ? { kind: 'singles', nikudIds }
      : sel ?? { kind: 'singles', nikudIds }

  const toggleNikud = (id: number) => {
    const next = nikudIds.includes(id) ? nikudIds.filter((n) => n !== id) : [...nikudIds, id]
    if (!next.length) return
    setNikudIds(next)
    setSel({ kind: 'singles', nikudIds: next })
  }

  const start = () => {
    saveSelection(game, chosen)
    onStart(chosen)
  }

  return (
    <div className="picker">
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label="חזרה">
          ✕
        </button>
        <h2 className="picker-title">
          {icon} {title}
        </h2>
        <span />
      </header>

      <p className="prompt">מה משחקים?</p>

      <button
        className={chosen.kind === 'singles' ? 'pick-card on' : 'pick-card'}
        onClick={() => setSel({ kind: 'singles', nikudIds })}
      >
        <span className="pick-name">הברות בודדות</span>
        <span className="pick-sample">בַּ · בִּ · בָּ</span>
      </button>
      {chosen.kind === 'singles' && (
        <div className="nikud-toggles">
          {NIKUD.map((n) => (
            <button
              key={n.id}
              className={nikudIds.includes(n.id) ? 'toggle on' : 'toggle'}
              onClick={() => toggleNikud(n.id)}
            >
              <span className="toggle-sample">{'ב' + n.mark}</span>
              {n.name}
            </button>
          ))}
        </div>
      )}

      {groups.length > 0 && <p className="picker-sub">קבוצות</p>}
      {groups.map((g) => (
        <button
          key={g.id}
          className={chosen.kind === 'group' && chosen.groupId === g.id ? 'pick-card on' : 'pick-card'}
          onClick={() => setSel({ kind: 'group', groupId: g.id })}
        >
          <span className="pick-name">
            {learner?.current_group_id === g.id && '⭐ '}
            {g.name}
          </span>
          <span className="pick-sample">
            {g.words
              .slice(0, 4)
              .map((w) => w.text)
              .join(' · ')}
            {g.words.length > 4 && ' …'}
          </span>
        </button>
      ))}

      <button className="btn primary start-btn" onClick={start}>
        יאללה! ▶
      </button>
    </div>
  )
}
