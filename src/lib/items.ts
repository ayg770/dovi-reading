import {
  NIKUD,
  SYLLABLE_LETTERS,
  Syllable,
  WordSyllable,
  asOpenSyllable,
  nikudVowel,
  parseText,
  syllableText,
} from '../data/hebrew'
import { findGroup } from './content'
import type { Content, Group, Learner } from './supabase'

/** Something Dovi reads or hears: a word from a group, or a single syllable. */
export type Item = {
  key: string
  text: string
  syllables: WordSyllable[]
  audio_path?: string | null
}

export function syllableItem(s: Syllable): Item {
  const text = syllableText(s)
  return {
    key: `${s.letter.id}_${s.nikud.id}`,
    text,
    syllables: [{ text, letter_id: s.letter.id, nikud_id: s.nikud.id, vowel: nikudVowel(s.nikud) }],
  }
}

/** The group the games use: the one set for Dovi, else the first one. */
export function activeGroup(content: Content, learner: Learner | null): Group | null {
  const withWords = content.groups.filter((g) => g.words.length)
  return findGroup(withWords, learner?.current_group_id) ?? withWords[0] ?? null
}

export function groupItems(group: Group): Item[] {
  return group.words.map((w) => ({
    key: w.id,
    text: w.text,
    // From the text, in this user's pronunciation (the stored copy may be another's).
    syllables: parseText(w.text),
    audio_path: w.audio_path,
  }))
}

export function randomSyllableItems(count: number, nikudIds: number[] = NIKUD.map((n) => n.id)): Item[] {
  const nikuds = NIKUD.filter((n) => nikudIds.includes(n.id))
  const items: Item[] = []
  while (items.length < count) {
    const letter = SYLLABLE_LETTERS[Math.floor(Math.random() * SYLLABLE_LETTERS.length)]
    const nikud = nikuds[Math.floor(Math.random() * nikuds.length)]
    const item = syllableItem({ letter, nikud })
    if (!items.some((i) => i.key === item.key)) items.push(item)
  }
  return items
}

/** The letter+nikud of a one-syllable item, so it can use syllable recordings and the letter hint. */
export function asSyllable(item: Item): Syllable | null {
  return item.syllables.length === 1 ? asOpenSyllable(item.syllables[0]) : null
}
