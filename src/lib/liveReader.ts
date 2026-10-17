import { WordSyllable } from '../data/hebrew'
import { heardMatches } from './speech'

/** A word to read: its text and syllables. */
export type ReadUnit = { text: string; syllables: WordSyllable[] }

export type WordState = 'wait' | 'ok' | 'miss'

export type MatcherEvents = {
  /** syllable `si` of word `wi` was said right */
  onSyllable: (wi: number, si: number) => void
  /** a word is finished: said right ('ok') or given up after repeated misses ('miss') */
  onWord: (wi: number, result: WordState, misses: number) => void
  /** something was heard that is not the current word (a quick red flash) */
  onMiss: (wi: number, misses: number) => void
  onDone: () => void
}

/** How many wrong tries a word gets before it is marked red and the reading moves on. */
export const MAX_MISSES = 2

/**
 * Follows a stream of what the speech recognizer hears, word after word, syllable after
 * syllable. A word is done when the whole word is heard, or when all its syllables were heard
 * one by one. Words are never skipped: the reader moves on only after the word turned green,
 * or red after MAX_MISSES wrong tries.
 */
export class LiveMatcher {
  index = 0
  sylDone = 0
  misses = 0
  states: WordState[]
  private finished = false

  /**
   * `used` says how many words of each recognizer result are already taken. It is shared
   * between matchers, so the next line does not take words again that the last line took.
   */
  constructor(
    private units: ReadUnit[],
    private ev: MatcherEvents,
    private used = new Map<number, number>(),
  ) {
    this.states = units.map(() => 'wait')
    if (!units.length) this.finished = true
  }

  get done() {
    return this.finished
  }

  /** What the recognizer delivered (all alternatives of one result). */
  feed(alts: string[], isFinal: boolean, resultIndex: number) {
    if (this.finished) return
    let matched = true
    while (matched && !this.finished) matched = this.consumeOne(alts, resultIndex)
    if (isFinal && !this.finished) {
      const tokens = alts[0].split(/\s+/).filter(Boolean)
      const from = this.used.get(resultIndex) ?? 0
      this.used.set(resultIndex, 9999)
      if (tokens.length > from) this.miss()
    }
  }

  private consumeOne(alts: string[], idx: number): boolean {
    const unit = this.units[this.index]
    const n = unit.syllables.length
    const from = this.used.get(idx) ?? 0
    for (const alt of alts) {
      const tokens = alt.split(/\s+/).filter(Boolean)
      for (let j = from; j < tokens.length; j++) {
        // The whole word, said in one go or split over a few tokens.
        for (let s = from; s <= j && j - s <= n; s++) {
          if (heardMatches([tokens.slice(s, j + 1).join(' ')], unit.syllables)) {
            this.used.set(idx, j + 1)
            this.completeWord('ok')
            return true
          }
        }
        // Or the next syllable on its own (only for words of several syllables).
        if (n > 1 && heardMatches([tokens[j]], [unit.syllables[this.sylDone]])) {
          this.used.set(idx, j + 1)
          this.sylDone++
          this.ev.onSyllable(this.index, this.sylDone - 1)
          if (this.sylDone >= n) this.completeWord('ok')
          return true
        }
      }
    }
    return false
  }

  private miss() {
    this.misses++
    this.ev.onMiss(this.index, this.misses)
    if (this.misses >= MAX_MISSES) this.completeWord('miss')
  }

  private completeWord(result: 'ok' | 'miss') {
    const wi = this.index
    this.states[wi] = result
    this.ev.onWord(wi, result, this.misses)
    this.misses = 0
    this.sylDone = 0
    this.index++
    if (this.index >= this.units.length) {
      this.finished = true
      this.ev.onDone()
    }
  }

  /** A grown-up (or the skip button) settles the current word. */
  settle(result: 'ok' | 'miss') {
    if (!this.finished) this.completeWord(result)
  }
}
