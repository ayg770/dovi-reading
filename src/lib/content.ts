import { useEffect, useState } from 'react'
import { currentPronunciation } from '../data/hebrew'
import { currentAccount } from './account'
import { Content, Group, Recording, loadContent, signAudio } from './supabase'

// One shared copy of the content (groups, recordings, praise clips) for the whole app.

let content: Content = { groups: [], texts: [], recordings: [], praise: [] }
/** Recordings are private; these are temporary links to them, by storage path. */
let links: Record<string, string> = {}
let loading: Promise<Content> | null = null
const listeners = new Set<(c: Content) => void>()

export function getContent(): Content {
  return content
}

const snapshotKey = () => `dovi-content-${currentAccount()?.id ?? 'none'}`

/** The last successfully loaded groups and texts, kept on the device for when there is no connection. */
function readSnapshot(): Content | null {
  try {
    const raw = localStorage.getItem(snapshotKey())
    return raw ? (JSON.parse(raw) as Content) : null
  } catch {
    return null
  }
}

function writeSnapshot(c: Content) {
  try {
    // Recordings are not kept: their links need a connection anyway.
    localStorage.setItem(snapshotKey(), JSON.stringify({ groups: c.groups, texts: c.texts, recordings: [], praise: [] }))
  } catch {
    // storage full or blocked: no offline copy
  }
}

export function refreshContent(): Promise<Content> {
  loading = loadContent().then(async (loaded) => {
    let c = loaded
    if (loaded.failed) {
      const old = readSnapshot()
      if (old && (old.groups.length || old.texts.length)) c = old
    } else writeSnapshot(loaded)
    const paths = [
      ...c.recordings.filter((r) => r.source === 'storage').map((r) => r.audio_path),
      ...c.groups.flatMap((g) => g.words.map((w) => w.audio_path)),
      ...c.praise.map((p) => p.audio_path),
    ].filter((p): p is string => !!p)
    links = await signAudio(paths)
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

/** Link to one of this user's recordings ('' until content has loaded). */
export function storageUrl(path: string): string {
  return links[path] ?? ''
}

/** This user's recording of a syllable, in the pronunciation they use now. */
export function ownRecording(letterId: number, nikudId: number | null): Recording | undefined {
  const pron = currentPronunciation()
  return content.recordings.find(
    (r) =>
      r.source === 'storage' && r.letter_id === letterId && r.nikud_id === nikudId && r.pronunciation === pron,
  )
}

/** URL of a recording made in the settings, if there is one. */
export function recordedSyllableUrl(letterId: number, nikudId: number | null): string | null {
  const r = ownRecording(letterId, nikudId)
  return r ? storageUrl(r.audio_path) : null
}

export function praiseUrls(): string[] {
  return content.praise.map((p) => storageUrl(p.audio_path))
}

export function findGroup(groups: Group[], id: string | null | undefined): Group | null {
  return groups.find((g) => g.id === id) ?? null
}
