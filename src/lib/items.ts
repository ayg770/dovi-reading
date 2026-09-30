import {
  LETTERS,
  NIKUD,
  SYLLABLE_LETTERS,
  Syllable,
  WordSyllable,
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
    syllables: [{ text, letter_id: s.letter.id, nikud_id: s.nikud.id, vowel: s.nikud.sound }],
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
    syllables: w.syllables,
    audio_path: w.audio_path,
  }))
}

export function randomSyllableItems(count: number): Item[] {
  const items: Item[] = []
  while (items.length < count) {
    const letter = SYLLABLE_LETTERS[Math.floor(Math.random() * SYLLABLE_LETTERS.length)]
    const nikud = NIKUD[Math.floor(Math.random() * NIKUD.length)]
    const item = syllableItem({ letter, nikud })
    if (!items.some((i) => i.key === item.key)) items.push(item)
  }
  return items
}

/** The letter+nikud syllables that appear in a group — the pool for the listening game. */
export function groupSyllables(group: Group): Syllable[] {
  const out: Syllable[] = []
  for (const w of group.words)
    for (const s of w.syllables) {
      const letter = LETTERS.find((l) => l.id === s.letter_id && !l.isFinal)
      const nikud = NIKUD.find((n) => n.id === s.nikud_id)
      if (letter && nikud && !out.some((o) => o.letter.id === letter.id && o.nikud.id === nikud.id))
        out.push({ letter, nikud })
    }
  return out
}
