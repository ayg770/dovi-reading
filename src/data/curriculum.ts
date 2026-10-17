import { LETTERS, NIKUD, parseText, syllableText } from './hebrew'

// The reading plan: stages, each with units (a list of syllables or words to practice).
// The units are generated here and copied into the user's own groups when they start them
// (so each user can edit their copy). Order follows the one we began with: kamatz, patach, hiriq…

export type UnitKind = 'singles' | 'pairs' | 'triples' | 'words' | 'texts'

export type Unit = {
  /** stable id, kept in the user's group (unit_code) and in the progress table */
  code: string
  stage: number
  kind: UnitKind
  /** for the title: the nikud this unit adds (null for the later stages) */
  nikudId: number | null
  /** the practice items (pointed Hebrew) — empty for texts */
  items: string[]
  /** which part of a split list this is (1, 2, 3…) and how many parts */
  part: number
  parts: number
}

export type Stage = { n: number; key: string; nikudId: number | null; units: Unit[] }

const KAMATZ = 3
const PATACH = 1
const HIRIQ = 2
const TSERE = 5
const SEGOL = 4
const HOLAM = 6
const SHURUK = 8
const KUBUTZ = 7

/** The order the vowels are learned in; each stage adds one to what came before. */
const VOWEL_ORDER = [KAMATZ, PATACH, HIRIQ, TSERE, SEGOL, HOLAM, SHURUK, KUBUTZ]

// The letters, in groups of a few at a time (similar-looking ones kept apart).
const LETTER_GROUPS = [
  ['א', 'ב', 'ד', 'ה', 'י', 'מ', 'ל', 'ש'],
  ['נ', 'ר', 'ת', 'כ', 'ס', 'ח', 'ט', 'ז'],
  ['ג', 'ע', 'פ', 'צ', 'ק', 'ו'],
]
/** A vav next to these vowels is the vowel itself, not a consonant. */
const NO_VAV = new Set([HOLAM, SHURUK, KUBUTZ])

// --- Real words children know -----------------------------------------------------
// Every letter carries a vowel (or is a silent ה/א/י/ו), no sheva: for the first stages.

const REAL_OPEN = [
  // kamatz
  'פָּרָה', 'בָּנָה', 'קָמָה', 'רָאָה', 'לָמָה', 'שָׁנָה', 'מָנָה', 'חָנָה', 'שָׂרָה', 'בָּכָה', 'שָׁתָה', 'בָּאָה',
  'יָפָה', 'כָּלָה', 'קָנָה', 'רָצָה', 'חָלָה', 'הָיָה', 'מָצָא', 'בָּרָא', 'יָצָא', 'קָרָא', 'עָשָׂה', 'דָּגָה',
  // patach + kamatz
  'אַבָּא', 'סַבָּא', 'חַיָּה', 'לַמָּה', 'כַּמָּה', 'חַנָּה',
  // hiriq
  'אִמָּא', 'שִׁירָה', 'דִּינָה', 'רִנָּה', 'בִּינָה', 'מִלָּה', 'נִצָּה', 'פִּינָה', 'חִידָה', 'שִׁירִי', 'מִירִי',
  'פִּיצָה', 'גִּיטָרָה',
  // tsere / segol
  'לֵילָה', 'שֵׁנָה', 'תֵּבָה', 'דֵּעָה', 'אֵימָה', 'אֵיפָה', 'לֵאָה', 'חֵיפָה', 'פֵּאָה', 'שָׂדֶה', 'קוֹמֶה', 'קָפֶה',
  // holam
  'תּוֹרָה', 'מוֹרָה', 'סוֹפָה', 'דּוֹדָה', 'אוֹרָה', 'נוֹרָה', 'קוֹפָה', 'סוֹדִי', 'דּוֹדִי', 'שׁוֹשַׁנָּה', 'תּוֹדָה', 'רוֹפֵא',
  'לִימוֹנָדָה',
  // shuruk
  'שׁוּרָה', 'סוּסָה', 'דּוּבָּה', 'בּוּבָּה', 'סוּכָּה', 'קוּבִּיָּה', 'עוּגָה', 'סוּסִי',
  // kubutz
  'סֻכָּה', 'דֻּבִּי', 'דֻּבָּה', 'גֻּמָּה', 'אֻמָּה', 'בֻּבָּה',
  // mixed
  'בָּנָנָה',
]

