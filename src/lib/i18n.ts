import { FA } from './fa'
import { RU } from './ru'

// Interface language. The learning content is always Hebrew; only the instructions,
// buttons and messages change. Text in the code is written in Hebrew and used as the
// key: t('חזרה') gives 'חזרה' in Hebrew and the Russian entry in ru.ts for Russian.
// A text without a Russian entry is shown in Hebrew (scripts/check-i18n.mjs finds those).

export type Lang = 'he' | 'ru' | 'fa'

export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'he', name: 'עברית' },
  { id: 'ru', name: 'Русский' },
  { id: 'fa', name: 'فارسی' },
]

const KEY = 'dovi-lang'

function initial(): Lang {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'he' || stored === 'ru' || stored === 'fa') return stored
  } catch {
    // no storage
  }
  const nav = typeof navigator !== 'undefined' ? (navigator.language ?? '').toLowerCase() : ''
  return nav.startsWith('ru') ? 'ru' : nav.startsWith('fa') ? 'fa' : 'he'
}

let lang: Lang = initial()

function applyToPage() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  // Hebrew and Persian read right to left; Russian left to right (Hebrew content keeps its own direction in CSS).
  document.documentElement.dir = lang === 'ru' ? 'ltr' : 'rtl'
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
  const text = lang === 'ru' ? (RU[key] ?? key) : lang === 'fa' ? (FA[key] ?? key) : key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''))
}

/** Voice language for instructions and cheers (not for the Hebrew learning content). */
export function speechLang(): string {
  return lang === 'ru' ? 'ru-RU' : lang === 'fa' ? 'fa-IR' : 'he-IL'
}

/** Locale for dates and numbers. */
export function dateLocale(): string {
  return speechLang()
}

const PRAISE: Record<Lang, string[]> = {
  he: ['כל הכבוד!', 'יופי!', 'מצוין!', 'נהדר!', 'איזה יופי!'],
  ru: ['Молодец!', 'Отлично!', 'Умница!', 'Здорово!', 'Супер!'],
  fa: ['آفرین!', 'عالی!', 'احسنت!', 'خیلی خوب!', 'فوق‌العاده!'],
}

export function praiseWords(): string[] {
  return PRAISE[lang]
}

applyToPage()
