import { useEffect, useRef, useState } from 'react'
import { GroupsTab } from '../components/settings/GroupsTab'
import { PraiseTab } from '../components/settings/PraiseTab'
import { SyllablesTab } from '../components/settings/SyllablesTab'
import {
  isParentUnlocked,
  lockParent,
  parentCodeExists,
  setParentCode,
  unlockParent,
} from '../lib/supabase'

type Tab = 'groups' | 'syllables' | 'praise' | 'code'

const TABS: { id: Tab; label: string }[] = [
  { id: 'groups', label: '📚 קבוצות מילים' },
  { id: 'syllables', label: '🎙️ הקלטות הברות' },
  { id: 'praise', label: '🎉 עידוד' },
  { id: 'code', label: '🔒 קוד הורה' },
]

export function Settings({ onExit }: { onExit: () => void }) {
  const [unlocked, setUnlocked] = useState(isParentUnlocked())
  const [tab, setTab] = useState<Tab>('groups')

  return (
    <div className="settings">
      <header className="settings-bar">
        <h2>הגדרות</h2>
        <button className="btn small" onClick={onExit}>
          ✕ סגור
        </button>
      </header>
      {!unlocked ? (
        <ParentGate onUnlock={() => setUnlocked(true)} />
      ) : (
        <>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'tab on' : 'tab'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'groups' && <GroupsTab />}
          {tab === 'syllables' && <SyllablesTab />}
          {tab === 'praise' && <PraiseTab />}
          {tab === 'code' && (
            <CodeTab
              onLock={() => {
                lockParent()
                setUnlocked(false)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function ParentGate({ onUnlock }: { onUnlock: () => void }) {
  const [exists, setExists] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void parentCodeExists().then(setExists)
  }, [])
  useEffect(() => input.current?.focus(), [exists])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    if (exists) {
      if (await unlockParent(code)) onUnlock()
      else setError('קוד שגוי')
    } else {
      if (code.length < 6) setError('לפחות 6 תווים')
      else if (code !== again) setError('הקודים לא זהים')
      else {
        const err = await setParentCode(code)
        if (err) setError(err)
        else onUnlock()
      }
    }
    setBusy(false)
  }

  if (exists === null) return <p className="muted">…</p>

  return (
    <form className="gate" onSubmit={submit}>
      <p>
        {exists
          ? 'ההגדרות מיועדות להורים. הכנס את קוד ההורה:'
          : 'בפעם הראשונה בוחרים קוד הורה (לפחות 6 תווים). הוא שומר שרק מי שיודע אותו יכול לשנות מילים והקלטות.'}
      </p>
      <input
        ref={input}
        type="password"
        inputMode="text"
        autoComplete={exists ? 'current-password' : 'new-password'}
        placeholder="קוד הורה"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {!exists && (
        <input
          type="password"
          autoComplete="new-password"
          placeholder="שוב, לאימות"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !code}>
        {exists ? 'כניסה' : 'שמור קוד'}
      </button>
    </form>
  )
}

function CodeTab({ onLock }: { onLock: () => void }) {
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 6) return setMsg('לפחות 6 תווים')
    if (code !== again) return setMsg('הקודים לא זהים')
    const err = await setParentCode(code)
    setMsg(err ?? 'הקוד הוחלף ✓')
    setCode('')
    setAgain('')
  }

  return (
    <div className="panel">
      <form className="gate" onSubmit={change}>
        <p>החלפת קוד הורה:</p>
        <input type="password" autoComplete="new-password" placeholder="קוד חדש" value={code} onChange={(e) => setCode(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="שוב, לאימות" value={again} onChange={(e) => setAgain(e.target.value)} />
        {msg && <p className="muted">{msg}</p>}
        <button className="btn primary" disabled={!code}>
          החלף קוד
        </button>
      </form>
      <hr />
      <p className="muted">הכניסה נשמרת עד סגירת הלשונית בדפדפן.</p>
      <button className="btn" onClick={onLock}>
        🔒 נעל עכשיו
      </button>
    </div>
  )
}
