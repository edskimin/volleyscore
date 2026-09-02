import { useState } from 'react'

import { saveTeam } from '../db/db'
import type { DerivedState, MatchSetup, TeamSide } from '../model/types'

interface Props {
  setup: MatchSetup
  state: DerivedState
  exportedAt: string | null
  onExport: () => Promise<void>
  onComplete: () => Promise<void>
  /** Checking the sheet is the natural last step before exporting. */
  onOpenSheet: (setNumber: number) => void
  /** MATCH_ENDED is a state change, not a termination. Going back must stay possible. */
  onBackToMatch: () => void
}

function when(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toTimeString().slice(0, 5)}`
}

export default function Closeout({
  setup,
  state,
  exportedAt,
  onExport,
  onComplete,
  onOpenSheet,
  onBackToMatch,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const winner: TeamSide = state.setsWon.home > state.setsWon.visitor ? 'home' : 'visitor'
  const decided = state.setsWon.home !== state.setsWon.visitor

  async function runExport() {
    setBusy(true)
    setError(null)
    try {
      await onExport()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen screen-scroll closeout">
      <div className="topbar">
        <button className="btn ghost" onClick={onBackToMatch}>
          ← Back to match
        </button>
        <h1>Match closeout</h1>
      </div>

      <section className="card result">
        <div className="result-head">
          {decided ? (
            <>
              <b>{setup[winner].name}</b>
              <span className="muted">wins</span>
              <span className="num big">
                {state.setsWon[winner]}–{state.setsWon[winner === 'home' ? 'visitor' : 'home']}
              </span>
            </>
          ) : (
            <b>
              {state.setsWon.home}–{state.setsWon.visitor}, not decided
            </b>
          )}
        </div>

        <table className="sets">
          <thead>
            <tr>
              <th>Set</th>
              <th>{setup.home.name}</th>
              <th>{setup.visitor.name}</th>
              <th>Start</th>
              <th>End</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.completedSets.map((s) => (
              <tr key={s.setNumber}>
                <td>{s.setNumber}</td>
                <td className={`num${s.winner === 'home' ? ' won' : ''}`}>{s.score.home}</td>
                <td className={`num${s.winner === 'visitor' ? ' won' : ''}`}>{s.score.visitor}</td>
                <td className="num faint">{s.startTime}</td>
                <td className="num faint">{s.endTime ?? '—'}</td>
                <td className="sheet-link">
                  <button className="btn" onClick={() => onOpenSheet(s.setNumber)}>
                    Scoresheet
                  </button>
                </td>
              </tr>
            ))}
            {state.setInProgress && (
              <tr className="faint">
                <td>{state.currentSet}</td>
                <td className="num">{state.score.home}</td>
                <td className="num">{state.score.visitor}</td>
                <td colSpan={2}>in progress</td>
                <td className="sheet-link">
                  <button className="btn" onClick={() => onOpenSheet(state.currentSet)}>
                    Scoresheet
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Blocking, deliberately. IndexedDB on iOS is not durable storage, and a
          dismissible reminder would be dismissed. */}
      <section className={`card export-gate${exportedAt ? ' done' : ''}`}>
        <div className="gate-head">
          <span className="gate-mark">{exportedAt ? '✓' : '1'}</span>
          <div>
            <h2>{exportedAt ? 'Exported' : 'Export the match file'}</h2>
            <p className="muted">
              {exportedAt
                ? `Last written out ${when(exportedAt)}. Export again if anything has changed since.`
                : 'Save or share the .json file before finishing. Browser storage on iOS can be evicted after about a week, and this file is the only copy that outlives it.'}
            </p>
          </div>
        </div>
        <button className="btn primary lg" onClick={() => void runExport()} disabled={busy}>
          {busy ? 'Exporting…' : exportedAt ? 'Export again' : 'Export'}
        </button>
      </section>

      {error && <p className="import-error">{error}</p>}

      <section className="card">
        {/* The heading says what the buttons do. Explaining that a saved team is a
            copy is a consequence the operator cannot act on here. */}
        <h2 className="section-title">Save teams for next time</h2>
        <div className="save-teams">
          {(['home', 'visitor'] as TeamSide[]).map((side) => (
            <button
              key={side}
              className="btn"
              disabled={saved[side]}
              onClick={() => {
                void saveTeam(setup[side]).then(() => setSaved((p) => ({ ...p, [side]: true })))
              }}
            >
              <i className="swatch" style={{ background: setup[side].colorPrimary }} />
              {saved[side] ? `${setup[side].name} saved` : `Save ${setup[side].name}`}
            </button>
          ))}
        </div>
      </section>

      <div className="closeout-actions">
        {/* Export is the primary action on this screen; finishing is not. Two
            filled controls in one layer is two answers to "what next". */}
        <button className="btn lg" disabled={!exportedAt} onClick={() => void onComplete()}>
          Finish and close
        </button>
        {!exportedAt && <span className="faint">Export the file first.</span>}
      </div>
    </div>
  )
}
