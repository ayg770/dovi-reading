import { useEffect, useState } from 'react'
import { useContent } from '../lib/content'
import { activeGroup } from '../lib/items'
import { Learner, getLearner } from '../lib/supabase'
import { JourneyMap } from '../components/ui/JourneyMap'
import { AnimalCollection, StarBar } from '../components/ui/StarBar'
import { t } from '../lib/i18n'

export type GameId =
  | 'hear_syllable'
  | 'read_aloud'
  | 'syllable_train'
  | 'build_word'
  | 'similar_letters'
  | 'right_letter'
  | 'read_text'
  | 'rsvp'

type GameCard = { id: GameId | null; icon: string; title: string; subtitle: string }

const GAMES: GameCard[] = [
  { id: 'hear_syllable', icon: '👂', title: t('שמע ובחר'), subtitle: t('שומעים ובוחרים') },
  { id: 'read_aloud', icon: '🗣️', title: t('קרא בקול'), subtitle: t('רואים וקוראים') },
  { id: 'syllable_train', icon: '🚂', title: t('רכבת ההברות'), subtitle: t('מיקרופון פתוח, הרכבת נוסעת') },
  { id: 'build_word', icon: '🧩', title: t('בנה מילה'), subtitle: t('מחברים הברות') },
  { id: 'similar_letters', icon: '🔍', title: t('אותיות דומות'), subtitle: t('מי מהן?') },
  { id: 'right_letter', icon: '✅', title: t('האות הנכונה'), subtitle: t('הפוכה, שבורה, או נכונה?') },
  { id: 'read_text', icon: '📖', title: t('קריאת טקסט'), subtitle: t('טקסטים משלי') },
  { id: 'rsvp', icon: '⚡', title: t('קריאה ברצף'), subtitle: t('מילים בזו אחר זו, בקצב שבוחרים') },
]

type Props = {
  userName: string
  onPlay: (id: GameId) => void
  onSettings: () => void
  onSwitchUser: () => void
}

export function Home({ userName, onPlay, onSettings, onSwitchUser }: Props) {
  const content = useContent()
  const [learner, setLearner] = useState<Learner | null>(null)
  useEffect(() => {
    void getLearner().then(setLearner)
  }, [content])
  const group = activeGroup(content, learner)

  return (
    <div className="home">
      <StarBar />
      <div className="home-top">
        <button className="user-chip" onClick={onSwitchUser} aria-label={t('החלפת משתמש')}>
          <span className="who-avatar small">{userName.slice(0, 1)}</span>
          {userName} ⇄
        </button>
        <button className="settings-btn" onClick={onSettings} aria-label={t('הגדרות')}>
          ⚙️
        </button>
      </div>
      <h1>
        {t('{name} קורא', { name: userName })}
      </h1>
      <p className="nikud-row">בַּ בִּ בָּ</p>
      {group && <p className="group-tag">⭐ {group.name}</p>}
      <JourneyMap />
      <div className="cards">
        {GAMES.map((g) => (
          <button
            key={g.title}
            className="card"
            disabled={!g.id}
            onClick={() => g.id && onPlay(g.id)}
          >
            <span className="card-icon">{g.icon}</span>
            <span className="card-title">{g.title}</span>
            <span className="card-sub">{g.subtitle}</span>
          </button>
        ))}
      </div>
      <AnimalCollection />
    </div>
  )
}
