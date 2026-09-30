import { useEffect, useState } from 'react'
import { speak } from './audio'
import { addStars, getLearner } from './supabase'

// Stars across all games, and the animals they earn: one every STARS_PER_ANIMAL.

export const STARS_PER_ANIMAL = 10

export const ANIMALS: { emoji: string; name: string }[] = [
  { emoji: '🐶', name: 'כלב' },
  { emoji: '🐱', name: 'חתול' },
  { emoji: '🐰', name: 'ארנב' },
  { emoji: '🐻', name: 'דוב' },
  { emoji: '🦊', name: 'שועל' },
  { emoji: '🐼', name: 'פנדה' },
  { emoji: '🐸', name: 'צפרדע' },
  { emoji: '🦁', name: 'אריה' },
  { emoji: '🐯', name: 'נמר' },
  { emoji: '🐨', name: 'קואלה' },
  { emoji: '🐵', name: 'קוף' },
  { emoji: '🐧', name: 'פינגווין' },
  { emoji: '🐢', name: 'צב' },
  { emoji: '🐘', name: 'פיל' },
  { emoji: '🦒', name: 'ג׳ירפה' },
  { emoji: '🦓', name: 'זברה' },
  { emoji: '🐬', name: 'דולפין' },
  { emoji: '🐙', name: 'תמנון' },
  { emoji: '🦋', name: 'פרפר' },
  { emoji: '🦉', name: 'ינשוף' },
  { emoji: '🦄', name: 'חד קרן' },
  { emoji: '🐉', name: 'דרקון' },
]

export function animalsEarned(stars: number): number {
  return Math.min(ANIMALS.length, Math.floor(stars / STARS_PER_ANIMAL))
}

/** Next animal to earn, or null when he has them all. */
export function nextAnimal(stars: number) {
  return ANIMALS[animalsEarned(stars)] ?? null
}

type State = { stars: number; loaded: boolean; newAnimal: (typeof ANIMALS)[number] | null }

let state: State = { stars: 0, loaded: false, newAnimal: null }
const listeners = new Set<(s: State) => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l(state))
}

let loading: Promise<void> | null = null
function load() {
  loading ??= getLearner().then((l) => set({ stars: l?.stars ?? 0, loaded: true }))
  return loading
}

export function useStars(): State {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    void load()
    return () => {
      listeners.delete(setS)
    }
  }, [])
  return s
}

/** A right answer: one more star, and a new animal every STARS_PER_ANIMAL. */
export function earnStar() {
  const before = state.stars
  const after = before + 1
  const earned = animalsEarned(after) > animalsEarned(before) ? ANIMALS[animalsEarned(after) - 1] : null
  set({ stars: after, newAnimal: earned ?? state.newAnimal })
  if (earned) setTimeout(() => void speak(earned.name + '!', 0.9), 1800)
  void addStars(1).then((total) => {
    // The server's count wins if another device added stars meanwhile.
    if (total !== null && total > state.stars) set({ stars: total })
  })
}

export function dismissNewAnimal() {
  set({ newAnimal: null })
}
