import { currentAccount } from './account'

/** What a game plays: single syllables (with chosen nikud) or one word group. */
export type Selection =
  | { kind: 'singles'; nikudIds: number[]; rounds?: number }
  | { kind: 'group'; groupId: string; rounds?: number }

/** Rounds per game: 0 means the whole group. */
export const ROUND_CHOICES = [5, 10, 0]

export function defaultRounds(kind: Selection['kind']): number {
  return kind === 'singles' ? 10 : 0
}

export function roundsOf(s: Selection): number {
  return s.rounds ?? defaultRounds(s.kind)
}

// Per user: two people on one device keep their own last choice.
const storageKey = (game: string) => `dovi-selection-${currentAccount()?.id ?? 'none'}-${game}`

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

/**
 * A short game over a long list plays the next `rounds` items each time, wrapping
 * around at the end, so repeated short games walk through the whole group.
 * rounds = 0 (or at least the whole list) plays everything.
 */
export function windowItems<T>(items: T[], key: string, rounds: number): T[] {
  if (rounds <= 0 || rounds >= items.length) return items
  const k = `dovi-pos-${currentAccount()?.id ?? 'none'}-${key}`
  let start = 0
  try {
    start = (Number(localStorage.getItem(k)) || 0) % items.length
    localStorage.setItem(k, String((start + rounds) % items.length))
  } catch {
    // not remembered: always from the start
  }
  return Array.from({ length: rounds }, (_, i) => items[(start + i) % items.length])
}
