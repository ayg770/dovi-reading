import { useEffect, useRef, useState } from 'react'
import { GroupsTab } from '../components/settings/GroupsTab'
import { PraiseTab } from '../components/settings/PraiseTab'
import { SyllablesTab } from '../components/settings/SyllablesTab'
import { Pronunciation, currentPronunciation } from '../data/hebrew'
import { currentAccount, forgetAccount, setStoredCode, setStoredName, switchAccount } from '../lib/account'
import { changeCode, updateProfile } from '../lib/supabase'

type Tab = 'groups' | 'syllables' | 'praise' | 'profile'

const TABS: { id: Tab; label: string }[] = [
  { id: 'groups', label: '📚 קבוצות מילים' },
  { id: 'syllables', label: '🎙️ הקלטות הברות' },
  { id: 'praise', label: '🎉 עידוד' },
  { id: 'profile', label: '👤 פרופיל' },
]

const UNLOCK_KEY = 'dovi-settings-unlocked'

/** Settings open with the user's code each visit, so a child can play but not edit. */
function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === currentAccount()?.id
  } catch {
    return false
  }
}

export function Settings({ onExit }: { onExit: () => void }) {
  const [unlocked, setUnlocked] = useState(isUnlocked())
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
        <CodeGate onUnlock={() => setUnlocked(true)} />
      ) : (
        <>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'groups' && <GroupsTab />}
          {tab === 'syllables' && <SyllablesTab />}
          {tab === 'praise' && <PraiseTab />}
          {tab === 'profile' && (
            <ProfileTab
              onLock={() => {
                try {
                  sessionStorage.removeItem(UNLOCK_KEY)
                } catch {
                  // ignore
                }
                setUnlocked(false)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function CodeGate({ onUnlock }: { onUnlock: () => void }) {
  const account = currentAccount()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || code !== account.code) return setError('קוד שגוי')
    try {
      sessionStorage.setItem(UNLOCK_KEY, account.id)
    } catch {
      // stays unlocked until the settings close
    }
    onUnlock()
  }

  return (
    <form className="gate" onSubmit={submit}>
      <p>כדי לשנות הגדרות של {account?.name}, הכניסו את הקוד האישי:</p>
      <input
        ref={input}
        type="password"
        autoComplete="current-password"
        placeholder="קוד אישי"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={!code}>
        כניסה
      </button>
    </form>
  )
}

function ProfileTab({ onLock }: { onLock: () => void }) {
  const account = currentAccount()!
  const [name, setName] = useState(account.name)
  const [pron, setPron] = useState<Pronunciation>(currentPronunciation())
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setMsg(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'משהו השתבש')
    }
    setBusy(false)
  }

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await updateProfile({ name: name.trim(), pronunciation: pron })
      setStoredName(account.id, name.trim())
      // Pronunciation changes how everything sounds and is checked: start fresh.
      location.reload()
    })
  }

  const saveCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 4) return setMsg('הקוד צריך להיות לפחות 4 תווים')
    if (code !== again) return setMsg('הקודים לא זהים')
    void run(async () => {
      await changeCode(code)
      setStoredCode(account.id, code)
      location.reload()
    })
  }

  return (
    <div className="panel">
      <form className="gate" onSubmit={saveProfile}>
        <label>
          שם
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="field-title">הגייה</p>
        <div className="pron-options">
          <button
            type="button"
            className={pron === 'ashkenazi' ? 'pick-card on' : 'pick-card'}
            onClick={() => setPron('ashkenazi')}
          >
            <span className="pick-name">אשכנזית</span>
            <span className="pron-sample">בָּ = "bo" · בֹּ = "boy" · בֵּ = "bey"</span>
          </button>
          <button
            type="button"
            className={pron === 'sephardi' ? 'pick-card on' : 'pick-card'}
            onClick={() => setPron('sephardi')}
          >
            <span className="pick-name">רגילה</span>
            <span className="pron-sample">בָּ = "ba" · בֹּ = "bo" · בֵּ = "be"</span>
          </button>
        </div>
        <p className="muted">הקלטות נשמרות לפי הגייה: אחרי מעבר, ההקלטות של ההגייה הקודמת לא יושמעו.</p>
        <button className="btn primary" disabled={busy || (name.trim() === account.name && pron === currentPronunciation())}>
          שמירה
        </button>
      </form>

      <hr />
      <form className="gate" onSubmit={saveCode}>
        <p>החלפת קוד אישי:</p>
        <input type="password" autoComplete="new-password" placeholder="קוד חדש" value={code} onChange={(e) => setCode(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="שוב, לאימות" value={again} onChange={(e) => setAgain(e.target.value)} />
        <button className="btn" disabled={busy || !code}>
          החלפת קוד
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}

      <hr />
      <div className="profile-actions">
        <button className="btn" onClick={onLock}>
          🔒 נעילת ההגדרות
        </button>
        <button className="btn" onClick={() => switchAccount(null)}>
          ⇄ החלפת משתמש
        </button>
        <button
          className="btn"
          onClick={() =>
            confirm(`להסיר את ${account.name} מהמכשיר הזה? הנתונים נשמרים, ואפשר להיכנס שוב עם השם והקוד.`) &&
            forgetAccount(account.id)
          }
        >
          יציאה מהמכשיר
        </button>
      </div>
    </div>
  )
}
