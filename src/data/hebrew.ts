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

// ---------------------------------------------------------------------------
// Words: parsing pointed text into syllables

export type Vowel = 'a' | 'i' | 'o' | 'e' | 'u' | ''

/** A syllable inside a word, as stored in words.syllables. */
export type WordSyllable = {
  /** the syllable as written, including any closing consonant, e.g. 'בַּת' */
  text: string
  letter_id: number | null
  /** set only for the nikud the app knows (patach/hiriq/kamatz) */
  nikud_id: number | null
  /** Ashkenazi vowel sound */
  vowel: Vowel
}

const DAGESH = 'ּ'
const SHIN_DOT = 'ׁ'
const SIN_DOT = 'ׂ'
const SHEVA = 'ְ'
const HOLAM = 'ֹ'
const HOLAM_HASER_VAV = 'ֺ'

/** Ashkenazi sound of every vowel mark (sheva counts as no vowel). */
const VOWEL_OF_MARK: Record<string, Vowel> = {
  'ֱ': 'e', // hataf segol
  'ֲ': 'a', // hataf patach
  'ֳ': 'o', // hataf kamatz
  'ִ': 'i', // hiriq
  'ֵ': 'e', // tsere
  'ֶ': 'e', // segol
  'ַ': 'a', // patach
  'ָ': 'o', // kamatz (Ashkenazi)
  'ֹ': 'o', // holam
  'ֺ': 'o',
  'ֻ': 'u', // kubutz
}

export const NIKUD_KEYBOARD: { mark: string; name: string }[] = [
  { mark: 'ַ', name: 'פתח' },
  { mark: 'ָ', name: 'קמץ' },
  { mark: 'ִ', name: 'חיריק' },
  { mark: 'ֶ', name: 'סגול' },
  { mark: 'ֵ', name: 'צירה' },
  { mark: HOLAM, name: 'חולם' },
  { mark: 'ֻ', name: 'קובוץ' },
  { mark: SHEVA, name: 'שווא' },
  { mark: DAGESH, name: 'דגש' },
  { mark: SHIN_DOT, name: 'שׁ' },
  { mark: SIN_DOT, name: 'שׂ' },
]

type Unit = { glyph: string; marks: string }

const isLetter = (c: string) => c >= 'א' && c <= 'ת'
const isMark = (c: string) => c >= '֑' && c <= 'ׇ'

function toUnits(text: string): Unit[] {
  const units: Unit[] = []
  for (const c of text.normalize('NFD')) {
    if (isLetter(c)) units.push({ glyph: c, marks: '' })
    else if (isMark(c) && units.length) units[units.length - 1].marks += c
  }
  return units
}

function vowelOf(u: Unit): Vowel {
  for (const m of u.marks) if (VOWEL_OF_MARK[m]) return VOWEL_OF_MARK[m]
  return ''
}

/**
 * Split a pointed word into syllables. A letter with a vowel opens a syllable;
 * letters without one (or with sheva) close the syllable before them. וֹ and וּ
 * right after a letter with no vowel are that letter's vowel (holam male, shuruk).
 */
export function parseWord(text: string): WordSyllable[] {
  const units = toUnits(text)
  const out: (WordSyllable & { units: Unit[] })[] = []
  units.forEach((u, i) => {
    const prev = out[out.length - 1]
    const prevUnit = units[i - 1]
    const isVavVowel =
      u.glyph === 'ו' &&
      (u.marks === DAGESH || u.marks === HOLAM || u.marks === HOLAM_HASER_VAV) &&
      prev &&
      prevUnit &&
      vowelOf(prevUnit) === '' &&
      !prevUnit.marks.includes(SHEVA) &&
      prev.units[prev.units.length - 1] === prevUnit
    if (isVavVowel) {
      const vowel: Vowel = u.marks === DAGESH ? 'u' : 'o'
      if (prev.units.length === 1) {
        prev.vowel = vowel
        prev.units.push(u)
      } else {
        // The letter before was taken as a closing consonant; it actually opens this syllable.
        prev.units.pop()
        out.push({
          text: '',
          letter_id: LETTERS.find((l) => l.glyph === prevUnit.glyph)?.id ?? null,
          nikud_id: null,
          vowel,
          units: [prevUnit, u],
        })
      }
      return
    }
    // A word-initial וּ is the vowel u on its own.
    const vowel = !prev && u.glyph === 'ו' && u.marks === DAGESH ? 'u' : vowelOf(u)
    if (vowel || !prev) {
      const letter = LETTERS.find((l) => l.glyph === u.glyph)
      const nikud = NIKUD.find((n) => u.marks.includes(n.mark))
      out.push({
        text: '',
        letter_id: letter?.id ?? null,
        nikud_id: nikud?.id ?? null,
        vowel,
        units: [u],
      })
    } else {
      prev.units.push(u)
    }
  })
  return out.map(({ units: us, ...s }) => ({
    ...s,
    text: us.map((u) => u.glyph + u.marks).join('').normalize('NFC'),
  }))
}

export function stripNikud(text: string): string {
  return [...text.normalize('NFD')].filter((c) => !isMark(c)).join('')
}

export function hasNikud(text: string): boolean {
  return [...text.normalize('NFD')].some((c) => VOWEL_OF_MARK[c] || c === SHEVA)
}

/**
 * Text for the Hebrew speech engine, adjusted to Ashkenazi pronunciation:
 * kamatz is spelled as holam, and ת without dagesh as ס.
 */
export function wordSpeechText(text: string): string {
  const units = toUnits(text)
  if (units.length === 1) {
    const letter = LETTERS.find((l) => l.glyph === units[0].glyph)
    const vowel = vowelOf(units[0])
    const nikud = NIKUD.find((n) => n.sound === vowel)
    if (letter && nikud) return syllableSpeechText({ letter, nikud })
  }
  return units
    .map((u) => {
      const glyph = u.glyph === 'ת' && !u.marks.includes(DAGESH) ? 'ס' : u.glyph
      if (u.marks.includes('ָ')) return glyph + u.marks.replace('ָ', '') + 'וֹ'
      return glyph + u.marks
    })
    .join('')
}

/** Separated view for the parent: 'בָּ·בָּה' */
export function syllablesPreview(syllables: WordSyllable[]): string {
  return syllables.map((s) => s.text).join('·')
}
