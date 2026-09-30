import { useEffect, useRef, useState } from 'react'
import { playUrl, stopAudio } from '../../lib/audio'
import { Recording, canRecord, startRecording } from '../../lib/recorder'

type Props = {
  /** URL of the saved recording, if any */
  existingUrl?: string | null
  onSave: (blob: Blob) => Promise<void>
  onDelete?: () => Promise<void>
  maxMs?: number
}

type State = 'idle' | 'recording' | 'preview' | 'saving'

/** Record → listen → save (or upload a file). Used across the settings. */
export function RecordButton({ existingUrl, onSave, onDelete, maxMs = 4000 }: Props) {
  const [state, setState] = useState<State>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recording | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const takeBlob = (b: Blob) => {
    setBlob(b)
    const url = URL.createObjectURL(b)
    setPreviewUrl(url)
    setState('preview')
    void playUrl(url)
  }

  const start = async () => {
    setError(null)
    stopAudio()
    try {
      rec.current = await startRecording(maxMs)
      setState('recording')
      // The recorder stops itself at maxMs; pick up the result then too.
      const mine = rec.current
      setTimeout(() => rec.current === mine && void finish(), maxMs + 50)
    } catch {
      setError('אין גישה למיקרופון')
    }
  }

  const finish = async () => {
    const r = rec.current
    rec.current = null
    if (!r) return
    const b = await r.stop()
    if (b.size) takeBlob(b)
    else setState('idle')
  }

  const save = async () => {
    if (!blob) return
    setState('saving')
    try {
      await onSave(blob)
      setBlob(null)
      setPreviewUrl(null)
      setState('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השמירה נכשלה')
      setState('preview')
    }
  }

  const remove = async () => {
    if (!onDelete || !confirm('למחוק את ההקלטה?')) return
    setState('saving')
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'המחיקה נכשלה')
    }
    setState('idle')
  }

  return (
    <div className="rec">
      {state === 'idle' && (
        <>
          {existingUrl && (
            <button className="rec-btn" onClick={() => void playUrl(existingUrl)} title="השמע">
              ▶
            </button>
          )}
          {canRecord && (
            <button className="rec-btn record" onClick={() => void start()} title="הקלט">
              🎙️
            </button>
          )}
          <button className="rec-btn" onClick={() => fileInput.current?.click()} title="העלה קובץ">
            📁
          </button>
          {existingUrl && onDelete && (
            <button className="rec-btn" onClick={() => void remove()} title="מחק">
              🗑
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) takeBlob(f)
            }}
          />
        </>
      )}
      {state === 'recording' && (
        <button className="rec-btn stop" onClick={() => void finish()} title="עצור">
          ⏹
        </button>
      )}
      {state === 'preview' && previewUrl && (
        <>
          <button className="rec-btn" onClick={() => void playUrl(previewUrl)} title="השמע">
            ▶
          </button>
          <button className="rec-btn save" onClick={() => void save()} title="שמור">
            ✓
          </button>
          <button
            className="rec-btn"
            onClick={() => {
              setBlob(null)
              setPreviewUrl(null)
              setState('idle')
            }}
            title="בטל"
          >
            ✗
          </button>
        </>
      )}
      {state === 'saving' && <span className="rec-saving">…</span>}
      {error && <span className="rec-error">{error}</span>}
    </div>
  )
}
