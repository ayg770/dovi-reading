import { LANGUAGES, Lang, getLang, setLang } from '../../lib/i18n'

/** Interface language. Switching reloads the page so every text is built again. */
export function LanguageSwitch({ onChange }: { onChange?: (lang: Lang) => Promise<void> | void }) {
  const current = getLang()
  const choose = async (l: Lang) => {
    if (l === current) return
    setLang(l)
    try {
      await onChange?.(l)
    } finally {
      location.reload()
    }
  }
  return (
    <div className="lang-switch" role="group" aria-label="Language / שפה / Язык" dir="ltr">
      {LANGUAGES.map((l) => (
        <button key={l.id} className={l.id === current ? 'lang on' : 'lang'} onClick={() => void choose(l.id)}>
          {l.name}
        </button>
      ))}
    </div>
  )
}
