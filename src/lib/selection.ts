/** What a game plays: single syllables (with chosen nikud) or one word group. */
export type Selection =
  | { kind: 'singles'; nikudIds: number[] }
  | { kind: 'group'; groupId: string }

const storageKey = (game: string) => `dovi-selection-${game}`

/** The last choice made for this game on this device (a per-device convenience). */
export function loadSelection(game: string): Selection | null {
  try {
    const raw = localStorage.getItem(storageKey(game))
    if (!raw) return null
    const s = JSON.parse(raw) as Selection
    if (s.kind === 'singles' && Array.isArray(s.nikudIds) && s.nikudIds.length) return s
    if (s.kind === 'group' && typeof s.groupId === 'string') return s
  } catch {
    // no storage, or bad data: fall through
  }
  return null
}

export function saveSelection(game: string, s: Selection) {
  try {
    localStorage.setItem(storageKey(game), JSON.stringify(s))
  } catch {
    // private mode: not remembered
  }
}
