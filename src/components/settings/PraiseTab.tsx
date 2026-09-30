import { addPraiseClip, deletePraiseClip } from '../../lib/admin'
import { playUrl } from '../../lib/audio'
import { useContent } from '../../lib/content'
import { storageUrl } from '../../lib/supabase'
import { RecordButton } from '../ui/RecordButton'

/** Short cheers ("כל הכבוד דובי!") played at random after a right answer. */
export function PraiseTab() {
  const { praise } = useContent()
  return (
    <div className="panel">
      <p className="muted">
        הקליטו משפטי עידוד קצרים בקול שלכם ("כל הכבוד דובי!", "וואו, איזה קורא!"). אחרי תשובה נכונה
        יושמע אחד מהם באקראי. כל עוד אין הקלטות, הקול הממוחשב אומר "כל הכבוד!", "יופי!" וכדומה.
      </p>
      <ul className="praise-list">
        {praise.map((p, i) => (
          <li key={p.id}>
            <span>עידוד {i + 1}</span>
            <button className="rec-btn" onClick={() => void playUrl(storageUrl(p.audio_path))}>
              ▶
            </button>
            <button
              className="rec-btn"
              onClick={() => confirm('למחוק?') && void deletePraiseClip(p.id, p.audio_path)}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <span>הקלטה חדשה:</span>
        <RecordButton onSave={addPraiseClip} maxMs={6000} />
      </div>
    </div>
  )
}
