import { useEffect, useState } from 'react'
import { useContent } from '../../lib/content'
import { t } from '../../lib/i18n'

export type TextChoice = { groupId: string; mode: 'auto' | 'read'; pace: number }

const KEY = 'dovi-text-choice'

function saved(): Partial<TextChoice> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TextChoice>
  } catch {
    return {}
  }
}

/** Before reading a text: which text, how (shown automatically or read aloud), and the pace. */
export function TextPicker({ onStart, onExit }: { onStart: (c: TextChoice) => void; onExit: () => void }) {
  const { texts } = useContent()
  const initial = saved()
  const [groupId, setGroupId] = useState<string | null>(initial.groupId ?? null)
  const [mode, setMode] = useState<TextChoice['mode']>(initial.mode ?? 'auto')
  const [pace, setPace] = useState(initial.pace ?? 1.2)

  const chosen = texts.find((g) => g.id === groupId) ?? texts[0]
  useEffect(() => {
    if (!groupId && texts[0]) setGroupId(texts[0].id)
  }, [groupId, texts])

  const start = () => {
    if (!chosen) return
    const c: TextChoice = { groupId: chosen.id, mode, pace }
    try {
      localStorage.setItem(KEY, JSON.stringify(c))
    } catch {
      // not remembered
    }
    onStart(c)
  }

  return (
    <div className="picker">
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label={t('חזרה')}>
          ✕
        </button>
        <h2 className="picker-title">📖 {t('קריאת טקסט')}</h2>
        <span />
      </header>

      {texts.length === 0 ? (
        <p className="muted">{t('עוד אין טקסטים. מוסיפים בהגדרות ← טקסטים.')}</p>
      ) : (
        <>
          <p className="prompt">{t('איזה טקסט?')}</p>
          {texts.map((g) => (
            <button key={g.id} className={chosen?.id === g.id ? 'pick-card on' : 'pick-card'} onClick={() => setGroupId(g.id)}>
              <span className="pick-name">{g.name}</span>
              <span className="pick-sample">{g.words[0]?.text}</span>
            </button>
          ))}

          <p className="picker-sub">{t('איך קוראים?')}</p>
          <button className={mode === 'auto' ? 'pick-card on' : 'pick-card'} onClick={() => setMode('auto')}>
            <span className="pick-name">📖 {t('הצגה אוטומטית')}</span>
            <span className="muted">{t('המילים נדלקות בזו אחר זו בקצב שבוחרים, וקוראים יחד')}</span>
          </button>
          <button className={mode === 'read' ? 'pick-card on' : 'pick-card'} onClick={() => setMode('read')}>
            <span className="pick-name">🗣️ {t('קריאה בקול')}</span>
            <span className="muted">{t('קוראים שורה אחרי שורה, והמערכת בודקת')}</span>
          </button>

          {mode === 'auto' && (
            <div className="pace">
              <p className="picker-sub">
                {t('קצב')}: {pace.toFixed(1)} {t('שניות למילה')} (~{Math.round(60 / pace)} {t('מילים בדקה')})
              </p>
              <input
                type="range"
                min={0.3}
                max={3}
                step={0.1}
                value={pace}
                onChange={(e) => setPace(Number(e.target.value))}
                aria-label={t('קצב')}
                dir="ltr"
              />
              <div className="pace-ends">
                <span>🐇 {t('מהר')}</span>
                <span>🐢 {t('לאט')}</span>
              </div>
            </div>
          )}

          <button className="btn primary start-btn" onClick={start}>
            {t('יאללה! ▶')}
          </button>
        </>
      )}
    </div>
  )
}
