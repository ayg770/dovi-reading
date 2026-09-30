// Microphone recording with MediaRecorder (Chrome: webm/opus, Safari: mp4/aac).

export const canRecord =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined'

function pickMimeType(): string | undefined {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'])
    if (MediaRecorder.isTypeSupported(t)) return t
  return undefined
}

export type Recording = {
  /** Stop and get the audio. Safe to call more than once. */
  stop: () => Promise<Blob>
}

/** Start recording; stops by itself after maxMs. */
export async function startRecording(maxMs = 5000): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  })
  const mimeType = pickMimeType()
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
    }
  })
  rec.start()
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxMs)

  return {
    stop() {
      clearTimeout(timer)
      if (rec.state !== 'inactive') rec.stop()
      return done
    },
  }
}
