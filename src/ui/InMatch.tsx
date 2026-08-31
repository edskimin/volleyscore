import { useEffect, useState } from 'react'

import { servingSlotIndex } from '../model/reducer'
import { ineligibleReason, resolveExchange } from '../model/selection'
import {
  MAX_SUBS,
  MAX_TIMEOUTS,
  type CourtPosition,
  type DerivedState,
  type EventBody,
  type MatchSetup,
  type SlotIndex,
  type TeamSide,
} from '../model/types'

interface Props {
  setup: MatchSetup
  state: DerivedState
  append: (...bodies: EventBody[]) => void
  undoLast: () => void
  canUndo: boolean
  onExport: () => void
  onHome: () => void
}

/**
 * Court position to grid cell, in DOM order for a three-row, two-column grid.
 *
 * Each team's front row sits against the center divider, so the two front rows face
 * each other across the net. Home faces right, so its right back (position 1) is the
 * bottom of the outer column; the visitor faces left, so its position 1 is the top of
 * its outer column. The two serving corners end up diagonal, which is correct.
 */
const GRID: Record<TeamSide, CourtPosition[]> = {
  home: [5, 4, 6, 3, 1, 2],
  visitor: [2, 1, 3, 6, 4, 5],
}

type Selection =
  | { side: TeamSide; kind: 'bench'; player: string }
  | { side: TeamSide; kind: 'court'; slot: SlotIndex }
  | null

