import { isVerseMarker, stripNikud } from '../data/hebrew'

/** Everything written in a text, verse numbers like [א] included. */
export function tokensOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** Words of a text, as written (punctuation stays attached). Verse numbers are not words. */
export function wordsOf(text: string): string[] {
  return tokensOf(text).filter((w) => !isVerseMarker(w))
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
    let count = 0
    for (const word of tokensOf(line)) {
      current.push(word)
      if (isVerseMarker(word)) continue // carried along, never counted
      count++
      if (END.test(stripNikud(word))) flush(), (count = 0)
      else if (count >= maxWords || (count >= Math.ceil(maxWords / 2) && SOFT.test(word))) flush(), (count = 0)
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
