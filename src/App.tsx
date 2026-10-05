import { useEffect, useState } from 'react'
import { HearSyllableGame } from './components/games/HearSyllableGame'
import { ReadAloudGame } from './components/games/ReadAloudGame'
import { TextAutoGame } from './components/games/TextAutoGame'
import { ContentPicker } from './components/ui/ContentPicker'
import { TextPicker } from './components/ui/TextPicker'
import { getLang, setLang, t } from './lib/i18n'
import { setPronunciation } from './data/hebrew'
import { currentAccount, switchAccount } from './lib/account'
import { ensureContent, refreshContent } from './lib/content'
import { Selection, saveSelection } from './lib/selection'
import { GameId, Home } from './pages/Home'
import { Settings } from './pages/Settings'
import { Welcome } from './pages/Welcome'
import { getLearner } from './lib/supabase'

const TITLES: Record<Exclude<GameId, 'read_text'>, { title: string; icon: string }> = {
  hear_syllable: { title: t('שמע ובחר'), icon: '👂' },
  read_aloud: { title: t('קרא בקול'), icon: '🗣️' },
}

type Screen =
  | { kind: 'home' }
  | { kind: 'settings' }
  | { kind: 'pick'; game: Exclude<GameId, 'read_text'> }
  | { kind: 'play'; game: Exclude<GameId, 'read_text'>; selection: Selection }
  | { kind: 'text-pick' }
  | { kind: 'text-auto'; groupId: string; pace: number }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [run, setRun] = useState(0)
  const account = currentAccount()
  const [boot, setBoot] = useState<'loading' | 'ready' | 'invalid'>(account ? 'loading' : 'ready')

  // Load the signed-in user: their pronunciation shapes how everything sounds.
  useEffect(() => {
    if (!account) return
    void getLearner().then((learner) => {
      if (!learner) return setBoot('invalid')
      // The user's language follows them to a new device (the page builds its texts once, so reload).
      if (learner.language && learner.language !== getLang()) {
        setLang(learner.language)
        location.reload()
        return
      }
      setPronunciation(learner.pronunciation)
      void ensureContent()
      setBoot('ready')
    })
  }, [account])

  if (!account) return <Welcome />
  if (boot === 'loading') return <div className="game loading">…</div>
  if (boot === 'invalid') return <Welcome error={t('לא הצלחנו להיכנס בתור {name}. אולי הקוד הוחלף או שאין חיבור — נסו להיכנס שוב.', { name: account.name })} />

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

  if (screen.kind === 'text-pick')
    return (
      <TextPicker
        onExit={home}
        onStart={(c) =>
          c.mode === 'auto'
            ? setScreen({ kind: 'text-auto', groupId: c.groupId, pace: c.pace })
            : setScreen({ kind: 'play', game: 'read_aloud', selection: { kind: 'group', groupId: c.groupId, rounds: 0 } })
        }
      />
    )

  if (screen.kind === 'text-auto')
    return (
      <TextAutoGame key={run} groupId={screen.groupId} pace={screen.pace} onExit={home} onRestart={() => setRun((r) => r + 1)} />
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

  return (
    <Home
      userName={account.name}
      onPlay={(game) => setScreen(game === 'read_text' ? { kind: 'text-pick' } : { kind: 'pick', game })}
      onSettings={() => setScreen({ kind: 'settings' })}
      onSwitchUser={() => switchAccount(null)}
    />
  )
}
