import { useEffect, useState } from 'react'
import { HearSyllableGame } from './components/games/HearSyllableGame'
import { ReadAloudGame } from './components/games/ReadAloudGame'
import { ContentPicker } from './components/ui/ContentPicker'
import { ensureContent, refreshContent } from './lib/content'
import { Selection, saveSelection } from './lib/selection'
import { GameId, Home } from './pages/Home'
import { Settings } from './pages/Settings'

const TITLES: Record<GameId, { title: string; icon: string }> = {
  hear_syllable: { title: 'שמע ובחר', icon: '👂' },
  read_aloud: { title: 'קרא בקול', icon: '🗣️' },
}

type Screen =
  | { kind: 'home' }
  | { kind: 'settings' }
  | { kind: 'pick'; game: GameId }
  | { kind: 'play'; game: GameId; selection: Selection }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [run, setRun] = useState(0)

  useEffect(() => {
    void ensureContent()
  }, [])

  const home = () => setScreen({ kind: 'home' })

  if (screen.kind === 'settings')
    return (
      <Settings
        onExit={() => {
          void refreshContent()
          home()
        }}
      />
    )

  if (screen.kind === 'pick')
    return (
      <ContentPicker
        game={screen.game}
        {...TITLES[screen.game]}
        onStart={(selection) => setScreen({ kind: 'play', game: screen.game, selection })}
        onExit={home}
      />
    )

  if (screen.kind === 'play') {
    const props = {
      key: run,
      selection: screen.selection,
      onExit: home,
      onRestart: () => setRun((r) => r + 1),
      onPlayGroup: (groupId: string) => {
        const selection: Selection = { kind: 'group', groupId }
        saveSelection(screen.game, selection)
        setScreen({ ...screen, selection })
        setRun((r) => r + 1)
      },
    }
    return screen.game === 'hear_syllable' ? <HearSyllableGame {...props} /> : <ReadAloudGame {...props} />
  }

  return <Home onPlay={(game) => setScreen({ kind: 'pick', game })} onSettings={() => setScreen({ kind: 'settings' })} />
}
