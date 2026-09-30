import { useEffect, useState } from 'react'
import { praise, sfx } from '../../lib/audio'
import { refreshContent } from '../../lib/content'
import { advanceGroup } from '../../lib/supabase'
import { Confetti } from './Confetti'

type Props = {
  score: number
  total: number
  /** the group played, when the game used a group */
  groupId?: string | null
  groupName?: string | null
  onRestart: () => void
  onExit: () => void
  onPlayGroup: (groupId: string) => void
}

/** End of a game: stars, praise, and — after a good round in a group — on to the next group. */
export function FinishScreen({ score, total, groupId, groupName, onRestart, onExit, onPlayGroup }: Props) {
  const ratio = total ? score / total : 0
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1
  const canAdvance = !!groupId && ratio >= 0.8
  const [state, setState] = useState<'idle' | 'busy' | 'last'>('idle')

  useEffect(() => {
    sfx.finish()
    const t = setTimeout(() => void praise(), 1200)
    return () => clearTimeout(t)
  }, [])

  const advance = async () => {
    if (!groupId) return
    setState('busy')
    const next = await advanceGroup(groupId)
    await refreshContent()
    if (next) onPlayGroup(next)
    else setState('last')
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
      {canAdvance && state !== 'last' && (
        <button className="btn next-group" disabled={state === 'busy'} onClick={() => void advance()}>
          לקבוצה הבאה ➜
        </button>
      )}
      {state === 'last' && <p className="finish-group">זו הייתה הקבוצה האחרונה 🏆</p>}
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
