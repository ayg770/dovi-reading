import { RU } from './ru'

// Interface language. The learning content is always Hebrew; only the instructions,
// buttons and messages change. Text in the code is written in Hebrew and used as the
// key: t('חזרה') gives 'חזרה' in Hebrew and the Russian entry in ru.ts for Russian.
// A text without a Russian entry is shown in Hebrew (scripts/check-i18n.mjs finds those).

export type Lang = 'he' | 'ru'

export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'he', name: 'עברית' },
  { id: 'ru', name: 'Русский' },
]

const KEY = 'dovi-lang'

function initial(): Lang {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'he' || stored === 'ru') return stored
  } catch {
    // no storage
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'he'
}

let lang: Lang = initial()

function applyToPage() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  // Hebrew reads right to left; Russian left to right (Hebrew content keeps its own direction in CSS).
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  document.title = t('קוראים בניקוד')
}

export function getLang(): Lang {
  return lang
}

/** Switch language; `remember` keeps it on this device for the sign-in screen. */
export function setLang(next: Lang, remember = true) {
  lang = next
  if (remember) {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // private mode: not remembered
    }
  }
  applyToPage()
}

/** Translate; `{name}` placeholders are filled from params. */
export function t(key: string, params?: Record<string, string | number>): string {
  const text = lang === 'ru' ? (RU[key] ?? key) : key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''))
}

/** Voice language for instructions and cheers (not for the Hebrew learning content). */
export function speechLang(): string {
  return lang === 'ru' ? 'ru-RU' : 'he-IL'
}

const PRAISE: Record<Lang, string[]> = {
  he: ['כל הכבוד!', 'יופי!', 'מצוין!', 'נהדר!', 'איזה יופי!'],
  ru: ['Молодец!', 'Отлично!', 'Умница!', 'Здорово!', 'Супер!'],
}

export function praiseWords(): string[] {
  return PRAISE[lang]
}

applyToPage()