/** Words with a sheva or a closing consonant: for the later stages. */
const REAL_CLOSED = [
  'בְּרָכָה', 'מַלְכָּה', 'יַלְדָּה', 'סַבְתָּא', 'גְּלִידָה', 'שֻׁלְחָן', 'שָׁלוֹם', 'מֶלֶךְ', 'יֶלֶד', 'דֶּלֶת',
  'בַּיִת', 'לֶחֶם', 'כַּדּוּר', 'בָּלוֹן', 'מָטוֹס', 'חָתוּל', 'כֶּלֶב', 'סֵפֶר', 'שֶׁמֶשׁ', 'יָרֵחַ',
  'כּוֹכָב', 'מַיִם', 'עֵץ', 'פֶּרַח', 'גֶּשֶׁם', 'שָׁמַיִם', 'תַּפּוּחַ', 'עָנָן', 'חַלּוֹן', 'מַחְשֵׁב',
  'מִטָּה', 'כִּסֵּא', 'שֻׁלְחָן', 'מִכְתָּב', 'יוֹם', 'לַיְלָה', 'בֹּקֶר', 'עֶרֶב', 'מִשְׁפָּחָה', 'חֲבֵרָה',
]

const MARKS: Record<number, string> = Object.fromEntries(NIKUD.map((n) => [n.id, n.mark]))

/** The vowels written in a word (by nikud id), looking at the marks as written. */
export function vowelsIn(word: string): Set<number> {
  const out = new Set<number>()
  const nfd = word.normalize('NFD')
  for (const n of NIKUD) {
    if (n.id === SHURUK) {
      if (/וּ/.test(nfd)) out.add(n.id)
    } else if (nfd.includes(n.mark)) out.add(n.id)
  }
  // a holam on a vav stays a holam; a lone dagesh is not a vowel
  return out
}

/** True when no letter is a bare consonant and there is no sheva: only open syllables. */
export function isOpenWord(word: string): boolean {
  if (word.includes('ְ')) return false
  const units = [...word.normalize('NFD')].reduce<string[]>((acc, c) => {
    if (c >= 'א' && c <= 'ת') acc.push(c)
    else if (acc.length) acc[acc.length - 1] += c
    return acc
  }, [])
  return units.every((u, i) => {
    const hasVowel = /[ֱ-ֻ]/.test(u) || (u[0] === 'ו' && /ּ/.test(u))
    if (hasVowel) return true
    // the silent letters at the end (ה א) and the vav / yud that carry a vowel
    return i > 0 && 'האויע'.includes(u[0]) && !(u[0] === 'ע' && i === units.length - 1)
  })
}

