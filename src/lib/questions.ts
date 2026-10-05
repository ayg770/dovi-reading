import { LETTERS, Letter, NIKUD, SYLLABLE_LETTERS, Syllable, nikudVowel, similarLetters } from '../data/hebrew'
import type { Item } from './items'
import type { ProgressRow } from './supabase'

export type Question = { answer: Syllable; choices: Syllable[] }

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const same = (a: Syllable, b: Syllable) => a.letter.id === b.letter.id && a.nikud.id === b.nikud.id

/**
 * Weight each syllable by how shaky it is: unseen = 3, then 1 + error rate * 4.
 * Syllables Dovi keeps missing come up more often.
 */
function weightedAnswer(progress: ProgressRow[], recent: Syllable[], from: Syllable[]): Syllable {
  const pool: { s: Syllable; w: number }[] = []
  // With a small pool, only avoid the very last one.
  const avoid = from.length > recent.length + 1 ? recent : recent.slice(0, from.length > 1 ? 1 : 0)
  for (const s of from) {
    if (avoid.some((r) => same(r, s))) continue
    const row = progress.find((p) => p.letter_id === s.letter.id && p.nikud_id === s.nikud.id)
    const w = !row || row.attempts === 0 ? 3 : 1 + (1 - row.correct / row.attempts) * 4
    pool.push({ s, w })
  }
  let r = Math.random() * pool.reduce((sum, p) => sum + p.w, 0)
  for (const p of pool) {
    r -= p.w
    if (r <= 0) return p.s
  }
  return pool[pool.length - 1].s
}

const ALL_SYLLABLES: Syllable[] = SYLLABLE_LETTERS.flatMap((letter) =>
  NIKUD.map((nikud) => ({ letter, nikud })),
)

/** Every syllable with one of the given nikud. */
export function syllablesWith(nikudIds: number[]): Syllable[] {
  return ALL_SYLLABLES.filter((s) => nikudIds.includes(s.nikud.id))
}

function otherLetterFor(answer: Syllable, not: number[]): Letter {
  const lookAlikes = similarLetters(answer.letter.glyph)
    .map((g) => LETTERS.find((l) => l.glyph === g)!)
    .filter((l) => !l.isFinal && !not.includes(l.id))
  return lookAlikes.length
    ? pick(lookAlikes)
    : pick(SYLLABLE_LETTERS.filter((l) => !not.includes(l.id)))
}

/**
 * Three choices: the answer, the same letter with another nikud (tests the vowel),
 * and a look-alike letter (tests the letter). Distractor nikud come from `nikudIds`;
 * with a single nikud chosen, both distractors are other letters with that nikud.
 */
export function makeQuestion(
  progress: ProgressRow[],
  recent: Syllable[],
  nikudIds: number[],
): Question {
  const answer = weightedAnswer(progress, recent, syllablesWith(nikudIds))
  // Only nikud that sound different (in regular pronunciation kamatz and patach are both "a").
  const otherNikuds = NIKUD.filter(
    (n) => nikudIds.includes(n.id) && nikudVowel(n) !== nikudVowel(answer.nikud),
  )

  if (!otherNikuds.length) {
    const first = otherLetterFor(answer, [answer.letter.id])
    const second = otherLetterFor(answer, [answer.letter.id, first.id])
    return {
      answer,
      choices: shuffle([answer, { letter: first, nikud: answer.nikud }, { letter: second, nikud: answer.nikud }]),
    }
  }

  const otherNikud = pick(otherNikuds)
  const otherLetter = otherLetterFor(answer, [answer.letter.id])
  const choices: Syllable[] = [
    answer,
    { letter: answer.letter, nikud: otherNikud },
    { letter: otherLetter, nikud: Math.random() < 0.5 ? answer.nikud : otherNikud },
  ]
  // The third choice could collide with the second; replace it if so.
  if (same(choices[1], choices[2])) choices[2] = { letter: otherLetter, nikud: answer.nikud }
  return { answer, choices: shuffle(choices) }
}

/**
 * Word round: the answer and the two most similar other words of the group
 * (same number of syllables, most syllables in common), so he has to really read.
 */
export function makeWordQuestion(answer: Item, group: Item[]): { answer: Item; choices: Item[] } {
  const scored = group
    .filter((w) => w.key !== answer.key && w.text !== answer.text)
    .map((w) => {
      let score = w.syllables.length === answer.syllables.length ? 3 : 0
      w.syllables.forEach((s, i) => {
        const a = answer.syllables[i]
        if (!a) return
        if (s.text === a.text) score += 2
        else if (s.letter_id === a.letter_id || s.vowel === a.vowel) score += 1
      })
      return { w, score: score + Math.random() * 1.5 }
    })
    .sort((x, y) => y.score - x.score)
  return { answer, choices: shuffle([answer, ...scored.slice(0, 2).map((x) => x.w)]) }
}
