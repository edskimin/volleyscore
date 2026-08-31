import { useState } from 'react'

import { shareExport } from './db/db'
import { OTHER, type MatchSetup, type SetStarted } from './model/types'
import { useMatchStore } from './state/store'
import Home from './ui/Home'
import InMatch from './ui/InMatch'
import MatchSetupScreen from './ui/MatchSetup'
import SetSetupScreen, { type SetDefaults } from './ui/SetSetup'

type Route = 'home' | 'matchSetup' | 'setSetup' | 'inMatch'

const EMPTY_LINEUP: (string | null)[] = [null, null, null, null, null, null]

/**
 * Defaults for the next set. Lineups default to the previous set's, since they often
 * do not change; first serve alternates; a deciding fifth set plays to 15.
 */
function setDefaults(
  setup: MatchSetup,
  events: SetStarted[],
  setNumber: number,
): SetDefaults {
  const last = events[events.length - 1]
  const deciding = setup.format === 'best_of_5' && setNumber === 5
  return {
    setNumber,
    lineups: last
      ? { home: [...last.lineups.home], visitor: [...last.lineups.visitor] }
      : { home: [...EMPTY_LINEUP], visitor: [...EMPTY_LINEUP] },
    firstServe: last ? OTHER[last.firstServe] : 'home',
    targetScore: deciding ? 15 : 25,
    liberos: last
      ? { home: [...last.liberoDesignated.home], visitor: [...last.liberoDesignated.visitor] }
      : { home: [...setup.home.liberoNumbers], visitor: [...setup.visitor.liberoNumbers] },
    sidesSwitched: false,
  }
}

export default function App() {
  const store = useMatchStore()
  // `null` means the operator has not navigated yet, so the route is derived from the
  // match itself. Resuming an in-progress match on launch is therefore not an effect
  // and never costs a second render.
  const [route, setRoute] = useState<Route | null>(null)

  if (store.loading) return <div className="app" />

  const resumed: Route = store.record && store.state?.setInProgress ? 'inMatch' : 'setSetup'
  let view: Route = route ?? (store.record ? resumed : 'home')
  // A finished set drops back to set setup for the next one rather than dead-ending.
  if (view === 'inMatch' && store.state && !store.state.setInProgress) view = 'setSetup'

  async function exportMatch() {
    if (store.record) await shareExport(store.record)
  }

  if (view === 'matchSetup') {
    return (
      <div className="app">
        <MatchSetupScreen
          onCancel={() => setRoute('home')}
          onStart={async (setup) => {
            await store.start(setup)
            setRoute('setSetup')
          }}
        />
      </div>
    )
  }

  if (view !== 'home' && store.record && store.state) {
    const { record, state } = store
    const priorSets = record.events.filter(
      (e): e is SetStarted => e.type === 'SET_STARTED',
    )

    if (view === 'setSetup') {
      return (
        <div className="app">
          <SetSetupScreen
            setup={record.setup}
            setsWon={state.setsWon}
            defaults={setDefaults(record.setup, priorSets, state.completedSets.length + 1)}
            onBack={() => setRoute('home')}
            onStart={(body) => {
              store.append(body)
              setRoute('inMatch')
            }}
          />
        </div>
      )
    }

    if (view === 'inMatch') {
      return (
        <div className="app">
          <InMatch
            setup={record.setup}
            state={state}
            append={store.append}
            undoLast={store.undoLast}
            canUndo={store.canUndo}
            onExport={() => void exportMatch()}
            onHome={() => setRoute('home')}
          />
        </div>
      )
    }
  }

  return (
    <div className="app">
      <Home
        activeMatchId={store.record?.matchId ?? null}
        onNew={() => setRoute('matchSetup')}
        onOpen={async (matchId) => {
          await store.open(matchId)
          setRoute('inMatch')
        }}
      />
    </div>
  )
}
