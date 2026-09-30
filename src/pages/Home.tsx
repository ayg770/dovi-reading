export type GameId = 'hear_syllable'

type GameCard = { id: GameId | null; icon: string; title: string; subtitle: string }

const GAMES: GameCard[] = [
  { id: 'hear_syllable', icon: '👂', title: 'שמע ובחר', subtitle: 'שומעים הברה ובוחרים' },
  { id: null, icon: '🗣️', title: 'קרא בקול', subtitle: 'בקרוב' },
  { id: null, icon: '📖', title: 'איזו מילה?', subtitle: 'בקרוב' },
  { id: null, icon: '🔍', title: 'אותיות דומות', subtitle: 'בקרוב' },
]

export function Home({ onPlay }: { onPlay: (id: GameId) => void }) {
  return (
    <div className="home">
      <h1>
        דובי <span>קורא</span>
      </h1>
      <p className="nikud-row">בַּ בִּ בָּ</p>
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
    </div>
  )
}
