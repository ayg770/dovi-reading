import { useState } from 'react'
import { HearSyllableGame } from './components/games/HearSyllableGame'
import { GameId, Home } from './pages/Home'

export default function App() {
  const [game, setGame] = useState<GameId | null>(null)
  const [run, setRun] = useState(0)

  if (game === 'hear_syllable')
    return (
      <HearSyllableGame
        key={run}
        onExit={() => setGame(null)}
        onRestart={() => setRun((r) => r + 1)}
      />
    )
  return <Home onPlay={setGame} />
}
