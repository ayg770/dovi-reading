import { useEffect, useRef, useState } from 'react'
import { GroupsTab } from '../components/settings/GroupsTab'
import { PraiseTab } from '../components/settings/PraiseTab'
import { ProgressTab } from '../components/settings/ProgressTab'
import { SyllablesTab } from '../components/settings/SyllablesTab'
import { TextsTab } from '../components/settings/TextsTab'
import { Pronunciation, currentPronunciation } from '../data/hebrew'
import { currentAccount, forgetAccount, setStoredCode, setStoredName, switchAccount } from '../lib/account'
import { LanguageSwitch } from '../components/ui/LanguageSwitch'
import { changeCode, updateProfile } from '../lib/supabase'
import { t } from '../lib/i18n'

type Tab = 'groups' | 'texts' | 'syllables' | 'progress' | 'praise' | 'profile'

const TABS: { id: Tab; label: string }[] = [
  { id: 'groups', label: t('📚 קבוצות מילים') },
  { id: 'texts', label: t('📖 טקסטים') },
  { id: 'syllables', label: t('🎙️ הקלטות הברות') },
  { id: 'progress', label: t('📊 התקדמות') },
  { id: 'praise', label: t('🎉 עידוד') },
  { id: 'profile', label: t('👤 פרופיל') },
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
        <h2>{t('הגדרות')}</h2>
        <button className="btn small" onClick={onExit}>
          {t('✕ סגור')}
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
          {tab === 'texts' && <TextsTab />}
          {tab === 'syllables' && <SyllablesTab />}
          {tab === 'progress' && <ProgressTab />}
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
    if (!account || code !== account.code) return setError(t('קוד שגוי'))
    try {
      sessionStorage.setItem(UNLOCK_KEY, account.id)
    } catch {
      // stays unlocked until the settings close
    }
    onUnlock()
  }

  return (
    <form className="gate" onSubmit={submit}>
      <p>{t('כדי לשנות הגדרות של {name}, הכניסו את הקוד האישי:', { name: account?.name ?? '' })}</p>
      <input
        ref={input}
        type="password"
        autoComplete="current-password"
        placeholder={t('קוד אישי')}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={!code}>
        {t('כניסה')}
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
      setMsg(e instanceof Error ? e.message : t('משהו השתבש'))
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
    if (code.length < 4) return setMsg(t('הקוד צריך להיות לפחות 4 תווים'))
    if (code !== again) return setMsg(t('הקודים לא זהים'))
    void run(async () => {
      await changeCode(code)
      setStoredCode(account.id, code)
      location.reload()
    })
  }

  return (
    <div className="panel">
      <p className="field-title">{t('שפת הממשק')}</p>
      <LanguageSwitch onChange={(lang) => updateProfile({ language: lang })} />
      <hr />
      <form className="gate" onSubmit={saveProfile}>
        <label>
          {t('שם')}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="field-title">{t('הגייה')}</p>
        <div className="pron-options">
          <button
            type="button"
            className={pron === 'ashkenazi' ? 'pick-card on' : 'pick-card'}
            onClick={() => setPron('ashkenazi')}
          >
            <span className="pick-name">{t('אשכנזית')}</span>
            <span className="pron-sample">{t('בָּ = "bo" · בֹּ = "boy" · בֵּ = "bey"')}</span>
          </button>
          <button
            type="button"
            className={pron === 'sephardi' ? 'pick-card on' : 'pick-card'}
            onClick={() => setPron('sephardi')}
          >
            <span className="pick-name">{t('רגילה')}</span>
            <span className="pron-sample">{t('בָּ = "ba" · בֹּ = "bo" · בֵּ = "be"')}</span>
          </button>
        </div>
        <p className="muted">{t('הקלטות נשמרות לפי הגייה: אחרי מעבר, ההקלטות של ההגייה הקודמת לא יושמעו.')}</p>
        <button className="btn primary" disabled={busy || (name.trim() === account.name && pron === currentPronunciation())}>
          {t('שמירה')}
        </button>
      </form>

      <hr />
      <form className="gate" onSubmit={saveCode}>
        <p>{t('החלפת קוד אישי:')}</p>
        <input type="password" autoComplete="new-password" placeholder={t('קוד חדש')} value={code} onChange={(e) => setCode(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder={t('שוב, לאימות')} value={again} onChange={(e) => setAgain(e.target.value)} />
        <button className="btn" disabled={busy || !code}>
          {t('החלפת קוד')}
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}

      <hr />
      <div className="profile-actions">
        <button className="btn" onClick={onLock}>
          {t('🔒 נעילת ההגדרות')}
        </button>
        <button className="btn" onClick={() => switchAccount(null)}>
          {t('⇄ החלפת משתמש')}
        </button>
        <button
          className="btn"
          onClick={() =>
            confirm(t('להסיר את {name} מהמכשיר הזה? הנתונים נשמרים, ואפשר להיכנס שוב עם השם והקוד.', { name: account.name })) &&
            forgetAccount(account.id)
          }
        >
          {t('יציאה מהמכשיר')}
        </button>
      </div>
    </div>
  )
}
