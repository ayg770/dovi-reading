import { useEffect, useState } from 'react'
import { Content, Group, loadContent, storageUrl } from './supabase'

// One shared copy of the content (groups, recordings, praise clips) for the whole app.

let content: Content = { groups: [], recordings: [], praise: [] }
let loading: Promise<Content> | null = null
const listeners = new Set<(c: Content) => void>()

export function getContent(): Content {
  return content
}

export function refreshContent(): Promise<Content> {
  loading = loadContent().then((c) => {
    content = c
    listeners.forEach((l) => l(c))
    return c
  })
  return loading
}

export function ensureContent(): Promise<Content> {
  return loading ?? refreshContent()
}

export function useContent(): Content {
  const [c, setC] = useState(content)
  useEffect(() => {
    listeners.add(setC)
    void ensureContent().then(setC)
    return () => {
      listeners.delete(setC)
    }
  }, [])
  return c
}

/** URL of a recording made in the settings, if there is one. */
export function recordedSyllableUrl(letterId: number, nikudId: number | null): string | null {
  const r = content.recordings.find(
    (r) => r.source === 'storage' && r.letter_id === letterId && r.nikud_id === nikudId,
  )
  return r ? storageUrl(r.audio_path) : null
}

export function praiseUrls(): string[] {
  return content.praise.map((p) => storageUrl(p.audio_path))
}

export function findGroup(groups: Group[], id: string | null | undefined): Group | null {
  return groups.find((g) => g.id === id) ?? null
}
