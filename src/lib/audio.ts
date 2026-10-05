import {
  Letter,
  Syllable,
  WordSyllable,
  asOpenSyllable,
  syllableKey,
  syllableSpeechText,
  wordSpeechText,
} from '../data/hebrew'
import { praiseUrls, recordedSyllableUrl, storageUrl } from './content'
import { speechLang, praiseWords } from './i18n'
import { Item, asSyllable } from './items'

const BASE = import.meta.env.BASE_URL

function staticUrl(path: string): string {
  return BASE + 'audio/' + path.split('/').map(encodeURIComponent).join('/')
}

let current: HTMLAudioElement | null = null

let gradualToken = 0

export function stopAudio() {
  gradualToken++
  if (current) {
    current.pause()
    current = null
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

/** Play a URL; resolves true if it played to the end, false if it could not load. */
export function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    current = audio
    audio.onended = () => resolve(true)
    audio.onerror = () => resolve(false)
    audio.play().catch(() => resolve(false))
  })
}

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const prefix = lang.slice(0, 2).toLowerCase()
  return window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(prefix))
}

/** Say an instruction or cheer in the interface language. */
export function speakUi(text: string, rate = 0.9): Promise<void> {
  return speak(text, rate, speechLang())
}

/** Say text with the speech engine; `lang` is he-IL for the Hebrew learning content. */
export function speak(text: string, rate = 0.7, lang = 'he-IL'): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = rate
    const voice = voiceFor(lang)
    if (voice) u.voice = voice
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

/** Recorded letter name (א.mp3 …), falling back to speech. */
export async function playLetterName(letter: Letter) {
  stopAudio()
  if (!(await playUrl(staticUrl(`letters/${letter.glyph}.mp3`)))) await speak(letter.name)
}

/** Syllable: recording from the settings → file in public/audio/syllables → speech. */
export async function playSyllable(s: Syllable) {
  stopAudio()
  const recorded = recordedSyllableUrl(s.letter.id, s.nikud.id)
  if (recorded && (await playUrl(recorded))) return
  if (await playUrl(staticUrl(`syllables/${syllableKey(s)}.mp3`))) return
  await speak(syllableSpeechText(s))
}

/** A single syllable (consonant + vowel) that has a recording. */
function syllableRecording(s: WordSyllable): string | null {
  const open = asOpenSyllable(s)
  return open ? recordedSyllableUrl(open.letter.id, open.nikud.id) : null
}

export type Playable = { text: string; syllables: WordSyllable[]; audio_path?: string | null }

/**
 * A word (or single syllable) from a group:
 * the word's own recording → the syllable recordings one after another → speech.
 */
export async function playWord(w: Playable) {
  stopAudio()
  if (w.audio_path && (await playUrl(storageUrl(w.audio_path)))) return
  const parts = w.syllables.map(syllableRecording)
  if (parts.length && parts.every(Boolean)) {
    for (const url of parts) if (!(await playUrl(url!))) break
    return
  }
  await speak(wordSpeechText(w.text))
}

// ---------------------------------------------------------------------------
// Feedback sounds, synthesized so they need no files: soft bells and gentle bloops.

let ctx: AudioContext | null = null
function audioCtx(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** A bell-like note: a sine with two quieter overtones and a soft decay. */
function bell(freq: number, at: number, dur = 0.6, vol = 0.18) {
  const c = audioCtx()
  const t = c.currentTime + at
  const out = c.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  out.connect(c.destination)
  for (const [mult, level] of [
    [1, 1],
    [2, 0.35],
    [3.01, 0.12],
  ]) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * mult
    g.gain.value = level
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + dur)
  }
}

/** A round "bloop" that slides in pitch — friendly, not a buzzer. */
function bloop(from: number, to: number, at: number, dur = 0.22, vol = 0.2) {
  const c = audioCtx()
  const t = c.currentTime + at
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur)
}

/** Tiny high twinkles after a win. */
function sparkle(at: number, count = 6) {
  for (let i = 0; i < count; i++) {
    const f = 2000 + Math.random() * 2200
    bell(f, at + i * 0.05 + Math.random() * 0.03, 0.25, 0.04)
  }
}

export const sfx = {
  correct() {
    bell(784, 0) // G5
    bell(988, 0.09) // B5
    bell(1319, 0.18, 0.9) // E6
    sparkle(0.3)
  },
  wrong() {
    bloop(420, 300, 0)
    bloop(330, 240, 0.2, 0.28)
  },
  tap() {
    bloop(600, 900, 0, 0.08, 0.08)
  },
  start() {
    bloop(300, 700, 0, 0.18, 0.15)
  },
  finish() {
    const notes = [523, 659, 784, 1047] // C E G C
    notes.forEach((f, i) => bell(f, i * 0.12, 0.5))
    ;[1047, 1319, 1568].forEach((f) => bell(f, 0.55, 1.4, 0.12))
    sparkle(0.7, 12)
  },
}


/** Praise out loud: a clip recorded in the settings, or the speech engine. */
export async function praise(chance = 1) {
  if (Math.random() > chance) return
  const clips = praiseUrls()
  if (clips.length && (await playUrl(clips[Math.floor(Math.random() * clips.length)]))) return
  const words = praiseWords()
  await speakUi(words[Math.floor(Math.random() * words.length)], 1)
}

// Voices load asynchronously in Chrome.
if ('speechSynthesis' in window) window.speechSynthesis.getVoices()

/** Any game item: a single syllable uses the syllable recordings, anything longer is a word. */
export async function playItem(item: Item) {
  const s = asSyllable(item)
  if (s) return playSyllable(s)
  return playWord(item)
}

/** One syllable of a word: its recording if there is one, else the speech engine. */
export async function playWordSyllable(ws: WordSyllable) {
  const url = syllableRecording(ws)
  if (url && (await playUrl(url))) return
  await speak(wordSpeechText(ws.text), 0.6)
}

/**
 * Read a word slowly, syllable by syllable: `onStep` is told which syllable is being
 * said (and null at the end), so the screen can light it up. Any stopAudio() cancels.
 */
export async function playGradual(syllables: WordSyllable[], onStep: (i: number | null) => void) {
  stopAudio()
  const mine = gradualToken
  for (let i = 0; i < syllables.length; i++) {
    if (mine !== gradualToken) return
    onStep(i)
    await playWordSyllable(syllables[i])
    await new Promise((r) => setTimeout(r, 160))
  }
  if (mine === gradualToken) onStep(null)
}
