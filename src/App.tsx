import { useState } from 'react'

import { referencedNumbers } from './model/reducer'
import { OTHER, type MatchSetup, type SetStarted } from './model/types'
import { useMatchStore } from './state/store'
import Closeout from './ui/Closeout'
import Home from './ui/Home'
import Scoresheet from './ui/Scoresheet'
import InMatch from './ui/InMatch'
import MatchSetupScreen from './ui/MatchSetup'
import SetSetupScreen, { type SetDefaults } from './ui/SetSetup'

type Route =
  | 'home'
  | 'matchSetup'
  | 'editSetup'
  | 'setSetup'
  | 'inMatch'
  | 'sheet'
  | 'closeout'

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

  if (store.error) {
    return (
      <div className="app">
        <div className="screen storage-error">
          <div className="card">
            <h1>Local storage is unavailable</h1>
            <p className="muted">
              The match database could not be opened, so nothing can be scored or read on
              this device right now.
            </p>
            <pre>{store.error}</pre>
            <p className="faint">
              Any match already exported to a file is safe. Reloading may help; if it does
              not, the app was likely updated in a way this device&rsquo;s database cannot
              migrate.
            </p>
            <button className="btn primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Resuming: a live set goes back to the match, a decided match goes to closeout, and
  // anything else goes to set setup. A decided match must not offer set 4.
  const resumed: Route = store.state?.setInProgress
    ? 'inMatch'
    : store.state?.matchComplete
      ? 'closeout'
      : 'setSetup'
  let view: Route = route ?? (store.record ? resumed : 'home')
  // A finished set drops back to set setup for the next one rather than dead-ending;
  // a finished match drops to closeout instead of offering a set that will not be played.
  if (view === 'inMatch' && store.state && !store.state.setInProgress) {
    view = store.state.matchComplete ? 'closeout' : 'setSetup'
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

  // Setup stays editable for the life of the match, because team colors are guessed
  // before the teams warm up and the in-match screen depends on telling them apart.
  if (view === 'editSetup' && store.record) {
    const back = store.state?.setInProgress ? 'inMatch' : 'setSetup'
    return (
      <div className="app">
        <MatchSetupScreen
          initial={store.record.setup}
          title="Edit teams & setup"
          submitLabel="Save"
          locked={referencedNumbers(store.record.events)}
          onCancel={() => setRoute(back)}
          onStart={async (setup) => {
            await store.updateSetup(setup)
            setRoute(back)
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
            onEditSetup={() => setRoute('editSetup')}
            onSheet={() => setRoute('sheet')}
            onCloseout={() => setRoute('closeout')}
            onStart={(body) => {
              store.append(body)
              setRoute('inMatch')
            }}
          />
        </div>
      )
    }

    if (view === 'closeout') {
      return (
        <div className="app">
          <Closeout
            setup={record.setup}
            state={state}
            exportedAt={record.exportedAt}
            onExport={store.exportMatch}
            onComplete={async () => {
              await store.complete()
              setRoute('home')
            }}
            onBackToMatch={() => setRoute(state.setInProgress ? 'inMatch' : 'setSetup')}
          />
        </div>
      )
    }

    if (view === 'sheet') {
      return (
        <div className="app">
          <Scoresheet
            setup={record.setup}
            events={record.events}
            onBack={() => setRoute(state.setInProgress ? 'inMatch' : 'setSetup')}
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
            events={record.events}
            append={store.append}
            undoLast={store.undoLast}
            canUndo={store.canUndo}
            onSheet={() => setRoute('sheet')}
            onEditSetup={() => setRoute('editSetup')}
            onCloseout={() => setRoute('closeout')}
            onExport={() => void store.exportMatch()}
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