export default function InMatch({
  setup,
  state,
  append,
  undoLast,
  canUndo,
  onExport,
  onHome,
}: Props) {
  const [sel, setSel] = useState<Selection>(null)
  const [menu, setMenu] = useState(false)
  const [adding, setAdding] = useState<TeamSide | null>(null)
  const [newNumber, setNewNumber] = useState('')

  // Wall clock for the sheet's start and end times; a minute of drift is immaterial.
  const [clock, setClock] = useState(() => new Date().toTimeString().slice(0, 5))
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toTimeString().slice(0, 5)), 20_000)
    return () => clearInterval(id)
  }, [])

  function exchange(side: TeamSide, player: string, slot: SlotIndex) {
    const result = resolveExchange(state.teams[side], side, player, slot)
    if (result.kind === 'blocked') return
    append(...result.events)
    setSel(null)
  }

  function tapBench(side: TeamSide, player: string) {
    if (sel?.kind === 'bench' && sel.side === side && sel.player === player) return setSel(null)
    if (sel?.kind === 'court' && sel.side === side) return exchange(side, player, sel.slot)
    setSel({ side, kind: 'bench', player })
  }

  function tapCourt(side: TeamSide, slot: SlotIndex) {
    if (sel?.kind === 'court' && sel.side === side && sel.slot === slot) return setSel(null)
    if (sel?.kind === 'bench' && sel.side === side) return exchange(side, sel.player, slot)
    setSel({ side, kind: 'court', slot })
  }

  const setLine = state.completedSets.map((s) => `${s.score.home}–${s.score.visitor}`).join(' · ')

  return (
    <div className="screen match-screen" onClick={() => menu && setMenu(false)}>
      <header className="match-head">
        <span className="eyebrow">{setup.level === 'jv' ? 'JV' : setup.level}</span>
        <span className="num muted">{setLine || 'set 1'}</span>
        {state.setComplete && <span className="badge">set point reached</span>}
        <div className="spacer" />
        <span className="num faint">{clock}</span>
        <button className="btn ghost sm" onClick={onHome}>
          Matches
        </button>
      </header>

      <div className="panels">
        {(['home', 'visitor'] as TeamSide[]).map((side) => {
          const team = state.teams[side]
          const snap = setup[side]
          const serving = state.serveTeam === side
          const server = team.slots[servingSlotIndex(team)]
          const onCourtNumbers = new Set(team.slots.map((s) => s.current))
          const selectedSlot = sel?.kind === 'court' && sel.side === side ? sel.slot : null
          const selectedBench = sel?.kind === 'bench' && sel.side === side ? sel.player : null

          return (
            <section
              key={side}
              className={`panel ${side}${serving ? ' serving' : ' receiving'}`}
              style={
                {
                  '--team': snap.colorPrimary,
                  '--team-text': snap.colorText,
                } as React.CSSProperties
              }
            >
              <div className="panel-head">
                <b className="tname">{snap.name}</b>
                <span className="sets num">
                  {state.setsWon[side]} {state.setsWon[side] === 1 ? 'set' : 'sets'}
                </span>
              </div>

              <div className="scoreline">
                {/* The score is the button. It is what the eye is already on, so
                    reading and recording collapse into one object. */}
                <button
                  className="score num"
                  onClick={() => append({ type: 'RALLY_WON', team: side })}
                  aria-label={`Point ${snap.name}`}
                >
                  {state.score[side]}
                </button>

                <div className="court">
                  {GRID[side].map((pos) => {
                    const idx = team.slots.findIndex((s) => s.position === pos) as SlotIndex
                    const slot = team.slots[idx]
                    if (!slot) return <span key={pos} className="cell" />
                    const isLibero = slot.current === team.liberoOnCourt
                    const dim =
                      selectedBench !== null &&
                      ineligibleReason(team, selectedBench, idx) !== null
                    return (
                      <button
                        key={pos}
                        className={[
                          'cell',
                          pos === 1 && serving ? 'server' : '',
                          isLibero ? 'is-libero' : '',
                          selectedSlot === idx ? 'selected' : '',
                          dim ? 'dim' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        disabled={dim}
                        onClick={() => tapCourt(side, idx)}
                      >
                        <em>
                          {slot.rn}
                          {slot.liberoServeFlag && <s>▲</s>}
                        </em>
                        <b className="num">{slot.current}</b>
                        {slot.history.length > 0 && (
                          <i className="num">{slot.history.join(' ')}</i>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="serve-state">
                {serving ? (
                  <>
                    <span className="dot" /> serving <b className="num">#{server.current}</b>
                  </>
                ) : (
                  'receiving'
                )}
              </div>

              {/* The full roster in fixed slots. A chip never moves during a match, so
                  the operator reaches for a known spot rather than scanning. */}
              <div className="bench">
                {state.rosters[side].map((p) => {
                  const isOn = onCourtNumbers.has(p.number)
                  const dim =
                    selectedSlot !== null &&
                    ineligibleReason(team, p.number, selectedSlot) !== null
                  const returnsTo = team.exitSlot[p.number]
                  const libero = snap.liberoNumbers.includes(p.number)
                  return (
                    <button
                      key={p.number}
                      className={[
                        'bchip',
                        isOn ? 'on-court' : '',
                        libero ? 'libero' : '',
                        selectedBench === p.number ? 'selected' : '',
                        dim ? 'dim' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={isOn || dim}
                      onClick={() => tapBench(side, p.number)}
                    >
                      <span className="num">{p.number}</span>
                      {returnsTo !== undefined && !isOn && (
                        <em>{team.slots[returnsTo].rn}</em>
                      )}
                    </button>
                  )
                })}
                <button className="bchip add" onClick={() => setAdding(side)} title="Add a player">
                  +
                </button>
              </div>

              <div className="subs" title={`${team.subsUsed.length} of ${MAX_SUBS} substitutions`}>
                {Array.from({ length: MAX_SUBS }, (_, i) => (
                  <span key={i} className={i < team.subsUsed.length ? 'used num' : 'num'}>
                    {i + 1}
                  </span>
                ))}
              </div>
            </section>
          )
        })}

        <div className="divider">
          <span className="eyebrow">set</span>
          <b className="num">{state.currentSet}</b>
          <span className="num sets-line">
            {state.setsWon.home}–{state.setsWon.visitor}
          </span>
          <span className="num target">to {state.targetScore}</span>
        </div>
      </div>

      {state.setComplete && state.setInProgress && (
        <div className="set-end">
          <span>
            {state.score.home > state.score.visitor ? setup.home.name : setup.visitor.name} wins{' '}
            <b className="num">
              {state.score.home}–{state.score.visitor}
            </b>
          </span>
          <button
            className="btn primary"
            onClick={() =>
              append({
                type: 'SET_ENDED',
                setNumber: state.currentSet,
                endTime: new Date().toTimeString().slice(0, 5),
              })
            }
          >
            End set {state.currentSet}
          </button>
        </div>
      )}

      {/* Spatially mirrored: the operator never reads a label to know which team a
          button belongs to. */}
      <footer className="bar">
        <div className="side left">
          <button
            className="btn"
            disabled={state.teams.home.timeoutsUsed >= MAX_TIMEOUTS}
            onClick={() => append({ type: 'TIMEOUT', team: 'home' })}
          >
            Time out
          </button>
          <button className="btn ghost" onClick={() => append({ type: 'REPLAY' })}>
            Replay
          </button>
        </div>

        <div className="side center">
          <button className="btn" onClick={undoLast} disabled={!canUndo}>
            Undo
          </button>
          <div className="menu-wrap">
            <button
              className="btn ghost"
              onClick={(e) => {
                e.stopPropagation()
                setMenu((m) => !m)
              }}
            >
              ⋯
            </button>
            {menu && (
              <ul className="menu" onClick={(e) => e.stopPropagation()}>
                <li>
                  <button
                    onClick={() => {
                      append({ type: 'RESERVE' })
                      setMenu(false)
                    }}
                  >
                    Re-serve
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setAdding('home')
                      setMenu(false)
                    }}
                  >
                    Add player to {setup.home.name}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setAdding('visitor')
                      setMenu(false)
                    }}
                  >
                    Add player to {setup.visitor.name}
                  </button>
                </li>
                <li>
                  <button
                    disabled={!state.setInProgress}
                    onClick={() => {
                      append({
                        type: 'SET_ENDED',
                        setNumber: state.currentSet,
                        endTime: new Date().toTimeString().slice(0, 5),
                      })
                      setMenu(false)
                    }}
                  >
                    End set manually
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      onExport()
                      setMenu(false)
                    }}
                  >
                    Export match
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="side right">
          <button className="btn ghost" onClick={() => append({ type: 'REPLAY' })}>
            Replay
          </button>
          <button
            className="btn"
            disabled={state.teams.visitor.timeoutsUsed >= MAX_TIMEOUTS}
            onClick={() => append({ type: 'TIMEOUT', team: 'visitor' })}
          >
            Time out
          </button>
        </div>
      </footer>

      {adding && (
        <div className="sheet-modal" onClick={() => setAdding(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add a player to {setup[adding].name}</h2>
            <p className="faint">
              Adding a player mid-match reflows the roster row. Prefer entering opponent
              numbers during warmups.
            </p>
            <div className="add-player">
              <input
                className="num"
                inputMode="numeric"
                autoFocus
                placeholder="#"
                value={newNumber}
                maxLength={3}
                onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, ''))}
              />
              <span />
              <button
                className="btn primary"
                disabled={
                  !newNumber.trim() ||
                  state.rosters[adding].some((p) => p.number === newNumber.trim())
                }
                onClick={() => {
                  append({
                    type: 'ROSTER_ADD',
                    team: adding,
                    number: newNumber.trim(),
                    name: null,
                  })
                  setNewNumber('')
                  setAdding(null)
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {state.warnings.length > 0 && (
        <ul className="warnings">
          {state.warnings.slice(-2).map((w) => (
            <li key={w}>
              <b>⚠</b> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
