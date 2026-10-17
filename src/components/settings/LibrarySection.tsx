import { useEffect, useState } from 'react'
import { refreshContent, useContent } from '../../lib/content'
import { t } from '../../lib/i18n'
import { LibraryGroup, addLibraryGroup, getLearnerId, loadLibrary, publishGroup, unpublishGroup } from '../../lib/supabase'
import { stripMarkers } from '../../data/hebrew'

const CATEGORY_NAMES: Record<string, string> = {
  psalms: 'תהילים',
  texts: 'טקסטים של משתמשים',
  words: 'רשימות של משתמשים',
}

/** The shared library: texts (or word lists) to add to my own. */
export function LibrarySection({ kind }: { kind: 'text' | 'words' }) {
  const content = useContent()
  const [items, setItems] = useState<LibraryGroup[] | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void loadLibrary().then(setItems)
    void getLearnerId().then(setMe)
  }, [])

  const mine = [...content.groups, ...content.texts]
  const shown = (items ?? []).filter((g) => g.kind === kind && g.author !== me)
  if (items && shown.length === 0) return null

  const add = async (g: LibraryGroup) => {
    setBusy(g.id)
    setError(null)
    try {
      await addLibraryGroup(g.id)
      await refreshContent()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('משהו השתבש'))
    }
    setBusy(null)
  }

  const categories = [...new Set(shown.map((g) => g.category))]

  return (
    <div className="panel library">
      <button className="group-name" onClick={() => setOpen(!open)}>
        📚 {t('הספרייה המשותפת')} {open ? '▾' : '◂'}
      </button>
      {open && (
        <>
          <p className="muted">{t('טקסטים ורשימות שאפשר להוסיף לשלי. ההעתקה שלי — אפשר לערוך אותה בלי להשפיע על אחרים.')}</p>
          {error && <p className="error">{error}</p>}
          {categories.map((c) => (
            <div key={c}>
              <h4>{t(CATEGORY_NAMES[c] ?? c)}</h4>
              <ul className="group-list">
                {shown
                  .filter((g) => g.category === c)
                  .map((g) => {
                    const have = mine.some((m) => m.library_id === g.id)
                    return (
                      <li key={g.id} className="group">
                        <div className="group-head">
                          <span className="group-name">
                            {g.name} <span className="muted">· {t('{n} שורות', { n: g.words.length })}</span>
                          </span>
                          <button className="btn small" disabled={have || busy === g.id} onClick={() => void add(g)}>
                            {have ? t('כבר אצלי ✓') : t('➕ הוספה')}
                          </button>
                        </div>
                        <p className="muted text-preview">{stripMarkers(g.words[0]?.text ?? '')}</p>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/** Which of my groups are published in the library, and a way to publish or take back. */
export function usePublished() {
  const [published, setPublished] = useState<Set<string>>(new Set())
  const reload = async () => {
    const me = await getLearnerId()
    const all = await loadLibrary()
    setPublished(new Set(all.filter((g) => g.author === me && g.source_group_id).map((g) => g.source_group_id!)))
  }
  useEffect(() => {
    void reload()
  }, [])
  const toggle = async (groupId: string, category: string) => {
    if (published.has(groupId)) await unpublishGroup(groupId)
    else await publishGroup(groupId, category)
    await reload()
  }
  return { published, toggle }
}
