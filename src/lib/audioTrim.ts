// Cut the silence off the start and end of a recording, and store it as a small mono WAV.
// Short clean clips sound better when syllables are joined into a word.

const FRAME_MS = 10
const PAD_MS = 70
const TARGET_RATE = 22050

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** Start and end (in samples) of the sound in `data`, or null if it is all silence. */
export function findSound(data: Float32Array, rate: number): { start: number; end: number } | null {
  const frame = Math.max(1, Math.round((rate * FRAME_MS) / 1000))
  const rms: number[] = []
  for (let i = 0; i + frame <= data.length; i += frame) {
    let sum = 0
    for (let j = 0; j < frame; j++) sum += data[i + j] * data[i + j]
    rms.push(Math.sqrt(sum / frame))
  }
  const peak = Math.max(0, ...rms)
  if (peak < 0.005) return null
  // The noise floor is the quiet end of the clip; sound is clearly above it and near the peak.
  const sorted = [...rms].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0
  const threshold = Math.max(floor * 3, peak * 0.12, 0.004)
  const first = rms.findIndex((r) => r > threshold)
  let last = rms.length - 1
  while (last > first && rms[last] <= threshold) last--
  if (first < 0) return null
  const pad = Math.round((rate * PAD_MS) / 1000)
  return {
    start: Math.max(0, first * frame - pad),
    end: Math.min(data.length, (last + 1) * frame + pad),
  }
}

/** Trimmed WAV of the recording; the original blob if it can't be decoded or is silent. */
export async function trimSilence(blob: Blob): Promise<Blob> {
  try {
    const ctx = new AudioContext()
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    void ctx.close()
    // Mix down to mono at a modest rate.
    const frames = Math.ceil(decoded.duration * TARGET_RATE)
    const offline = new OfflineAudioContext(1, Math.max(1, frames), TARGET_RATE)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    const data = rendered.getChannelData(0)
    const range = findSound(data, TARGET_RATE)
    if (!range) return blob
    return encodeWav(data.slice(range.start, range.end), TARGET_RATE)
  } catch {
    return blob
  }
}
