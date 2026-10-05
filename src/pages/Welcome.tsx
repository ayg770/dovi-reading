import { useState } from 'react'
import type { Pronunciation } from '../data/hebrew'
import { getAccounts, rememberAccount, switchAccount } from '../lib/account'
import { LanguageSwitch } from '../components/ui/LanguageSwitch'
import { getLang } from '../lib/i18n'
import { createUser, loginUser } from '../lib/supabase'
import { t } from '../lib/i18n'

type Mode = 'pick' | 'new' | 'login'

/** Who is reading? Pick a user on this device, create one, or sign in to an existing one. */
export function Welcome({ error }: { error?: string | null }) {
  const accounts = getAccounts()
  const [mode, setMode] = useState<Mode>(accounts.length ? 'pick' : 'new')

  return (
    <div className="welcome">
      <LanguageSwitch />
      <h1>{t('קוראים בניקוד')}</h1>
      <p className="nikud-row">בַּ בִּ בָּ</p>
      {error && <p className="error">{error}</p>}

      {mode === 'pick' && (
        <>
          <p className="prompt">{t('מי קורא?')}</p>
          <div className="who-list">
            {accounts.map((a) => (
              <button key={a.id} className="who" onClick={() => switchAccount(a.id)}>
                <span className="who-avatar">{a.name.slice(0, 1)}</span>
                <span className="who-name">{a.name}</span>
              </button>
            ))}
          </div>
          <div className="welcome-links">
            <button className="btn" onClick={() => setMode('new')}>
              {t('+ משתמש חדש')}
            </button>
            <button className="btn" onClick={() => setMode('login')}>
              {t('כבר יש לי משתמש')}
            </button>
          </div>
        </>
      )}
      {mode === 'new' && <NewUser onBack={accounts.length ? () => setMode('pick') : undefined} onLogin={() => setMode('login')} />}
      {mode === 'login' && <Login onBack={() => setMode(accounts.length ? 'pick' : 'new')} />}
    </div>
  )
}

const PRONUNCIATIONS: { id: Pronunciation; title: string; sample: string }[] = [
  { id: 'ashkenazi', title: t('הגייה אשכנזית'), sample: t('בָּ = "bo" · בֹּ = "boy" · בֵּ = "bey"') },
  { id: 'sephardi', title: t('הגייה רגילה'), sample: t('בָּ = "ba" · בֹּ = "bo" · בֵּ = "be"') },
]

function NewUser({ onBack, onLogin }: { onBack?: () => void; onLogin: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [pron, setPron] = useState<Pronunciation>('ashkenazi')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError(t('צריך שם'))
    if (code.length < 4) return setError(t('הקוד צריך להיות לפחות 4 תווים'))
    if (code !== again) return setError(t('הקודים לא זהים'))
    setBusy(true)
    try {
      const id = await createUser(name.trim(), code, pron, getLang())
      rememberAccount({ id, name: name.trim(), code })
      switchAccount(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('משהו השתבש'))
      setBusy(false)
    }
  }

  return (
    <form className="panel account-form" onSubmit={submit}>
      <h3>{t('משתמש חדש')}</h3>
      <label>
        {t('שם')}
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      </label>
      <label>
        {t('קוד אישי (לפחות 4 תווים)')}
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="new-password" />
      </label>
      <label>
        {t('שוב, לאימות')}
        <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </label>
      <p className="muted">{t('עם השם והקוד אפשר להיכנס גם ממכשיר אחר. שמרו אותם.')}</p>

      <p className="field-title">{t('איך קוראים?')}</p>
      <div className="pron-options">
        {PRONUNCIATIONS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={pron === p.id ? 'pick-card on' : 'pick-card'}
            onClick={() => setPron(p.id)}
          >
            <span className="pick-name">{p.title}</span>
            <span className="pron-sample">{p.sample}</span>
          </button>
        ))}
      </div>
      <p className="muted">{t('אפשר לשנות אחר כך בהגדרות.')}</p>

      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? '…' : t('יוצאים לדרך ▶')}
      </button>
      <div className="welcome-links">
        {onBack && (
          <button type="button" className="link" onClick={onBack}>
            {t('חזרה')}
          </button>
        )}
        <button type="button" className="link" onClick={onLogin}>
          {t('כבר יש לי משתמש')}
        </button>
      </div>
    </form>
  )
}

function Login({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const id = await loginUser(name.trim(), code)
      if (!id) {
        setError(t('השם או הקוד לא נכונים'))
        setBusy(false)
        return
      }
      rememberAccount({ id, name: name.trim(), code })
      switchAccount(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('משהו השתבש'))
      setBusy(false)
    }
  }

  return (
    <form className="panel account-form" onSubmit={submit}>
      <h3>{t('כניסה למשתמש קיים')}</h3>
      <label>
        {t('שם')}
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
      </label>
      <label>
        {t('קוד אישי')}
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !name || !code}>
        {busy ? '…' : t('כניסה')}
      </button>
      <div className="welcome-links">
        <button type="button" className="link" onClick={onBack}>
          {t('חזרה')}
        </button>
      </div>
    </form>
  )
}
