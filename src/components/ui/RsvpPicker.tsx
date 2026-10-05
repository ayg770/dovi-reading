import { useEffect, useState } from 'react'
import { currentPronunciation } from '../../data/hebrew'
import { useContent } from '../../lib/content'
import { t } from '../../lib/i18n'
import { MAX_WPM, MIN_WPM, Chunk, loadRsvpHistory, rememberedPace, sliderFromWpm, wpmFromSlider } from '../../lib/rsvp'

export type RsvpChoice = {
  groupId: string
  wpm: number
  chunk: Chunk
  focal: boolean
  stress: boolean
  nikud: boolean
  ramp: boolean
}

const KEY = 'dovi-rsvp-choice'

function saved(): Partial<RsvpChoice> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<RsvpChoice>
  } catch {
    return {}
  }
}

const PRESETS = [
  { label: 'מתחיל', wpm: 40 },
  { label: 'בינוני', wpm: 120 },
  { label: 'מתקדם', wpm: 250 },
]

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button className={on ? 'pick-card on' : 'pick-card'} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="pick-name">
        {on ? '☑' : '☐'} {children}
      </span>
    </button>
  )
}

/** Before continuous reading: what to read, how fast, and how to show it. */
export function RsvpPicker({ onStart, onExit }: { onStart: (c: RsvpChoice) => void; onExit: () => void }) {
  const { texts, groups } = useContent()
  const initial = saved()
  const [groupId, setGroupId] = useState<string | null>(initial.groupId ?? null)
  const [wpm, setWpm] = useState(initial.wpm ?? 60)
  const [chunk, setChunk] = useState<Chunk>(initial.chunk ?? 1)
  const [focal, setFocal] = useState(initial.focal ?? false)
  const [stress, setStress] = useState(initial.stress ?? false)
  const [nikud, setNikud] = useState(initial.nikud ?? true)
  const [ramp, setRamp] = useState(initial.ramp ?? true)
  const [note, setNote] = useState<string | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadRsvpHistory>>>([])

  const options = [...texts, ...groups.filter((g) => g.words.length)]
  const chosen = options.find((g) => g.id === groupId) ?? options[0]
  const regular = currentPronunciation() === 'sephardi'

  useEffect(() => {
    void loadRsvpHistory().then(setHistory)
  }, [])

  // Choosing a text: continue from the pace that went well for it.
  const pick = (id: string) => {
    setGroupId(id)
    const mem = rememberedPace(history, id)
    if (mem) {
      setWpm(mem.wpm)
      setNote(t('ממשיכים מהקצב ששמרת: {n} מילים בדקה', { n: mem.wpm }))
    } else setNote(null)
  }
  useEffect(() => {
    if (!groupId && options[0]) pick(options[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, history])

  const start = () => {
    if (!chosen) return
    const c: RsvpChoice = { groupId: chosen.id, wpm, chunk, focal: focal && chunk === 1, stress: regular && stress, nikud, ramp }
    try {
      localStorage.setItem(KEY, JSON.stringify(c))
    } catch {
      // not remembered
    }
    onStart(c)
  }

  const chunks: { id: Chunk; label: string }[] = [
    { id: 1, label: t('מילה אחת') },
    { id: 2, label: t('שתי מילים') },
    { id: 3, label: t('שלוש מילים') },
    { id: 'syl', label: t('הברה אחר הברה') },
  ]

  return (
    <div className="picker">
      <header className="game-bar">
        <button className="btn small" onClick={onExit} aria-label={t('חזרה')}>
          ✕
        </button>
        <h2 className="picker-title">⚡ {t('קריאה ברצף')}</h2>
        <span />
      </header>

      {options.length === 0 ? (
        <p className="muted">{t('עוד אין טקסטים. מוסיפים בהגדרות ← טקסטים.')}</p>
      ) : (
        <>
          <p className="prompt">{t('איזה טקסט?')}</p>
          {options.map((g) => (
            <button key={g.id} className={chosen?.id === g.id ? 'pick-card on' : 'pick-card'} onClick={() => pick(g.id)}>
              <span className="pick-name">{g.name}</span>
              <span className="pick-sample">{g.words[0]?.text}</span>
            </button>
          ))}

          <div className="pace">
            <p className="picker-sub">
              {t('קצב')}: <b>{wpm}</b> {t('מילים בדקה')}
            </p>
            {note && <p className="muted">{note}</p>}
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={sliderFromWpm(wpm)}
              onChange={(e) => {
                setNote(null)
                setWpm(wpmFromSlider(Number(e.target.value)))
              }}
              aria-label={t('קצב')}
              dir="ltr"
            />
            <div className="pace-ends" dir="ltr">
              <span>🐢 {MIN_WPM}</span>
              <span>🐇 {MAX_WPM}</span>
            </div>
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p.wpm} className={wpm === p.wpm ? 'toggle on' : 'toggle'} onClick={() => setWpm(p.wpm)}>
                  {t(p.label)} · {p.wpm}
                </button>
              ))}
            </div>
          </div>

          <p className="picker-sub">{t('מה מופיע בכל פעם?')}</p>
          <div className="presets">
            {chunks.map((c) => (
              <button key={String(c.id)} className={chunk === c.id ? 'toggle on' : 'toggle'} onClick={() => setChunk(c.id)}>
                {c.label}
              </button>
            ))}
          </div>

          <Toggle on={nikud} onChange={setNikud}>
            {t('להציג ניקוד')}
          </Toggle>
          <Toggle on={ramp} onChange={setRamp}>
            {t('להתחיל לאט ולהאיץ בהדרגה')}
          </Toggle>
          {chunk === 1 && (
            <Toggle on={focal} onChange={setFocal}>
              {t('אות מרכזית צבועה (עוזרת למקד את המבט)')}
            </Toggle>
          )}
          {regular && nikud && (
            <Toggle on={stress} onChange={setStress}>
              {t('הדגשת ההברה האחרונה (בדרך כלל ההטעמה)')}
            </Toggle>
          )}

          <button className="btn primary start-btn" onClick={start}>
            {t('יאללה! ▶')}
          </button>
        </>
      )}
    </div>
  )
}
