import { useState } from 'react'

import { referencedNumbers } from './model/reducer'
import { OTHER, type MatchSetup, type SetStarted, type TeamSide } from './model/types'
import { useMatchStore } from './state/store'
import { useTheme } from './ui/theme'
import Adjustment from './ui/Adjustment'
import Closeout from './ui/Closeout'
import Home from './ui/Home'
import Scoresheet from './ui/Scoresheet'
import InMatch from './ui/InMatch'
import MatchSetupScreen from './ui/MatchSetup'
import SetSetupScreen, { type SetDraft } from './ui/SetSetup'

type Route =
  | 'home'
  | 'matchSetup'
  | 'editSetup'
  | 'setSetup'
  | 'inMatch'
  | 'sheet'
  | 'closeout'
  | 'adjustment'

const EMPTY_LINEUP: (string | null)[] = [null, null, null, null, null, null]

/**
 * Defaults for the next set. Lineups default to the previous set's, since they often
 * do not change; first serve alternates; a deciding fifth set plays to 15.
 */
function setDefaults(setup: MatchSetup, events: SetStarted[], setNumber: number): SetDraft {
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

/**
 * Fold an edited setup back into a half-entered lineup. Players who left the roster or
 * became liberos come out of the lineup; newly designated liberos join the set, which
 * is usually the reason the operator went to edit the teams mid-setup. Everything else
 * is left exactly as it was entered.
 */
function reconcileDraft(draft: SetDraft, setup: MatchSetup): SetDraft {
  const lineups = { ...draft.lineups }
  const liberos = { ...draft.liberos }
  for (const side of ['home', 'visitor'] as TeamSide[]) {
    const roster = new Set(setup[side].roster.map((p) => p.number))
    const nextLiberos = [
      ...new Set([...draft.liberos[side], ...setup[side].liberoNumbers]),
    ].filter((n) => roster.has(n))
    liberos[side] = nextLiberos
    lineups[side] = draft.lineups[side].map((n) =>
      n && roster.has(n) && !nextLiberos.includes(n) ? n : null,
    )
  }
  return { ...draft, lineups, liberos }
}

export default function App() {
  const store = useMatchStore()
  const [theme, toggleTheme] = useTheme()
  const [draft, setDraft] = useState<SetDraft | null>(null)
  // `null` means the operator has not navigated yet, so the route is derived from the
  // match itself. Resuming an in-progress match on launch is therefore not an effect
  // and never costs a second render.
  const [route, setRoute] = useState<Route | null>(null)
  // The scoresheet can be opened at a chosen set, and returns where it came from.
  const [sheetSet, setSheetSet] = useState<number | undefined>(undefined)
  const [sheetFrom, setSheetFrom] = useState<Route>('inMatch')

  if (store.loading) return <div className="app-root" />

  if (store.error) {
    return (
      <div className="app-root">
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
      <div className="app-root">
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
      <div className="app-root">
        <MatchSetupScreen
          initial={store.record.setup}
          title="Edit teams & setup"
          submitLabel="Save"
          locked={referencedNumbers(store.record.events)}
          onCancel={() => setRoute(back)}
          onStart={async (setup) => {
            await store.updateSetup(setup)
            // Keep whatever lineup was already entered rather than starting over.
            setDraft((d) => (d ? reconcileDraft(d, setup) : d))
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
      // The draft is kept only while it belongs to the set about to be played; once a
      // set starts or ends, the derived defaults take over again.
      const setNumber = state.completedSets.length + 1
      const active =
        draft?.setNumber === setNumber
          ? draft
          : setDefaults(record.setup, priorSets, setNumber)
      return (
        <div className="app-root">
          <SetSetupScreen
            setup={record.setup}
            setsWon={state.setsWon}
            draft={active}
            onDraftChange={setDraft}
            onBack={() => setRoute('home')}
            onEditSetup={() => setRoute('editSetup')}
            onSheet={() => {
              setSheetSet(undefined)
              setSheetFrom('setSetup')
              setRoute('sheet')
            }}
            onCloseout={() => setRoute('closeout')}
            onStart={(body) => {
              store.append(body)
              setDraft(null)
              setRoute('inMatch')
            }}
          />
        </div>
      )
    }

    if (view === 'adjustment') {
      return (
        <div className="app-root">
          <Adjustment
            setup={record.setup}
            state={state}
            onCancel={() => setRoute('inMatch')}
            onApply={(events) => {
              store.append(...events)
              setRoute('inMatch')
            }}
          />
        </div>
      )
    }

    if (view === 'closeout') {
      return (
        <div className="app-root">
          <Closeout
            setup={record.setup}
            state={state}
            exportedAt={record.exportedAt}
            onExport={store.exportMatch}
            onComplete={async () => {
              await store.complete()
              setRoute('home')
            }}
            onOpenSheet={(setNumber) => {
              setSheetSet(setNumber)
              setSheetFrom('closeout')
              setRoute('sheet')
            }}
            onBackToMatch={() => setRoute(state.setInProgress ? 'inMatch' : 'setSetup')}
          />
        </div>
      )
    }

    if (view === 'sheet') {
      return (
        <div className="app-root">
          <Scoresheet
            setup={record.setup}
            events={record.events}
            initialSet={sheetSet}
            onBack={() => setRoute(sheetFrom)}
          />
        </div>
      )
    }

    if (view === 'inMatch') {
      // No .app-root wrapper: the in-match screen supplies its own .stage/.app,
      // which is the reference's fixed 1180x820 layout container.
      return (
        <>
          <InMatch
            setup={record.setup}
            state={state}
            events={record.events}
            append={store.append}
            undoLast={store.undoLast}
            canUndo={store.canUndo}
            theme={theme}
            onToggleTheme={toggleTheme}
            onSheet={() => {
              setSheetSet(undefined)
              setSheetFrom('inMatch')
              setRoute('sheet')
            }}
            onEditSetup={() => setRoute('editSetup')}
            onCloseout={() => setRoute('closeout')}
            onAdjust={() => setRoute('adjustment')}
            onExport={() => void store.exportMatch()}
            onHome={() => setRoute('home')}
          />
        </>
      )
    }
  }

  return (
    <div className="app-root">
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
