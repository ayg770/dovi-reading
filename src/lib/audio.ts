import { Letter, Syllable, syllableKey, syllableSpeechText } from '../data/hebrew'

const BASE = import.meta.env.BASE_URL

function audioUrl(path: string): string {
  return BASE + 'audio/' + path.split('/').map(encodeURIComponent).join('/')
}

let current: HTMLAudioElement | null = null

function stop() {
  if (current) {
    current.pause()
    current = null
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

/** Play an mp3; resolves true if it played to the end, false if it could not load. */
function playFile(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(audioUrl(path))
    current = audio
    audio.onended = () => resolve(true)
    audio.onerror = () => resolve(false)
    audio.play().catch(() => resolve(false))
  })
}

function hebrewVoice(): SpeechSynthesisVoice | undefined {
  return window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('he'))
}

export function speak(text: string, rate = 0.7): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'he-IL'
    u.rate = rate
    const voice = hebrewVoice()
    if (voice) u.voice = voice
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

/** Recorded letter name (א.mp3 …), falling back to speech. */
export async function playLetterName(letter: Letter) {
  stop()
  if (!(await playFile(`letters/${letter.glyph}.mp3`))) await speak(letter.name)
}

/** Recorded syllable (syllables/bet_patach.mp3 …), falling back to speech. */
export async function playSyllable(s: Syllable) {
  stop()
  if (!(await playFile(`syllables/${syllableKey(s)}.mp3`))) await speak(syllableSpeechText(s))
}

// Small feedback tones, generated so we need no extra files.
let ctx: AudioContext | null = null
function tone(freqs: number[], dur = 0.12) {
  ctx ??= new AudioContext()
  const t0 = ctx.currentTime
  freqs.forEach((f, i) => {
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.frequency.value = f
    osc.type = 'triangle'
    gain.gain.setValueAtTime(0.25, t0 + i * dur)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + (i + 1) * dur)
    osc.connect(gain).connect(ctx!.destination)
    osc.start(t0 + i * dur)
    osc.stop(t0 + (i + 1) * dur)
  })
}
export const sfx = {
  correct: () => tone([660, 880, 1320]),
  wrong: () => tone([300, 220], 0.18),
  finish: () => tone([523, 659, 784, 1047, 1319], 0.14),
}

// Voices load asynchronously in Chrome.
if ('speechSynthesis' in window) window.speechSynthesis.getVoices()
