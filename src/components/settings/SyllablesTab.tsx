import { Fragment } from 'react'
import { NIKUD, SYLLABLE_LETTERS, currentPronunciation, syllableText } from '../../data/hebrew'
import { deleteSyllableRecording, saveSyllableRecording } from '../../lib/admin'
import { ownRecording, storageUrl, useContent } from '../../lib/content'
import { t } from '../../lib/i18n'
import { RecordButton } from '../ui/RecordButton'

/** A grid of every letter × nikud; tap to record Dovi (or anyone) saying it. */
export function SyllablesTab() {
  const content = useContent()
  // content is read so the grid re-renders when recordings change
  const recorded = (letterId: number, nikudId: number) => (content ? ownRecording(letterId, nikudId) : undefined)
  const pron = currentPronunciation()
  const count = content.recordings.filter((r) => r.source === 'storage' && r.pronunciation === pron).length

  return (
    <div className="panel">
      <p className="muted">
        {t('הקלטה של הברה מחליפה את הקול הממוחשב בכל המשחקים. מילה שכל ההברות שלה מוקלטות תושמע כחיבור של ההקלטות. הוקלטו {count} מתוך {total}.', {
          count,
          total: SYLLABLE_LETTERS.length * NIKUD.length,
        })}
      </p>
      <div className="syl-grid">
        <div className="syl-head" />
        {NIKUD.map((n) => (
          <div key={n.id} className="syl-head">
            {t(n.name)}
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

