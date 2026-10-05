// The users signed in on this device. Several people can share one device
// (a child and a parent); one of them is the current user.

export type Account = { id: string; name: string; code: string }

const ACCOUNTS_KEY = 'dovi-accounts'
const CURRENT_KEY = 'dovi-current-account'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private mode: the sign-in lasts until the page closes
  }
}

let accounts: Account[] = read<Account[]>(ACCOUNTS_KEY, [])
let currentId: string | null = read<string | null>(CURRENT_KEY, null)

export function getAccounts(): Account[] {
  return accounts
}

export function currentAccount(): Account | null {
  return accounts.find((a) => a.id === currentId) ?? null
}

/** Remember an account on this device and make it the current one. */
export function rememberAccount(a: Account) {
  accounts = [...accounts.filter((x) => x.id !== a.id), a]
  currentId = a.id
  write(ACCOUNTS_KEY, accounts)
  write(CURRENT_KEY, currentId)
}

export function setStoredCode(id: string, code: string) {
  accounts = accounts.map((a) => (a.id === id ? { ...a, code } : a))
  write(ACCOUNTS_KEY, accounts)
}

export function setStoredName(id: string, name: string) {
  accounts = accounts.map((a) => (a.id === id ? { ...a, name } : a))
  write(ACCOUNTS_KEY, accounts)
}

/**
 * Switch user. Everything loaded so far (content, stars, progress) belongs to the
 * previous user, so the simplest correct thing is to start the app again.
 */
export function switchAccount(id: string | null) {
  currentId = id
  write(CURRENT_KEY, id)
  location.reload()
}

/** Forget an account on this device (the user and their data stay on the server). */
export function forgetAccount(id: string) {
  accounts = accounts.filter((a) => a.id !== id)
  write(ACCOUNTS_KEY, accounts)
  if (currentId === id) switchAccount(null)
}
