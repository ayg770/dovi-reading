import { stripNikud } from '../data/hebrew'

/** Words of a text, as written (punctuation stays attached). */
export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

const END = /[.!?:;׃]$/
const SOFT = /[,،־]$/

/**
 * Cut a text into short segments for reading practice: first by line, then at
 * sentence ends, and anything longer than `maxWords` at a comma or at the limit.
 */
export function splitSegments(text: string, maxWords = 10): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    let current: string[] = []
    const flush = () => {
      if (current.length) out.push(current.join(' '))
      current = []
    }
    for (const word of wordsOf(line)) {
      current.push(word)
      if (END.test(stripNikud(word))) flush()
      else if (current.length >= maxWords || (current.length >= Math.ceil(maxWords / 2) && SOFT.test(word))) flush()
    }
    flush()
  }
  return out
}

/** Each different word of the text once, in order of appearance, without punctuation. */
export function uniqueWords(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of wordsOf(text)) {
    const word = raw.replace(/^[^א-ת]+|[^א-תְ-ׇ]+$/g, '')
    const key = stripNikud(word)
    if (key.length < 2 || seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}
