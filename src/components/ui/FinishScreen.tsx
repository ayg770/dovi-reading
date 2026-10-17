import { useEffect, useState } from 'react'
import { praise, sfx } from '../../lib/audio'
import { refreshContent } from '../../lib/content'
import { advanceGroup } from '../../lib/supabase'
import { Confetti } from './Confetti'
import { StarBar } from './StarBar'
import { t } from '../../lib/i18n'
import { lesson, useLesson } from '../../lib/lesson'

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
  const inLesson = useLesson().active

  useEffect(() => {
    sfx.finish()
    const t = setTimeout(() => void praise(), 1200)
    if (lesson.get().active) lesson.report(score, total)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // In a lesson the next game follows by itself.
  const goOn = () => {
    lesson.markNext()
    onExit()
  }
  useEffect(() => {
    if (!inLesson) return
    const id = setTimeout(goOn, 4000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inLesson])

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
      <div className="trophy">🏆</div>
      <div className="earned-row" aria-label={t('{score} מתוך {total}', { score, total })}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < score ? 'earned on' : 'earned'}>
            {i < score ? '⭐' : '•'}
          </span>
        ))}
      </div>
      {groupName && <p className="finish-group">{groupName}</p>}
      {inLesson ? (
        <div className="finish-actions big">
          <button className="btn primary icon-btn" onClick={goOn} aria-label={t('הבא')}>
            ▶
          </button>
        </div>
      ) : (
      <div className="finish-actions big">
        {canAdvance && state !== 'last' && (
          <button
            className="btn next-group icon-btn"
            disabled={state === 'busy'}
            onClick={() => void advance()}
            aria-label={t('לקבוצה הבאה')}
          >
            ⏭️
          </button>
        )}
        <button className="btn primary icon-btn" onClick={onRestart} aria-label={t('עוד פעם')}>
          🔁
        </button>
        <button className="btn icon-btn" onClick={onExit} aria-label={t('חזרה')}>
          🏠
        </button>
      </div>
      )}
      {state === 'last' && <p className="finish-group">🏆 🎉</p>}
      <StarBar />
    </div>
  )
}
