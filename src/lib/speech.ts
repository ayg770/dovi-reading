import type { WordSyllable } from '../data/hebrew'

// Speech recognition (Chrome / Edge / Android) and a lenient comparison of what the
// recognizer wrote (modern Hebrew, no nikud) with the syllables Dovi was asked to read.

type RecognitionCtor = new () => {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const Recognition: RecognitionCtor | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition)
    : undefined

export const canRecognize = !!Recognition

export type Heard = { alternatives: string[]; error?: string }

export type Listening = { result: Promise<Heard>; stop: () => void }

/** Listen once; the recognizer stops by itself after a pause. */
export function listen(): Listening {
  if (!Recognition) return { result: Promise.resolve({ alternatives: [], error: 'unsupported' }), stop() {} }
  const r = new Recognition()
  r.lang = 'he-IL'
  // Short syllables often end before a "final" result; keep interim guesses too.
  r.interimResults = true
  r.maxAlternatives = 5
  r.continuous = false
  const alternatives: string[] = []
  let error: string | undefined
  const result = new Promise<Heard>((resolve) => {
    r.onresult = (e) => {
      for (const res of Array.from(e.results))
        for (const alt of Array.from(res)) {
          const t = alt.transcript.trim()
          if (t && !alternatives.includes(t)) alternatives.push(t)
        }
    }
    r.onerror = (e) => {
      error = e.error
    }
    r.onend = () => resolve({ alternatives, error })
  })
  r.start()
  return { result, stop: () => r.stop() }
}

// ---------------------------------------------------------------------------
// Matching

const FINAL_TO_BASE: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

function normalize(text: string): string {
  return [...text.normalize('NFD')]
    .filter((c) => c >= 'א' && c <= 'ת')
    .map((c) => FINAL_TO_BASE[c] ?? c)
    .join('')
}

/** How the recognizer might spell each consonant sound. */
function consonantSpellings(glyph: string, marks: string): string[] {
  const g = FINAL_TO_BASE[glyph] ?? glyph
  const dagesh = marks.includes('ּ')
  switch (g) {
    case 'ב':
      return dagesh ? ['ב'] : ['ב', 'ו']
    case 'כ':
      return dagesh ? ['כ', 'ק'] : ['כ', 'ח']
    case 'ק':
      return ['ק', 'כ']
    case 'ח':
      return ['ח', 'כ']
    case 'פ':
      return ['פ']
    case 'ת':
      return dagesh ? ['ת', 'ט'] : ['ת', 'ס', 'ט'] // Ashkenazi: ת without dagesh sounds s
    case 'ט':
      return ['ט', 'ת']
    case 'ס':
      return ['ס', 'ש']
    case 'ש':
      return marks.includes('ׂ') ? ['ש', 'ס'] : ['ש']
    case 'א':
    case 'ע':
      return ['א', 'ע', 'ה', '']
    case 'ה':
      return ['ה', 'א', '']
    case 'ו':
      return ['ו', 'ב']
    default:
      return [g]
  }
}

function vowelSpellings(vowel: WordSyllable['vowel'], isLast: boolean): string[] {
  switch (vowel) {
    case 'a':
      return isLast ? ['א', 'ה', ''] : ['', 'א']
    case 'i':
      return ['י', '']
    case 'o':
      return isLast ? ['ו', 'וא', 'ה'] : ['ו']
    case 'u':
      return ['ו']
    case 'e':
      return isLast ? ['ה', 'י', ''] : ['', 'י']
    default:
      return ['']
  }
}

const MAX_VARIANTS = 400

function product(options: string[][]): string[] {
  let acc = ['']
  for (const opts of options) {
    const next: string[] = []
    for (const a of acc) for (const o of opts) if (next.length < MAX_VARIANTS) next.push(a + o)
    acc = next
  }
  return [...new Set(acc)]
}

/** Every plausible unpointed spelling of the expected syllables. */
export function expectedSpellings(syllables: WordSyllable[]): string[] {
  const parts: string[][] = []
  syllables.forEach((s, si) => {
    const units = [...s.text.normalize('NFD')].reduce<{ glyph: string; marks: string }[]>((acc, c) => {
      if (c >= 'א' && c <= 'ת') acc.push({ glyph: c, marks: '' })
      else if (acc.length) acc[acc.length - 1].marks += c
      return acc
    }, [])
    const isLastSyllable = si === syllables.length - 1
    units.forEach((u, ui) => {
      // A vav that carries the vowel (וֹ / וּ) is spelled by the vowel itself.
      if (ui === 1 && u.glyph === 'ו' && (s.vowel === 'o' || s.vowel === 'u')) return
      parts.push(consonantSpellings(u.glyph, u.marks))
      if (ui === 0) parts.push(vowelSpellings(s.vowel, isLastSyllable && units.length === 1))
    })
  })
  return product(parts).map(normalize).filter(Boolean)
}

/** Vowel letters carry the nikud sound (ו = o/u, י = i …), so a slip there is not forgiven. */
const VOWEL_LETTERS = new Set(['ו', 'י', 'א', 'ה', 'ע'])

/** Same length, exactly one different letter, and both letters are consonants. */
function oneConsonantSlip(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diffs = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    if (++diffs > 1 || VOWEL_LETTERS.has(a[i]) || VOWEL_LETTERS.has(b[i])) return false
  }
  return diffs === 1
}

/**
 * Does any recognizer alternative sound like the target? A child may repeat
 * the syllable ("בו בו"), so it is enough for a word of what he said to match, or
 * for everything he said to match with spaces removed. Spellings of 4+ letters forgive one
 * misheard consonant (never a vowel letter — that is what tells kamatz from patach).
 */
export function heardMatches(heard: string[], syllables: WordSyllable[]): boolean {
  // The recognizer writes real words in their dictionary spelling whatever the accent
  // ("שלום" for sholom), so the word's own spelling without nikud counts too.
  const plain = normalize(syllables.map((s) => s.text).join(''))
  const targets = [...expectedSpellings(syllables), plain]
  for (const alt of heard) {
    const candidates = [normalize(alt), ...alt.split(/\s+/).map(normalize)].filter(Boolean)
    for (const c of candidates)
      for (const t of targets) if (c === t || (t.length >= 4 && oneConsonantSlip(c, t))) return true
  }
  return false
}
