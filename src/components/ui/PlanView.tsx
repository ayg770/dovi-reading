import { useEffect, useState } from 'react'
import { STAGES, Unit } from '../../data/curriculum'
import { accuracy, nextUnit, stageTitle, statusOf, unitTitle } from '../../lib/plan'
import { UnitProgress, loadUnitProgress, setUnitDone } from '../../lib/supabase'
import { t } from '../../lib/i18n'

type Props = {
  /** the grown-up's table: shows the numbers and lets them mark units done */
  manage?: boolean
  onLesson?: (u: Unit) => void
  onTexts?: () => void
}

const ICON = { new: '⚪', going: '🟡', done: '✅' }

/** The reading plan: what comes after what, and where each unit stands. */
export function PlanView({ manage, onLesson, onTexts }: Props) {
  const [progress, setProgress] = useState<UnitProgress[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => void loadUnitProgress().then(setProgress)
  useEffect(reload, [])

  if (!progress) return <p className="muted">…</p>
  const next = nextUnit(progress)

  const toggleDone = async (u: Unit, done: boolean) => {
    setError(null)
    try {
      await setUnitDone(u.code, done)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('משהו השתבש'))
    }
  }

  return (
    <div className={manage ? 'panel plan' : 'plan'}>
      <p className="muted">{t('המסלול מתקדם בסדר קבוע: כל שלב מוסיף סימן ניקוד, ובכל שלב — הברות בודדות, ואז שתי הברות ושלוש הברות.')}</p>
      {error && <p className="error">{error}</p>}
      {STAGES.map((stage) => (
        <section key={stage.n} className="plan-stage">
          <h3>{stageTitle(stage)}</h3>
          {stage.units.map((u) => {
            const p = progress.find((x) => x.unit_code === u.code)
            const status = statusOf(p)
            const acc = accuracy(p)
            const isNext = next?.code === u.code
            return (
              <div key={u.code} className={`plan-unit ${status}${isNext ? ' next' : ''}`}>
                <span className="plan-icon">{isNext && status === 'new' ? '▶' : ICON[status]}</span>
                <div className="plan-main">
                  <span className="plan-title">{unitTitle(u)}</span>
                  {u.items.length > 0 && <span className="plan-items">{u.items.slice(0, 8).join('  ')}</span>}
                  {p && p.sessions > 0 && (
                    <span className="muted plan-stats">
                      {t('{n} שיעורים', { n: p.sessions })} · {Math.max(1, Math.round(p.seconds / 60))} {t('דקות')} · ⭐ {p.points}
                      {acc !== null && ` · ${acc}%`}
                    </span>
                  )}
                </div>
                <div className="plan-actions">
                  {manage && u.kind !== 'texts' && (
                    <label className="plan-done">
                      <input type="checkbox" checked={!!p?.done} onChange={(e) => void toggleDone(u, e.target.checked)} /> {t('הושלם')}
                    </label>
                  )}
                  {onLesson && u.kind !== 'texts' && (
                    <button className={isNext ? 'btn primary small' : 'btn small'} onClick={() => onLesson(u)} aria-label={t('שיעור')}>
                      ▶
                    </button>
                  )}
                  {onTexts && u.kind === 'texts' && (
                    <button className="btn small" onClick={onTexts} aria-label={t('קריאת טקסט')}>
                      📖
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
