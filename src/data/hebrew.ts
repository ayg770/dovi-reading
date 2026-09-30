// Static reference data. Mirrors supabase/migrations/*_seed_reference_data.sql
// so the app works offline / before the database answers.

export type Letter = {
  id: number
  key: string
  glyph: string
  name: string
  isFinal: boolean
  /** plosive form with dagesh (בּ כּ פּ תּ) — used when a syllable is shown */
  dagesh?: string
}

export type Nikud = {
  id: number
  key: 'patach' | 'hiriq' | 'kamatz'
  mark: string
  name: string
  /** vowel sound in Ashkenazi pronunciation */
  sound: 'a' | 'i' | 'o'
}

export const LETTERS: Letter[] = [
  { id: 1, key: 'alef', glyph: 'א', name: 'אלף', isFinal: false },
  { id: 2, key: 'bet', glyph: 'ב', name: 'בית', isFinal: false, dagesh: 'בּ' },
  { id: 3, key: 'gimel', glyph: 'ג', name: 'גימל', isFinal: false },
  { id: 4, key: 'dalet', glyph: 'ד', name: 'דלת', isFinal: false },
  { id: 5, key: 'he', glyph: 'ה', name: 'הא', isFinal: false },
  { id: 6, key: 'vav', glyph: 'ו', name: 'וו', isFinal: false },
  { id: 7, key: 'zayin', glyph: 'ז', name: 'זין', isFinal: false },
  { id: 8, key: 'chet', glyph: 'ח', name: 'חית', isFinal: false },
  { id: 9, key: 'tet', glyph: 'ט', name: 'טית', isFinal: false },
  { id: 10, key: 'yud', glyph: 'י', name: 'יוד', isFinal: false },
  { id: 11, key: 'kaf', glyph: 'כ', name: 'כף', isFinal: false, dagesh: 'כּ' },
  { id: 12, key: 'kaf_sofit', glyph: 'ך', name: 'כף סופית', isFinal: true },
  { id: 13, key: 'lamed', glyph: 'ל', name: 'למד', isFinal: false },
  { id: 14, key: 'mem', glyph: 'מ', name: 'מם', isFinal: false },
  { id: 15, key: 'mem_sofit', glyph: 'ם', name: 'מם סופית', isFinal: true },
  { id: 16, key: 'nun', glyph: 'נ', name: 'נון', isFinal: false },
  { id: 17, key: 'nun_sofit', glyph: 'ן', name: 'נון סופית', isFinal: true },
  { id: 18, key: 'samech', glyph: 'ס', name: 'סמך', isFinal: false },
  { id: 19, key: 'ayin', glyph: 'ע', name: 'עין', isFinal: false },
  { id: 20, key: 'pe', glyph: 'פ', name: 'פא', isFinal: false, dagesh: 'פּ' },
  { id: 21, key: 'pe_sofit', glyph: 'ף', name: 'פא סופית', isFinal: true },
  { id: 22, key: 'tsadi', glyph: 'צ', name: 'צדי', isFinal: false },
  { id: 23, key: 'tsadi_sofit', glyph: 'ץ', name: 'צדי סופית', isFinal: true },
  { id: 24, key: 'kuf', glyph: 'ק', name: 'קוף', isFinal: false },
  { id: 25, key: 'resh', glyph: 'ר', name: 'ריש', isFinal: false },
  { id: 26, key: 'shin', glyph: 'ש', name: 'שין', isFinal: false },
  { id: 27, key: 'tav', glyph: 'ת', name: 'תו', isFinal: false, dagesh: 'תּ' },
]

export const NIKUD: Nikud[] = [
  { id: 1, key: 'patach', mark: 'ַ', name: 'פתח', sound: 'a' },
  { id: 2, key: 'hiriq', mark: 'ִ', name: 'חיריק', sound: 'i' },
  { id: 3, key: 'kamatz', mark: 'ָ', name: 'קמץ', sound: 'o' },
]

/** Letters that can open a syllable (no final forms). */
export const SYLLABLE_LETTERS = LETTERS.filter((l) => !l.isFinal)

/** Groups of letters that look alike — used for tricky distractors. */
export const SIMILAR_GROUPS: string[][] = [
  ['ב', 'כ', 'פ'],
  ['ד', 'ר'],
  ['ה', 'ח', 'ת'],
  ['ו', 'ז', 'ן'],
  ['ג', 'נ'],
  ['ס', 'ם', 'ט'],
  ['ע', 'צ'],
  ['י', 'ו'],
]

export type Syllable = { letter: Letter; nikud: Nikud }

/** How the syllable is written on screen: letter (with dagesh where needed) + nikud mark. */
export function syllableText({ letter, nikud }: Syllable): string {
  return (letter.dagesh ?? letter.glyph) + nikud.mark
}

export function syllableKey({ letter, nikud }: Syllable): string {
  return `${letter.key}_${nikud.key}`
}

/**
 * Text handed to the Hebrew speech engine as a fallback when there is no recording.
 * Engines read a lone pointed letter unreliably, so we spell an open syllable with a
 * vowel letter, and spell kamatz with holam so it comes out as Ashkenazi "o".
 */
export function syllableSpeechText({ letter, nikud }: Syllable): string {
  const consonant = letter.dagesh ?? letter.glyph
  switch (nikud.sound) {
    case 'a':
      return consonant + 'ָ' + 'ה'
    case 'i':
      return consonant + 'ִ' + 'י'
    case 'o':
      return consonant + 'וֹ'
  }
}

export function similarLetters(glyph: string): string[] {
  const group = SIMILAR_GROUPS.find((g) => g.includes(glyph))
  return group ? group.filter((g) => g !== glyph) : []
}
