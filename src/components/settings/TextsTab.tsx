import { useState } from 'react'
import { hasNikud } from '../../data/hebrew'
import { createGroup, deleteGroup, updateGroup } from '../../lib/admin'
import { useContent } from '../../lib/content'
import { t } from '../../lib/i18n'
import type { Group } from '../../lib/supabase'
import { splitSegments, uniqueWords, wordsOf } from '../../lib/texts'

/** Your own texts (a prayer, a page of a book) to practice reading, cut into short lines. */
export function TextsTab() {
  const { texts } = useContent()
  const [editing, setEditing] = useState<Group | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('משהו השתבש'))
    }
    setBusy(false)
  }

  if (editing) return <TextEditor text={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />

  return (
    <div className="panel">
      <p className="muted">
        {t('הדביקו טקסט עם ניקוד (למשל תפילה של 200–300 מילים). הוא נחתך לשורות קצרות, ואפשר לקרוא אותו עם הדגשה אוטומטית בקצב שבוחרים, או בקול.')}
      </p>
      {error && <p className="error">{error}</p>}
      <ul className="group-list">
        {texts.map((g) => (
          <li key={g.id} className="group">
            <div className="group-head">
              <span className="group-name">
                {g.name} <span className="muted">· {t('{n} שורות', { n: g.words.length })}</span>
              </span>
              <div className="group-actions">
                <button className="rec-btn" disabled={busy} onClick={() => setEditing(g)} title={t('עריכה')}>
                  ✏️
                </button>
                <button
                  className="rec-btn"
                  disabled={busy}
                  title={t('קבוצת מילים מהטקסט')}
                  onClick={() =>
                    void run(() =>
                      createGroup(
                        `${g.name} — ${t('מילים')}`,
                        uniqueWords(g.words.map((w) => w.text).join(' ')),
                      ),
                    )
                  }
                >
                  🔤
                </button>
                <button
                  className="rec-btn"
                  disabled={busy}
                  title={t('מחיקה')}
                  onClick={() => confirm(t('למחוק את "{name}" וכל המילים שבה?', { name: g.name })) && void run(() => deleteGroup(g))}
                >
                  🗑
                </button>
              </div>
            </div>
            <p className="muted text-preview">{g.words[0]?.text}</p>
          </li>
        ))}
      </ul>
      <button className="btn primary" onClick={() => setEditing('new')}>
        {t('+ טקסט חדש')}
      </button>
    </div>
  )
}

function TextEditor({ text, onDone }: { text: Group | null; onDone: () => void }) {
  const [name, setName] = useState(text?.name ?? '')
  const [body, setBody] = useState(text ? text.words.map((w) => w.text).join('\n') : '')
  const [maxWords, setMaxWords] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const segments = splitSegments(body, maxWords)
  const words = wordsOf(body)
  const pointed = words.filter((w) => hasNikud(w)).length

  const save = async () => {
    if (!name.trim()) return setError(t('צריך שם לטקסט'))
    if (!segments.length) return setError(t('צריך טקסט'))
    setBusy(true)
    setError(null)
    try {
      if (text) await updateGroup(text, name.trim(), segments)
      else await createGroup(name.trim(), segments, 'text')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('השמירה נכשלה'))
      setBusy(false)
    }
  }

  return (
    <div className="panel editor">
      <h3>{text ? t('עריכת טקסט') : t('טקסט חדש')}</h3>
      <label>
        {t('שם הטקסט')}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('למשל: קריאת שמע')} />
      </label>
      <label>
        {t('הטקסט (עם ניקוד)')}
        <textarea dir="rtl" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label>
        {t('עד כמה מילים בשורה?')}
        <select value={maxWords} onChange={(e) => setMaxWords(Number(e.target.value))}>
          {[4, 6, 8, 10, 14, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        {t('{words} מילים, {lines} שורות', { words: words.length, lines: segments.length })}
        {words.length > 0 && pointed < words.length * 0.8 && <span className="warning"> ⚠ {t('בחלק מהמילים אין ניקוד')}</span>}
      </p>
      {segments.length > 0 && (
        <ul className="preview-list">
          {segments.slice(0, 6).map((s, i) => (
            <li key={i}>
              <span className="preview-word">{s}</span>
            </li>
          ))}
          {segments.length > 6 && <li className="muted">…</li>}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <div className="finish-actions">
        <button className="btn primary" disabled={busy} onClick={() => void save()}>
          {busy ? t('שומר…') : t('שמור')}
        </button>
        <button className="btn" disabled={busy} onClick={onDone}>
          {t('ביטול')}
        </button>
      </div>
    </div>
  )
}