function hash(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

/** A small repeatable random generator, so the plan is the same every time. */
function rng(seed: string) {
  let a = hash(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const letterOf = (glyph: string) => LETTERS.find((l) => l.glyph === glyph)!
const nikudOf = (id: number) => NIKUD.find((n) => n.id === id)!

const syllable = (glyph: string, nikudId: number) => syllableText({ letter: letterOf(glyph), nikud: nikudOf(nikudId) })

function lettersFor(vowels: number[]): string[] {
  const noVav = vowels.some((v) => NO_VAV.has(v))
  return LETTER_GROUPS.flat().filter((g) => !(noVav && g === 'ו'))
}

/**
 * Made-up words of `n` syllables, built from the learned vowels, each using the new vowel at
 * least once. Repeatable: the same unit always gives the same list.
 */
function nonsense(code: string, learned: number[], newVowel: number, n: number, count: number): string[] {
  const rand = rng(code)
  const letters = lettersFor(learned)
  const out: string[] = []
  let guard = 0
  while (out.length < count && guard++ < 2000) {
    const vowels = Array.from({ length: n }, () => (learned.length === 1 ? learned[0] : learned[Math.floor(rand() * learned.length)]))
    if (!vowels.includes(newVowel)) vowels[Math.floor(rand() * n)] = newVowel
    const glyphs: string[] = []
    while (glyphs.length < n) {
      const g = letters[Math.floor(rand() * letters.length)]
      if (!glyphs.includes(g)) glyphs.push(g)
    }
    const word = glyphs.map((g, i) => syllable(g, vowels[i])).join('')
    if (!out.includes(word)) out.push(word)
  }
  return out
}

/** Real words that use only the learned vowels, include the new one, and have `n` syllables. */
function realWords(learned: number[], newVowel: number | null, n: number): string[] {
  return REAL_OPEN.filter((w) => {
    const v = vowelsIn(w)
    if (![...v].every((x) => learned.includes(x))) return false
    if (newVowel !== null && !v.has(newVowel)) return false
    return isOpenWord(w) && parseText(w).length === n
  })
}

/** Mix real words (when there are any) into the made-up ones, so each list has both. */
function mixed(real: string[], fake: string[], total: number): string[] {
  const rand = rng(String(total) + real.join(''))
  const shuffled = real.map((w) => ({ w, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.w)
  const take = shuffled.slice(0, Math.min(shuffled.length, Math.ceil(total / 2)))
  const rest = fake.slice(0, total - take.length)
  const all = [...take, ...rest]
  // spread the real ones among the made-up ones, deterministically
  return all
    .map((w) => ({ w, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.w)
}

function split<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function build(): Stage[] {
  const stages: Stage[] = []
  VOWEL_ORDER.forEach((vowel, si) => {
    const learned = VOWEL_ORDER.slice(0, si + 1)
    const n = si + 1
    const units: Unit[] = []
    // 1. single syllables with the new vowel only
    const letters = LETTER_GROUPS.map((g) => g.filter((x) => !(NO_VAV.has(vowel) && x === 'ו'))).filter((g) => g.length)
    letters.forEach((g, i) =>
      units.push({
        code: `s${n}-1-${i + 1}`,
        stage: n,
        kind: 'singles',
        nikudId: vowel,
        items: g.map((x) => syllable(x, vowel)),
        part: i + 1,
        parts: letters.length,
      }),
    )
    // 2. two syllables, 3. three syllables
    for (const syl of [2, 3]) {
      const code = `s${n}-${syl}`
      const real = realWords(learned, vowel, syl)
      const items = mixed(real, nonsense(code, learned, vowel, syl, syl === 2 ? 14 : 10), syl === 2 ? 14 : 10)
      units.push({ code, stage: n, kind: syl === 2 ? 'pairs' : 'triples', nikudId: vowel, items, part: 1, parts: 1 })
    }
    stages.push({ n, key: nikudOf(vowel).key, nikudId: vowel, units })
  })

  const all = VOWEL_ORDER
  // 9. all the vowels together: made-up and real words, open syllables only
  const mixedUnits: Unit[] = []
  for (const syl of [1, 2, 3]) {
    const code = `s9-${syl}`
    const fake =
      syl === 1
        ? split(
            LETTER_GROUPS.flat()
              .filter((g) => g !== 'ו')
              .flatMap((g, i) => [syllable(g, all[i % all.length]), syllable(g, all[(i + 3) % all.length])]),
            10,
          )[0]
        : nonsense(code, all, all[all.length - 1], syl, 14).map((w) => w)
    const real = syl === 1 ? [] : realWords(all, null, syl)
    mixedUnits.push({ code, stage: 9, kind: syl === 1 ? 'singles' : syl === 2 ? 'pairs' : 'triples', nikudId: null, items: mixed(real, fake, 14), part: 1, parts: 1 })
  }
  stages.push({ n: 9, key: 'mixed', nikudId: null, units: mixedUnits })

  // 10. words with sheva and closing letters
  const closed = [...new Set(REAL_CLOSED)]
  const parts = split(closed, 10)
  stages.push({
    n: 10,
    key: 'closed',
    nikudId: null,
    units: parts.map((items, i) => ({ code: `s10-${i + 1}`, stage: 10, kind: 'words' as const, nikudId: null, items, part: i + 1, parts: parts.length })),
  })

  // 11. texts from the library
  stages.push({
    n: 11,
    key: 'texts',
    nikudId: null,
    units: [{ code: 's11-1', stage: 11, kind: 'texts', nikudId: null, items: [], part: 1, parts: 1 }],
  })
  return stages
}

export const STAGES: Stage[] = build()
export const UNITS: Unit[] = STAGES.flatMap((s) => s.units)
export const unitByCode = (code: string) => UNITS.find((u) => u.code === code)

export const MARK_OF = MARKS
