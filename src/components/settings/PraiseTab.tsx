import { addPraiseClip, deletePraiseClip } from '../../lib/admin'
import { playUrl } from '../../lib/audio'
import { storageUrl, useContent } from '../../lib/content'
import { RecordButton } from '../ui/RecordButton'
import { t } from '../../lib/i18n'

/** Short cheers ("כל הכבוד!") played at random after a right answer. */
export function PraiseTab() {
  const { praise } = useContent()
  return (
    <div className="panel">
      <p className="muted">
        {t('הקליטו משפטי עידוד קצרים בקול שלכם ("כל הכבוד!", "וואו, איזה קורא!"). אחרי תשובה נכונה יושמע אחד מהם באקראי. כל עוד אין הקלטות, הקול הממוחשב אומר "כל הכבוד!", "יופי!" וכדומה.')}
      </p>
      <ul className="praise-list">
        {praise.map((p, i) => (
          <li key={p.id}>
            <span>{t('עידוד {n}', { n: i + 1 })}</span>
            <button className="rec-btn" onClick={() => void playUrl(storageUrl(p.audio_path))}>
              ▶
            </button>
            <button
              className="rec-btn"
              onClick={() => confirm(t('למחוק?')) && void deletePraiseClip(p.id, p.audio_path)}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <span>{t('הקלטה חדשה:')}</span>
        <RecordButton onSave={addPraiseClip} maxMs={6000} />
      </div>
    </div>
  )
}
