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
  onresult:
    | ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void)
    | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onaudiostart: (() => void) | null
}

const Recognition: RecognitionCtor | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition)
    : undefined

export const canRecognize = !!Recognition

export type Heard = { alternatives: string[]; error?: string }

export type Listening = {
  result: Promise<Heard>
  /** Stop listening and deliver what was heard so far. */
  stop: () => void
  /** Stop and throw away what was heard. */
  abort: () => void
}

/**
 * Listen until stop() — the button is held for as long as he reads, so the
 * recognizer doesn't cut him off at a pause. `onReady` fires once the mic is live.
 */
export function listen(onReady?: () => void): Listening {
  if (!Recognition)
    return { result: Promise.resolve({ alternatives: [], error: 'unsupported' }), stop() {}, abort() {} }
  const r = new Recognition()
  r.lang = 'he-IL'
  // Short syllables often end before a "final" result; keep interim guesses too.
  r.interimResults = true
  r.maxAlternatives = 5
  r.continuous = true
  const alternatives: string[] = []
  let error: string | undefined
  const result = new Promise<Heard>((resolve) => {
    r.onaudiostart = () => onReady?.()
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
  return { result, stop: () => r.stop(), abort: () => r.abort() }
}

export type StreamState = 'listening' | 'restarting' | 'error'

export type Stream = { stop: () => void }

const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture'])

/**
 * Keep listening for as long as needed: what is heard arrives as it comes (`onHeard`, with
 * the result's index so the same utterance isn't counted twice). The recognizer stops itself
 * after silence or a few minutes, so it is started again each time — except on errors that
 * would only repeat (no permission, no microphone).
 */
export function streamListen(handlers: {
  onHeard: (alternatives: string[], isFinal: boolean, resultIndex: number) => void
  onState: (state: StreamState, error?: string) => void
}): Stream {
  if (!Recognition) {
    handlers.onState('error', 'unsupported')
    return { stop() {} }
  }
  let stopped = false
  let current: InstanceType<RecognitionCtor> | null = null
  let lastError: string | undefined
  let restarts = 0

  const begin = () => {
    if (stopped) return
    const r = new Recognition!()
    current = r
    lastError = undefined
    r.lang = 'he-IL'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 5
    r.onaudiostart = () => {
      restarts = 0
      handlers.onState('listening')
    }
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alts = Array.from(res)
          .map((a) => a.transcript.trim())
          .filter(Boolean)
        if (alts.length) handlers.onHeard(alts, res.isFinal, i)
      }
    }
    r.onerror = (e) => {
      lastError = e.error
    }
    r.onend = () => {
      if (stopped) return
      if (lastError && FATAL.has(lastError)) return handlers.onState('error', lastError)
      if (++restarts > 40) return handlers.onState('error', 'too-many-restarts')
      handlers.onState('restarting')
      window.setTimeout(begin, 250)
    }
    try {
      r.start()
    } catch {
      window.setTimeout(begin, 400)
    }
  }
  begin()
  return {
    stop() {
      stopped = true
      current?.abort()
    },
  }
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
    case 'oy':
      return ['וי', 'ויי', 'ו']
    case 'u':
      return ['ו']
    case 'ey':
      return isLast ? ['יי', 'י', 'אי', 'ה'] : ['יי', 'י', '']
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
      if (ui === 1 && u.glyph === 'ו' && (s.vowel === 'o' || s.vowel === 'oy' || s.vowel === 'u')) return
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

/**
 * Did he read this whole text (a sentence or line)? Each word of the text should be heard,
 * in any spelling that fits its sounds or the plain dictionary spelling; the order is not
 * checked, because the recognizer often drops or merges small words. At least 60% of the
 * words (all of them, up to two) must be found.
 */
export function heardMatchesText(heard: string[], text: string, parse: (word: string) => WordSyllable[]): boolean {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return false
  const need = words.length <= 2 ? words.length : Math.ceil(words.length * 0.6)
  const variants = words.map((w) => {
    const syl = parse(w)
    const plain = normalize(syl.map((s) => s.text).join(''))
    return new Set([...expectedSpellings(syl), plain].filter(Boolean))
  })
  let best = 0
  for (const alt of heard) {
    const pool = alt.split(/\s+/).map(normalize).filter(Boolean)
    let found = 0
    for (const v of variants) {
      const i = pool.findIndex((h) => v.has(h) || [...v].some((t) => t.length >= 4 && oneConsonantSlip(h, t)))
      if (i >= 0) {
        found++
        pool.splice(i, 1)
      }
    }
    best = Math.max(best, found)
  }
  return best >= need
}
