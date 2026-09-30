import { LETTERS, NIKUD, SYLLABLE_LETTERS, Syllable, similarLetters } from '../data/hebrew'
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
function weightedAnswer(progress: ProgressRow[], recent: Syllable[]): Syllable {
  const pool: { s: Syllable; w: number }[] = []
  for (const letter of SYLLABLE_LETTERS) {
    for (const nikud of NIKUD) {
      const s = { letter, nikud }
      if (recent.some((r) => same(r, s))) continue
      const row = progress.find((p) => p.letter_id === letter.id && p.nikud_id === nikud.id)
      const w = !row || row.attempts === 0 ? 3 : 1 + (1 - row.correct / row.attempts) * 4
      pool.push({ s, w })
    }
  }
  let r = Math.random() * pool.reduce((sum, p) => sum + p.w, 0)
  for (const p of pool) {
    r -= p.w
    if (r <= 0) return p.s
  }
  return pool[pool.length - 1].s
}

/**
 * Three choices: the answer, the same letter with another nikud (tests the vowel),
 * and a look-alike letter with the same nikud (tests the letter).
 */
export function makeQuestion(progress: ProgressRow[], recent: Syllable[]): Question {
  const answer = weightedAnswer(progress, recent)
  const otherNikud = pick(NIKUD.filter((n) => n.id !== answer.nikud.id))
  const lookAlikes = similarLetters(answer.letter.glyph)
    .map((g) => LETTERS.find((l) => l.glyph === g)!)
    .filter((l) => !l.isFinal)
  const otherLetter = lookAlikes.length
    ? pick(lookAlikes)
    : pick(SYLLABLE_LETTERS.filter((l) => l.id !== answer.letter.id))

  const choices: Syllable[] = [
    answer,
    { letter: answer.letter, nikud: otherNikud },
    { letter: otherLetter, nikud: Math.random() < 0.5 ? answer.nikud : otherNikud },
  ]
  // The third choice could collide with the second; replace it if so.
  if (same(choices[1], choices[2])) choices[2] = { letter: otherLetter, nikud: answer.nikud }
  return { answer, choices: shuffle(choices) }
}
