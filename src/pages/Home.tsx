import { useEffect, useState } from 'react'
import { useContent } from '../lib/content'
import { activeGroup } from '../lib/items'
import { Learner, getLearner } from '../lib/supabase'
import { AnimalCollection, StarBar } from '../components/ui/StarBar'

export type GameId = 'hear_syllable' | 'read_aloud'

type GameCard = { id: GameId | null; icon: string; title: string; subtitle: string }

const GAMES: GameCard[] = [
  { id: 'hear_syllable', icon: '👂', title: 'שמע ובחר', subtitle: 'שומעים ובוחרים' },
  { id: 'read_aloud', icon: '🗣️', title: 'קרא בקול', subtitle: 'רואים וקוראים' },
  { id: null, icon: '📖', title: 'איזו מילה?', subtitle: 'בקרוב' },
  { id: null, icon: '🔍', title: 'אותיות דומות', subtitle: 'בקרוב' },
]

type Props = { onPlay: (id: GameId) => void; onSettings: () => void }

export function Home({ onPlay, onSettings }: Props) {
  const content = useContent()
  const [learner, setLearner] = useState<Learner | null>(null)
  useEffect(() => {
    void getLearner().then(setLearner)
  }, [content])
  const group = activeGroup(content, learner)

  return (
    <div className="home">
      <button className="settings-btn" onClick={onSettings} aria-label="הגדרות">
        ⚙️
      </button>
      <StarBar />
      <h1>
        דובי <span>קורא</span>
      </h1>
      <p className="nikud-row">בַּ בִּ בָּ</p>
      {group && <p className="group-tag">⭐ {group.name}</p>}
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
