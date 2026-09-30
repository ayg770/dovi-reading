import { Fragment } from 'react'
import { NIKUD, SYLLABLE_LETTERS, syllableText } from '../../data/hebrew'
import { deleteSyllableRecording, saveSyllableRecording } from '../../lib/admin'
import { useContent } from '../../lib/content'
import { storageUrl } from '../../lib/supabase'
import { RecordButton } from '../ui/RecordButton'

/** A grid of every letter × nikud; tap to record Dovi (or anyone) saying it. */
export function SyllablesTab() {
  const content = useContent()
  const recorded = (letterId: number, nikudId: number) =>
    content.recordings.find(
      (r) => r.source === 'storage' && r.letter_id === letterId && r.nikud_id === nikudId,
    )
  const count = content.recordings.filter((r) => r.source === 'storage').length

  return (
    <div className="panel">
      <p className="muted">
        הקלטה של הברה מחליפה את הקול הממוחשב בכל המשחקים. מילה שכל ההברות שלה מוקלטות תושמע
        כחיבור של ההקלטות. הוקלטו {count} מתוך {SYLLABLE_LETTERS.length * NIKUD.length}.
      </p>
      <div className="syl-grid">
        <div className="syl-head" />
        {NIKUD.map((n) => (
          <div key={n.id} className="syl-head">
            {n.name}
          </div>
        ))}
        {SYLLABLE_LETTERS.map((letter) => (
          <Fragment key={letter.id}>
            <div className="syl-letter">{letter.glyph}</div>
            {NIKUD.map((nikud) => {
              const r = recorded(letter.id, nikud.id)
              return (
                <div key={nikud.id} className={r ? 'syl-cell done' : 'syl-cell'}>
                  <span className="syl-text">{syllableText({ letter, nikud })}</span>
                  <RecordButton
                    existingUrl={r ? storageUrl(r.audio_path) : null}
                    onSave={(b) => saveSyllableRecording(letter.id, nikud.id, b)}
                    onDelete={() => deleteSyllableRecording(letter.id, nikud.id)}
                  />
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

