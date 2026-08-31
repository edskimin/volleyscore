import { useMemo, useState } from 'react'

import { fold, passColor, servingSlotIndex, undo } from './model/reducer'
import { ROMAN, type MatchEvent, type MatchSetup, type TeamSide } from './model/types'

// Scaffold only. This screen exists to prove the fold end to end; the real screens
// are specified in docs/03-screens-and-flows.md and are not built yet.

const DEMO_SETUP: MatchSetup = {
  level: 'varsity',
  format: 'best_of_5',
  date: '2026-10-14',
  venue: null,
  officials: { r1Name: null, r1Number: null, r2Name: null, r2Number: null },
  scorerName: null,
  home: {
    teamId: null,
    name: 'Avon Lake',
    colorPrimary: '#14284B',
    colorText: '#FFFFFF',
    roster: ['12', '7', '21', '4', '15', '9', '2', '30'].map((number) => ({
      number,
      name: null,
      captain: number === '12',
    })),
    liberoNumbers: ['30'],
  },
  visitor: {
    teamId: null,
    name: 'Amherst',
    colorPrimary: '#7A1120',
    colorText: '#FFFFFF',
    roster: ['3', '11', '8', '22', '6', '14'].map((number) => ({
      number,
      name: null,
      captain: false,
    })),
    liberoNumbers: [],
  },
}

const FIRST_EVENT: MatchEvent = {
  seq: 1,
  ts: new Date(0).toISOString(),
  type: 'SET_STARTED',
  setNumber: 1,
  targetScore: 25,
  firstServe: 'home',
  sidesSwitched: false,
  lineups: {
    home: ['12', '7', '21', '4', '15', '9'],
    visitor: ['3', '11', '8', '22', '6', '14'],
  },
  liberoDesignated: { home: ['30'], visitor: [] },
  startTime: '18:00',
}

export default function App() {
  const [events, setEvents] = useState<MatchEvent[]>([FIRST_EVENT])
  const state = useMemo(() => fold(DEMO_SETUP, events), [events])

  const rally = (team: TeamSide) =>
    setEvents((prev) => [
      ...prev,
      { seq: prev.length + 1, ts: new Date().toISOString(), type: 'RALLY_WON', team },
    ])

  return (
    <main className="scaffold">
      <header>
        <h1>VolleyScore</h1>
        <p>
          Scaffold. The reducer is real; the screens are not.{' '}
          <code>docs/03-screens-and-flows.md</code>
        </p>
      </header>

      <section className="panels">
        {(['home', 'visitor'] as TeamSide[]).map((side) => {
          const team = state.teams[side]
          const serving = state.serveTeam === side
          const setup = DEMO_SETUP[side]
          return (
            <button
              key={side}
              className={serving ? 'panel serving' : 'panel'}
              style={{ background: setup.colorPrimary, color: setup.colorText }}
              onClick={() => rally(side)}
            >
              <span className="team">{setup.name}</span>
              <span className="score">{state.score[side]}</span>
              <span className="serve">
                {serving
                  ? `serving #${team.slots[servingSlotIndex(team)].current}`
                  : 'receiving'}
              </span>
              <span className="meta" style={{ color: passColor(team.rotationPass) }}>
                turn {team.serviceTurns} · pass {team.rotationPass}
              </span>
              <span className="court">
                {team.slots.map((slot) => (
                  <span key={slot.rn} className="cell">
                    <em>{slot.rn}</em>
                    {slot.current}
                    <i>pos {slot.position}</i>
                  </span>
                ))}
              </span>
              <span className="rows">
                {team.sheetRows.map((row, i) => (
                  <span key={ROMAN[i]} className="row">
                    <em>{ROMAN[i]}</em>
                    {row.map((mark, j) => (
                      <b key={j} style={{ color: passColor(mark.pass) }}>
                        {mark.kind === 'point'
                          ? mark.value
                          : mark.kind === 'endOfService'
                            ? '-|'
                            : mark.kind === 'sub'
                              ? mark.label
                              : mark.kind === 'timeout'
                                ? mark.label
                                : mark.kind === 'replay'
                                  ? 'R'
                                  : 'RS'}
                      </b>
                    ))}
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </section>

      <footer>
        <button onClick={() => setEvents(undo)} disabled={events.length <= 1}>
          Undo
        </button>
        <span>
          {events.length - 1} rallies
          {state.setComplete ? ' · set complete' : ''}
        </span>
      </footer>

      {state.warnings.length > 0 && (
        <ul className="warnings">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </main>
  )
}
