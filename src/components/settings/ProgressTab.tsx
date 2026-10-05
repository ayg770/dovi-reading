import { useEffect, useState } from 'react'
import { BASIC_NIKUD_IDS, NIKUD, SYLLABLE_LETTERS, syllableText } from '../../data/hebrew'
import { getLang, t } from '../../lib/i18n'
import { useStars } from '../../lib/stars'
import { ProgressRow, SessionRow, loadProgress, loadSessions } from '../../lib/supabase'

const GAME_NAMES: Record<string, string> = {
  hear_syllable: 'שמע ובחר',
  read_aloud: 'קרא בקול',
  syllable_train: 'רכבת ההברות',
  build_word: 'בנה מילה',
  similar_letters: 'אותיות דומות',
  right_letter: 'האות הנכונה',
  read_text: 'קריאת טקסט',
  rsvp: 'קריאה ברצף',
}

function cellClass(row?: ProgressRow): string {
  if (!row || row.attempts === 0) return 'prog-cell none'
  const r = row.correct / row.attempts
  return r >= 0.8 ? 'prog-cell good' : r >= 0.5 ? 'prog-cell mid' : 'prog-cell bad'
}

/** For the grown-up: which syllables are solid, which are shaky, and what was played lately. */
export function ProgressTab() {
  const [rows, setRows] = useState<ProgressRow[] | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const { stars } = useStars()

  useEffect(() => {
    void Promise.all([loadProgress(), loadSessions()]).then(([r, s]) => {
      setRows(r)
      setSessions(s)
    })
  }, [])

  if (!rows) return <p className="muted">…</p>

  const find = (letterId: number, nikudId: number) => rows.find((r) => r.letter_id === letterId && r.nikud_id === nikudId)
  // Show the basic vowels, and any other that has been practiced.
  const used = NIKUD.filter((n) => BASIC_NIKUD_IDS.includes(n.id) || rows.some((r) => r.nikud_id === n.id))
  const attempts = rows.reduce((s, r) => s + r.attempts, 0)
  const correct = rows.reduce((s, r) => s + r.correct, 0)
  const weak = rows
    .filter((r) => r.attempts >= 2 && r.correct / r.attempts < 0.7)
    .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)
    .slice(0, 10)
  const date = new Intl.DateTimeFormat(getLang() === 'ru' ? 'ru-RU' : 'he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="panel">
      <div className="prog-summary">
        <div>
          <b>⭐ {stars}</b>
          <span className="muted">{t('כוכבים')}</span>
        </div>
        <div>
          <b>{attempts}</b>
          <span className="muted">{t('תשובות')}</span>
        </div>
        <div>
          <b>{attempts ? Math.round((correct / attempts) * 100) : 0}%</b>
          <span className="muted">{t('נכונות')}</span>
        </div>
      </div>

      <p className="field-title">{t('הברות מתקשות')}</p>
      {weak.length === 0 ? (
        <p className="muted">{t('עוד אין הברות מתקשות')}</p>
      ) : (
        <div className="chips">
          {weak.map((r) => {
            const letter = SYLLABLE_LETTERS.find((l) => l.id === r.letter_id)
            const nikud = NIKUD.find((n) => n.id === r.nikud_id)
            return letter && nikud ? (
              <span key={r.letter_id + '_' + r.nikud_id} className="chip bad">
                {syllableText({ letter, nikud })} <small>{Math.round((r.correct / r.attempts) * 100)}%</small>
              </span>
            ) : null
          })}
        </div>
      )}

      <p className="field-title">{t('מפת הברות')}</p>
      <p className="muted">{t('ירוק: מכיר, צהוב: בדרך, אדום: מתקשה, אפור: עוד לא תורגל')}</p>
      <div className="prog-grid" style={{ gridTemplateColumns: `2.5em repeat(${used.length}, 1fr)` }}>
        <div />
        {used.map((n) => (
          <div key={n.id} className="syl-head">
            {t(n.name)}
          </div>
        ))}
        {SYLLABLE_LETTERS.map((letter) => (
          <div key={letter.id} className="prog-row">
            <div className="syl-letter">{letter.glyph}</div>
            {used.map((n) => {
              const row = find(letter.id, n.id)
              return (
                <div key={n.id} className={cellClass(row)} title={row ? `${row.correct}/${row.attempts}` : ''}>
                  {syllableText({ letter, nikud: n })}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="field-title">{t('משחקים אחרונים')}</p>
      {sessions.length === 0 ? (
        <p className="muted">{t('עוד לא שוחק משחק')}</p>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span className="muted">{date.format(new Date(s.started_at))}</span>
              <span>{t(GAME_NAMES[s.game_type] ?? s.game_type)}</span>
              <b>
                {s.correct_answers}/{s.total_questions}
              </b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
