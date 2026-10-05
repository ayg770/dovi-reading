import { WordSyllable, parseWord, stripNikud } from '../data/hebrew'
import { getLearnerId, supabase } from './supabase'
import { wordsOf } from './texts'

// Continuous reading (RSVP): the words appear one after another in the same place.

export const MIN_WPM = 10
export const MAX_WPM = 600

/** Slider position 0..100 → words per minute, on a log scale so slow paces get room too. */
export function wpmFromSlider(p: number): number {
  const raw = MIN_WPM * Math.pow(MAX_WPM / MIN_WPM, p / 100)
  const step = raw < 40 ? 1 : raw < 150 ? 5 : 10
  return Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(raw / step) * step))
}
export function sliderFromWpm(w: number): number {
  return (Math.log(Math.min(MAX_WPM, Math.max(MIN_WPM, w)) / MIN_WPM) / Math.log(MAX_WPM / MIN_WPM)) * 100
}

export type Chunk = 1 | 2 | 3 | 'syl'

export type Frame = {
  /** the words (or syllables) shown together */
  parts: { text: string; syllables: WordSyllable[] }[]
  /** share of one word's time this frame stays (1 per word; a syllable gets its share) */
  weight: number
  /** index of the first word of the text this frame belongs to */
  word: number
  /** extra pause after the frame, in words' time (commas, full stops) */
  pause: number
}

const END = /[.!?:;׃]$/
const SOFT = /[,،־]$/

function pauseAfter(word: string): number {
  const plain = stripNikud(word)
  return END.test(plain) ? 1.2 : SOFT.test(plain) ? 0.5 : 0
}

export function textWords(lines: string[]): string[] {
  return lines.flatMap((l) => wordsOf(l))
}

/** Cut the words into what is shown at each moment. */
export function buildFrames(words: string[], chunk: Chunk, showNikud: boolean): Frame[] {
  const clean = (w: string) => (showNikud ? w : stripNikud(w))
  const syl = (w: string) => (showNikud ? parseWord(w) : [])
  if (chunk === 'syl') {
    return words.flatMap((w, i) => {
      const parts = showNikud ? parseWord(w) : []
      if (parts.length < 2) return [{ parts: [{ text: clean(w), syllables: parts }], weight: 1, word: i, pause: pauseAfter(w) }]
      return parts.map((p, k) => ({
        parts: [{ text: p.text, syllables: [p] }],
        weight: 1 / parts.length,
        word: i,
        pause: k === parts.length - 1 ? pauseAfter(w) : 0,
      }))
    })
  }
  const out: Frame[] = []
  for (let i = 0; i < words.length; ) {
    const group: string[] = []
    let pause = 0
    while (group.length < chunk && i < words.length) {
      group.push(words[i])
      pause = pauseAfter(words[i])
      i++
      if (pause > 0) break // never run a chunk across a comma or full stop
    }
    out.push({ parts: group.map((w) => ({ text: clean(w), syllables: syl(w) })), weight: group.length, word: i - group.length, pause })
  }
  return out
}

/** Which letter (cluster) to color as the point of focus, counted from the start of the word. */
export function focalIndex(consonants: number): number {
  return consonants <= 1 ? 0 : consonants <= 5 ? 1 : consonants <= 9 ? 2 : 3
}

/** Splits a word into letters, each with its nikud marks; returns the pieces and the focal one. */
export function letterClusters(word: string): { pieces: string[]; focal: number } {
  const pieces: string[] = []
  for (const c of [...word.normalize('NFC')]) {
    const isLetter = /[א-ת]/.test(c)
    if (isLetter || !pieces.length) pieces.push(c)
    else pieces[pieces.length - 1] += c
  }
  const idx = pieces.map((p, i) => (/[א-ת]/.test(p) ? i : -1)).filter((i) => i >= 0)
  return { pieces, focal: idx.length ? idx[focalIndex(idx.length)] : -1 }
}

// ---- what the user felt, remembered per user (in game_sessions.details) ----

export type Feeling = 1 | 2 | 3 // hard · ok · easy
export type Success = 1 | 2 | 3 // a little · most · all

export type RsvpRecord = {
  textId: string
  wpm: number
  feeling: Feeling | null
  success: Success | null
  /** the user asked to keep this text and pace for next time */
  saved: boolean
}

/** A pace "worked" when most of it was understood and it did not feel hard. */
export const wentWell = (r: RsvpRecord) => r.saved && (r.success ?? 0) >= 2 && (r.feeling ?? 0) >= 2

export async function loadRsvpHistory(): Promise<RsvpRecord[]> {
  const userId = await getLearnerId()
  if (!supabase || !userId) return []
  const { data } = await supabase
    .from('game_sessions')
    .select('details')
    .eq('user_id', userId)
    .eq('game_type', 'rsvp')
    .order('started_at', { ascending: false })
    .limit(60)
  return (data ?? []).map((r) => (Array.isArray(r.details) ? (r.details[0] as RsvpRecord) : null)).filter((r): r is RsvpRecord => !!r && typeof r.wpm === 'number')
}

/** Where to start next time: the last saved pace that went well for this text, else the last saved one. */
export function rememberedPace(history: RsvpRecord[], textId: string): { wpm: number; ok: boolean } | null {
  const mine = history.filter((r) => r.textId === textId && r.saved)
  const good = mine.find(wentWell)
  if (good) return { wpm: good.wpm, ok: true }
  const any = mine[0] ?? history.find((r) => r.saved)
  return any ? { wpm: any.wpm, ok: wentWell(any) } : null
}
