import { useState } from 'react'
import type { Pronunciation } from '../data/hebrew'
import { getAccounts, rememberAccount, switchAccount } from '../lib/account'
import { createUser, loginUser } from '../lib/supabase'

type Mode = 'pick' | 'new' | 'login'

/** Who is reading? Pick a user on this device, create one, or sign in to an existing one. */
export function Welcome({ error }: { error?: string | null }) {
  const accounts = getAccounts()
  const [mode, setMode] = useState<Mode>(accounts.length ? 'pick' : 'new')

  return (
    <div className="welcome">
      <h1>
        קוראים <span>בניקוד</span>
      </h1>
      <p className="nikud-row">בַּ בִּ בָּ</p>
      {error && <p className="error">{error}</p>}

      {mode === 'pick' && (
        <>
          <p className="prompt">מי קורא?</p>
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
              + משתמש חדש
            </button>
            <button className="btn" onClick={() => setMode('login')}>
              כבר יש לי משתמש
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
  { id: 'ashkenazi', title: 'הגייה אשכנזית', sample: 'בָּ = "bo" · בֹּ = "boy" · בֵּ = "bey"' },
  { id: 'sephardi', title: 'הגייה רגילה', sample: 'בָּ = "ba" · בֹּ = "bo" · בֵּ = "be"' },
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
    if (!name.trim()) return setError('צריך שם')
    if (code.length < 4) return setError('הקוד צריך להיות לפחות 4 תווים')
    if (code !== again) return setError('הקודים לא זהים')
    setBusy(true)
    try {
      const id = await createUser(name.trim(), code, pron)
      rememberAccount({ id, name: name.trim(), code })
      switchAccount(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'משהו השתבש')
      setBusy(false)
    }
  }

  return (
    <form className="panel account-form" onSubmit={submit}>
      <h3>משתמש חדש</h3>
      <label>
        שם
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      </label>
      <label>
        קוד אישי (לפחות 4 תווים)
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="new-password" />
      </label>
      <label>
        שוב, לאימות
        <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </label>
      <p className="muted">עם השם והקוד אפשר להיכנס גם ממכשיר אחר. שמרו אותם.</p>

      <p className="field-title">איך קוראים?</p>
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
      <p className="muted">אפשר לשנות אחר כך בהגדרות.</p>

      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? '…' : 'יוצאים לדרך ▶'}
      </button>
      <div className="welcome-links">
        {onBack && (
          <button type="button" className="link" onClick={onBack}>
            חזרה
          </button>
        )}
        <button type="button" className="link" onClick={onLogin}>
          כבר יש לי משתמש
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
        setError('השם או הקוד לא נכונים')
        setBusy(false)
        return
      }
      rememberAccount({ id, name: name.trim(), code })
      switchAccount(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'משהו השתבש')
      setBusy(false)
    }
  }

  return (
    <form className="panel account-form" onSubmit={submit}>
      <h3>כניסה למשתמש קיים</h3>
      <label>
        שם
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
      </label>
      <label>
        קוד אישי
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !name || !code}>
        {busy ? '…' : 'כניסה'}
      </button>
      <div className="welcome-links">
        <button type="button" className="link" onClick={onBack}>
          חזרה
        </button>
      </div>
    </form>
  )
}
