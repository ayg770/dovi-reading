import { useEffect, useState } from 'react'
import { praise, sfx } from '../../lib/audio'
import { refreshContent } from '../../lib/content'
import { advanceGroup } from '../../lib/supabase'
import { Confetti } from './Confetti'

type Props = {
  score: number
  total: number
  /** name of the group played, when the game used a group */
  groupName?: string | null
  onRestart: () => void
  onExit: () => void
}

/** End of a game: stars, praise, and — after a good round in a group — the next group. */
export function FinishScreen({ score, total, groupName, onRestart, onExit }: Props) {
  const ratio = total ? score / total : 0
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1
  const canAdvance = !!groupName && ratio >= 0.8
  const [advanced, setAdvanced] = useState<'no' | 'busy' | 'done' | 'last'>('no')

  useEffect(() => {
    sfx.finish()
    const t = setTimeout(() => void praise(), 1200)
    return () => clearTimeout(t)
  }, [])

  const advance = async () => {
    setAdvanced('busy')
    const next = await advanceGroup()
    await refreshContent()
    setAdvanced(next ? 'done' : 'last')
  }

  return (
    <div className="game finish">
      <Confetti fire={1} big />
      <div className="big-stars">{'⭐'.repeat(stars)}</div>
      <h2>כל הכבוד דובי!</h2>
      <p className="finish-score">
        {score} מתוך {total}
      </p>
      {groupName && <p className="finish-group">קבוצה: {groupName}</p>}
      {canAdvance && advanced === 'no' && (
        <button className="btn next-group" onClick={advance}>
          לקבוצה הבאה ➜
        </button>
      )}
      {advanced === 'done' && <p className="finish-group">עברנו לקבוצה הבאה! 🎉</p>}
      {advanced === 'last' && <p className="finish-group">זו הייתה הקבוצה האחרונה 🏆</p>}
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
