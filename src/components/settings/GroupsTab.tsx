import { useEffect, useRef, useState } from 'react'
import { NIKUD_KEYBOARD } from '../../data/hebrew'
import {
  checkLine,
  createGroup,
  deleteGroup,
  deleteWordRecording,
  moveGroup,
  saveWordRecording,
  splitLines,
  updateGroup,
} from '../../lib/admin'
import { playWord } from '../../lib/audio'
import { useContent } from '../../lib/content'
import { activeGroup } from '../../lib/items'
import { Group, Learner, getLearner, setCurrentGroup, storageUrl } from '../../lib/supabase'
import { RecordButton } from '../ui/RecordButton'

export function GroupsTab() {
  const content = useContent()
  const [learner, setLearner] = useState<Learner | null>(null)
  const [editing, setEditing] = useState<Group | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getLearner().then(setLearner)
  }, [])

  const current = activeGroup(content, learner)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'משהו השתבש')
    }
  }

  const makeCurrent = (g: Group) =>
    run(async () => {
      const err = await setCurrentGroup(g.id)
      if (err) throw new Error(err)
      setLearner(await getLearner())
    })

  if (editing)
    return (
      <GroupEditor
        group={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    )

  return (
    <div className="panel">
      <p className="muted">
        כל קבוצה היא רשימה של הברות או מילים (2–3 הברות) עם ניקוד. המשחקים משתמשים בקבוצה הנוכחית ⭐,
        לפי הסדר. אחרי סבב מוצלח (80% ומעלה) דובי יכול לעבור לקבוצה הבאה.
      </p>
      {error && <p className="error">{error}</p>}

      <ol className="group-list">
        {content.groups.map((g, i) => (
          <li key={g.id} className={current?.id === g.id ? 'group current' : 'group'}>
            <div className="group-head">
              <button className="group-name" onClick={() => setOpen(open === g.id ? null : g.id)}>
                {current?.id === g.id && '⭐ '}
                {g.name}
                <span className="muted"> · {g.words.length} פריטים</span>
              </button>
              <div className="group-actions">
                <button className="rec-btn" disabled={i === 0} onClick={() => void run(() => moveGroup(g, -1))} title="למעלה">
                  ↑
                </button>
                <button
                  className="rec-btn"
                  disabled={i === content.groups.length - 1}
                  onClick={() => void run(() => moveGroup(g, 1))}
                  title="למטה"
                >
                  ↓
                </button>
                <button className="rec-btn" onClick={() => setEditing(g)} title="עריכה">
                  ✏️
                </button>
                <button
                  className="rec-btn"
                  onClick={() => confirm(`למחוק את "${g.name}" וכל המילים שבה?`) && void run(() => deleteGroup(g))}
                  title="מחיקה"
                >
                  🗑
                </button>
              </div>
            </div>
            <div className="chips">
              {g.words.map((w) => (
                <span key={w.id} className="chip">
                  {w.text}
                </span>
              ))}
            </div>
            {current?.id !== g.id && (
              <button className="link" onClick={() => void makeCurrent(g)}>
                ⭐ הפוך לקבוצה הנוכחית
              </button>
            )}
            {open === g.id && (
              <ul className="word-list">
                <li className="muted">הקלטה למילה שלמה (לא חובה — בלעדיה מחברים את הקלטות ההברות):</li>
                {g.words.map((w) => (
                  <li key={w.id} className="word-row">
                    <button className="word-text" onClick={() => void playWord(w)} title="השמע">
                      {w.text}
                    </button>
                    <span className="muted">{w.syllables.map((s) => s.text).join('·')}</span>
                    <RecordButton
                      existingUrl={w.audio_path ? storageUrl(w.audio_path) : null}
                      onSave={(b) => saveWordRecording(w.id, w.audio_path, b)}
                      onDelete={() => deleteWordRecording(w.id, w.audio_path)}
                      maxMs={5000}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <button className="btn primary" onClick={() => setEditing('new')}>
        + קבוצה חדשה
      </button>
    </div>
  )
}

function GroupEditor({ group, onDone }: { group: Group | null; onDone: () => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [text, setText] = useState(group ? group.words.map((w) => w.text).join('\n') : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  const lines = splitLines(text)
  const checks = lines.map(checkLine)

  /** Put a nikud mark at the cursor (typing nikud is hard on most keyboards). */
  const insert = (mark: string) => {
    const el = area.current
    if (!el) return setText((t) => t + mark)
    const { selectionStart: a, selectionEnd: b } = el
    const next = text.slice(0, a) + mark + text.slice(b)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + mark.length, a + mark.length)
    })
  }

  const save = async () => {
    if (!name.trim()) return setError('צריך שם לקבוצה')
    if (!lines.length) return setError('צריך לפחות מילה אחת')
    setBusy(true)
    setError(null)
    try {
      if (group) await updateGroup(group, name.trim(), lines)
      else await createGroup(name.trim(), lines)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השמירה נכשלה')
      setBusy(false)
    }
  }

  return (
    <div className="panel editor">
      <h3>{group ? 'עריכת קבוצה' : 'קבוצה חדשה'}</h3>
      <label>
        שם הקבוצה
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: ב + פתח/קמץ" />
      </label>
      <label>
        הברות ומילים — אחת בכל שורה, בסדר שבו ישחקו
        <textarea
          ref={area}
          dir="rtl"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'בַּ\nבָּ\nבַּבָּ\nמָמָּ'}
        />
      </label>
      <div className="nikud-keys">
        {NIKUD_KEYBOARD.map((k) => (
          <button key={k.name} type="button" className="nikud-key" onClick={() => insert(k.mark)} title={k.name}>
            <span className="nikud-sample">{(k.mark === '\u05C1' || k.mark === '\u05C2' ? 'ש' : 'ב') + k.mark}</span>
            <span className="nikud-name">{k.name}</span>
          </button>
        ))}
      </div>
      <p className="muted">מקלידים אות, ואז לוחצים על הניקוד שלה.</p>

      {checks.length > 0 && (
        <ul className="preview-list">
          {checks.map((c, i) => (
            <li key={i} className={c.warning ? 'warn' : ''}>
              <span className="preview-word">{c.text}</span>
              <span className="muted">{c.preview}</span>
              {c.warning && <span className="warning">⚠ {c.warning}</span>}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error">{error}</p>}
      <div className="finish-actions">
        <button className="btn primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'שומר…' : 'שמור'}
        </button>
        <button className="btn" disabled={busy} onClick={onDone}>
          ביטול
        </button>
      </div>
      {group && <p className="muted">מילים שנשארות ברשימה שומרות את ההקלטות שלהן.</p>}
    </div>
  )
}
