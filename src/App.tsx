import { useEffect, useState } from 'react'
import { HearSyllableGame } from './components/games/HearSyllableGame'
import { ReadAloudGame } from './components/games/ReadAloudGame'
import { ensureContent, refreshContent } from './lib/content'
import { GameId, Home } from './pages/Home'
import { Settings } from './pages/Settings'

type Screen = GameId | 'settings' | null

export default function App() {
  const [screen, setScreen] = useState<Screen>(null)
  const [run, setRun] = useState(0)

  useEffect(() => {
    void ensureContent()
  }, [])

  const exit = () => setScreen(null)
  const restart = () => setRun((r) => r + 1)

  if (screen === 'hear_syllable') return <HearSyllableGame key={run} onExit={exit} onRestart={restart} />
  if (screen === 'read_aloud') return <ReadAloudGame key={run} onExit={exit} onRestart={restart} />
  if (screen === 'settings')
    return (
      <Settings
        onExit={() => {
          void refreshContent()
          exit()
        }}
      />
    )
  return <Home onPlay={setScreen} onSettings={() => setScreen('settings')} />
}
