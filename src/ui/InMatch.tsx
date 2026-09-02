import { useEffect, useMemo, useState } from 'react'

import { servingSlotIndex } from '../model/reducer'
import { ineligibleReason, resolveExchange } from '../model/selection'
import {
  MAX_SUBS,
  MAX_TIMEOUTS,
  type CourtPosition,
  type DerivedState,
  type EventBody,
  type MatchEvent,
  type MatchSetup,
  type Slot,
  type SlotIndex,
  type TeamSide,
} from '../model/types'
import './in-match.css'
import { derivePalette, type TeamPalette, type Theme } from './palette'

interface Props {
  setup: MatchSetup
  state: DerivedState
  events: MatchEvent[]
  append: (...bodies: EventBody[]) => void
  undoLast: () => void
  canUndo: boolean
  theme: Theme
  onToggleTheme: () => void
  onSheet: () => void
  onEditSetup: () => void
  onCloseout: () => void
  onSetEnded: () => void
  onAdjust: () => void
  onExport: () => void
  onHome: () => void
}

/* Court position to grid cell, row-major over two columns.
   Home has the net on its right, so its front column is on the right.
   Visitor mirrors, putting the two front rows against the divider. */
const GRID: Record<TeamSide, CourtPosition[]> = {
  home: [5, 4, 6, 3, 1, 2],
  visitor: [2, 1, 3, 6, 4, 5],
}
const FRONT_ROW: CourtPosition[] = [2, 3, 4]

type Selection =
  | { side: TeamSide; kind: 'chip'; value: string }
  | { side: TeamSide; kind: 'cell'; value: SlotIndex }
  | null

function Triangle({ em, color }: { em: string; color: string }) {
  return (
    <svg
      width="1em"
      height="0.88em"
      viewBox="0 0 20 18"
      style={{ fontSize: em }}
      aria-hidden="true"
    >
      <polygon points="10,1.5 18.5,16.5 1.5,16.5" fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

function BallIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a15 15 0 0 0 0 18" />
      <path d="M4 8a15 15 0 0 0 16 8" />
    </svg>
  )
}

const icons = {
  save: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M8 4v5h6" /><circle cx="12" cy="15" r="2" /></svg>
  ),
  timeout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4" /><path d="M9 2h6" /></svg>
  ),
  undo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 13L4 9l5-4" /><path d="M4 9h9a6 6 0 0 1 0 12h-3" /></svg>
  ),
  sheet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18" cy="12" r="1.7" /></svg>
  ),
}

/**
 * A budget shown by what was spent, not by a count. Each slot holds the score at the
 * moment that time out was called, calling team's score first, which is exactly what
 * the OHSAA time-out box wants. Filled means spent, empty means remaining.
 */
function TimeoutSlots({
  side,
  state,
  rule,
}: {
  side: TeamSide
  state: DerivedState
  rule: string
}) {
  const called = state.teams[side].timeoutScores
  return (
    <div className="to-slots">
      {Array.from({ length: MAX_TIMEOUTS }, (_, i) => {
        const t = called[i]
        return (
          <div
            key={i}
            className="to-slot"
            data-used={t !== undefined}
            style={{ borderColor: rule }}
          >
            {t ? `${t.calling}\u2013${t.opponent}` : ''}
          </div>
        )
      })}
    </div>
  )
}

const HINT =
  'Tap a score to award that team the point. Tap the same thing twice to clear a selection. ' +
  'Substitutions work in either direction: tap an available number then the player coming out, or tap ' +
  'a player on court then her replacement. A player who has already been on this set can only return ' +
  'to her own serve-order slot, shown on her chip, so other spots dim out. Dimmed means not tappable; ' +
  'use Fix lineup to override. Liberos are marked with a triangle and can only enter the back row. ' +
  'Libero replacements do not count against the 18.'

export default function InMatch(props: Props) {
  const { setup, state, events, append, undoLast, canUndo, theme } = props
  const [sel, setSel] = useState<Selection>(null)
  /** One overlay at a time. Null means the court is unobstructed. */
  type Overlay = 'menu' | 'add-home' | 'add-visitor'
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [newNumber, setNewNumber] = useState('')
  const [newName, setNewName] = useState('')

  const [clock, setClock] = useState(() => new Date().toTimeString().slice(0, 5))
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toTimeString().slice(0, 5)), 20_000)
    return () => clearInterval(id)
  }, [])

  // The stage owns the whole viewport while this screen is mounted.
  useEffect(() => {
    document.body.classList.add('stage-host')
    return () => document.body.classList.remove('stage-host')
  }, [])


  const palettes: Record<TeamSide, TeamPalette> = useMemo(
    () => ({
      home: derivePalette(setup.home.colorPrimary, theme),
      visitor: derivePalette(setup.visitor.colorPrimary, theme),
    }),
    [setup.home.colorPrimary, setup.visitor.colorPrimary, theme],
  )

  function exchange(side: TeamSide, player: string, slot: SlotIndex) {
    const result = resolveExchange(state.teams[side], side, player, slot)
    if (result.kind === 'blocked') return
    append(...result.events)
    setSel(null)
  }

  function tapChip(side: TeamSide, player: string) {
    if (sel?.kind === 'chip' && sel.side === side && sel.value === player) return setSel(null)
    if (sel?.kind === 'cell' && sel.side === side) return exchange(side, player, sel.value)
    setSel({ side, kind: 'chip', value: player })
  }

  function tapCell(side: TeamSide, slot: SlotIndex) {
    if (sel?.kind === 'cell' && sel.side === side && sel.value === slot) return setSel(null)
    if (sel?.kind === 'chip' && sel.side === side) return exchange(side, sel.value, slot)
    setSel({ side, kind: 'cell', value: slot })
  }

  const setLine =
    state.completedSets.map((s) => `${s.score.home}–${s.score.visitor}`).join(' · ') +
    (state.completedSets.length > 0 ? ' · ' : '') +
    'in progress'

  const endTime = () => new Date().toTimeString().slice(0, 5)
  const matchWinner: TeamSide = state.setsWon.home > state.setsWon.visitor ? 'home' : 'visitor'
  const matchEnded = events.some((e) => e.type === 'MATCH_ENDED')

  // A derived conclusion is announced, never enforced. The app can compute that a set
  // is over; only the first referee can decide it. So this is a status line and one
  // primary control, with the court live and undo reachable throughout.
  const setWinner: TeamSide | null =
    state.setComplete && state.setInProgress
      ? state.score.home > state.score.visitor
        ? 'home'
        : 'visitor'
      : null
  const matchOver = state.matchComplete && !matchEnded

  let status: string | null = null
  if (matchOver) {
    status =
      `${setup[matchWinner].name} wins the match, ` +
      `${Math.max(state.setsWon.home, state.setsWon.visitor)}\u2013` +
      `${Math.min(state.setsWon.home, state.setsWon.visitor)}`
  } else if (setWinner) {
    status =
      `${setup[setWinner].name} wins set ${state.currentSet}, ` +
      `${Math.max(state.score.home, state.score.visitor)}\u2013` +
      `${Math.min(state.score.home, state.score.visitor)}`
  }

  // Scrim tap and Escape both dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverlay(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const adding: TeamSide | null =
    overlay === 'add-home' ? 'home' : overlay === 'add-visitor' ? 'visitor' : null

  function renderPanel(side: TeamSide) {
    const t = state.teams[side]
    const snap = setup[side]
    const p = palettes[side]
    const serving = state.serveTeam === side
    const roster = [...state.rosters[side]].sort((a, b) => Number(a.number) - Number(b.number))
    const selCell = sel?.kind === 'cell' && sel.side === side ? sel.value : null
    const selChip = sel?.kind === 'chip' && sel.side === side ? sel.value : null
    const onCourtNumbers = new Set(t.slots.map((s) => s.current))
    const isLibero = (j: string) => t.liberoDesignated.includes(j)
    // A warning marks the object that is wrong and stays until the condition clears.
    const warned = new Set(
      state.warnings.filter((w) => w.side === side && w.target === 'slot').map((w) => w.slot),
    )
    const budgetSpent = state.warnings.some((w) => w.side === side && w.target === 'subs')
    const sideWarned = state.warnings.some((w) => w.side === side)

    const cells = GRID[side].map((pos) => {
      const idx = t.slots.findIndex((s) => s.position === pos) as SlotIndex
      const slot: Slot | undefined = t.slots[idx]
      if (!slot) return <div key={pos} className="cell" />
      const isServer = serving && pos === 1
      const selected = selCell === idx
      const active = selected || isServer
      const bg = active
        ? 'var(--cell-active-bg)'
        : FRONT_ROW.includes(pos)
          ? p.cellFront
          : p.cellBack
      const fg = active ? p.onActive : p.ink
      const sub = active ? p.inkFaint : p.inkMuted
      const blocked = selChip !== null && ineligibleReason(t, selChip, idx) !== null
      return (
        <button
          key={pos}
          className={warned.has(idx) ? 'cell warn' : 'cell'}
          style={{
            background: bg,
            ...(blocked ? { opacity: 0.28, cursor: 'default' } : null),
          }}
          disabled={blocked}
          onClick={() => tapCell(side, idx)}
        >
          <div className="cell-top" style={{ color: sub }}>
            {slot.rn}
            {isLibero(slot.current) && <Triangle em="1em" color={sub} />}
            {warned.has(idx) && <span className="cell-flag" />}
          </div>
          <div className="cell-bottom">
            <span className="cell-number" style={{ color: fg }}>
              {slot.current}
            </span>
            {slot.history.length > 0 ? (
              <span className="cell-history" style={{ color: sub }}>
                {slot.history.join(' ')}
              </span>
            ) : (
              <span />
            )}
          </div>
        </button>
      )
    })

    const chips = roster.map(({ number: j }) => {
      const here = onCourtNumbers.has(j)
      const selected = selChip === j
      const eligible = selCell === null || ineligibleReason(t, j, selCell) === null
      const state_ = here ? 'oncourt' : !eligible ? 'ineligible' : 'available'
      let bg: string
      let fg: string
      let bd = 'transparent'
      if (here) {
        bg = 'transparent'
        fg = p.inkMuted
        bd = p.rule
      } else if (selected) {
        bg = 'var(--cell-active-bg)'
        fg = p.onActive
      } else {
        bg = p.cellBack
        fg = p.ink
      }
      const origin = t.exitSlot[j]
      return (
        <button
          key={j}
          className="chip"
          data-state={state_}
          style={{ background: bg, color: fg, borderColor: bd }}
          disabled={here || !eligible}
          onClick={() => tapChip(side, j)}
        >
          {isLibero(j) && <Triangle em="0.75em" color={fg} />}
          {j}
          {!here && origin !== undefined && (
            <span className="chip-slot" style={{ color: selected ? p.inkFaint : p.inkMuted }}>
              {t.slots[origin].rn}
            </span>
          )}
        </button>
      )
    })

    const subs = Array.from({ length: MAX_SUBS }, (_, i) => {
      const u = t.subsUsed[i]
      const color = budgetSpent
        ? 'var(--flag-amber)'
        : u
          ? u.exceptional
            ? 'var(--flag-amber)'
            : p.ink
          : p.rule
      return (
        <span key={i} className="sub-n" style={{ color }}>
          {i + 1}
        </span>
      )
    })

    return (
      <section
        className="panel"
        data-side={side}
        aria-label={side === 'home' ? 'Home team' : 'Visiting team'}
        style={{ background: serving ? p.base : p.dim }}
      >
        <div className="panel-head">
          <span className="panel-name" style={{ color: p.ink }}>
            {snap.name}
            {sideWarned && <span className="head-flag" />}
          </span>
          <span className="panel-sets" style={{ color: p.inkMuted }}>
            sets {state.setsWon[side]}
          </span>
        </div>
        <div className="panel-body">
          <button className="score-block" onClick={() => append({ type: 'RALLY_WON', team: side })}>
            <span className="score-value" style={{ color: p.ink }}>
              {state.score[side]}
            </span>
            {/* Third of three serve indications: panel tint, inverted cell, this line. */}
            <span className="serve-line">
              {serving ? (
                <>
                  <BallIcon color={p.ink} />
                  <span style={{ color: p.ink }}>
                    serving #{t.slots[servingSlotIndex(t)].current}
                  </span>
                </>
              ) : (
                <span style={{ color: p.inkMuted }}>receiving</span>
              )}
            </span>
          </button>
          <div className="court">{cells}</div>
        </div>
        <div className="roster">{chips}</div>
        <div className="subs" style={{ borderTopColor: p.rule }}>
          {subs}
        </div>
      </section>
    )
  }

  return (
    <div className="stage">
      <div className="app in-match">
        <header className="rail">
          <div className="rail-left">
            <span className="rail-level">{setup.level === 'jv' ? 'JV' : setup.level}</span>
            <span className="rail-sets">{setLine}</span>
            <span className="rail-status" hidden={status === null}>
              {status}
            </span>
          </div>
          <div className="rail-right">
            {/* The one filled control in the app, and only ever one at a time. */}
            <button
              className="btn btn-primary"
              hidden={!matchOver && setWinner === null}
              style={{ padding: '0.9cqh 1.6cqh' }}
              onClick={() => {
                if (matchOver) {
                  append({ type: 'MATCH_ENDED', endTime: endTime() })
                  props.onCloseout()
                } else {
                  append({ type: 'SET_ENDED', setNumber: state.currentSet, endTime: endTime() })
                  props.onSetEnded()
                }
              }}
            >
              {matchOver ? 'end match' : 'end set'}
            </button>
            <span className="rail-clock">{clock}</span>
            <span className="rail-icon" title="Saved on this device" aria-label="Saved on this device">
              {icons.save}
            </span>
            <button
              className="btn"
              style={{ padding: '0.9cqh 1.6cqh' }}
              onClick={props.onToggleTheme}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        <main className="court-area">
          {renderPanel('home')}
          <div className="divider">
            <span className="divider-label">Set</span>
            <span className="divider-set">{state.currentSet}</span>
            <span className="divider-rule" />
            <span className="divider-match">
              {state.setsWon.home}&ndash;{state.setsWon.visitor}
            </span>
          </div>
          {renderPanel('visitor')}
        </main>

        <footer className="bar">
          <div className="bar-group">
            <button
              className="btn"
              style={{ borderColor: palettes.home.rule }}
              disabled={state.teams.home.timeoutsUsed >= MAX_TIMEOUTS}
              onClick={() => append({ type: 'TIMEOUT', team: 'home' })}
            >
              {icons.timeout}
              time out
            </button>
            <TimeoutSlots side="home" state={state} rule={palettes.home.rule} />
          </div>
          <div className="bar-group centre">
            <button className="btn" onClick={undoLast} disabled={!canUndo}>
              {icons.undo}
              undo
            </button>
            <button className="btn" onClick={props.onSheet}>
              {icons.sheet}
              sheet
            </button>
            <button
              className="btn"
              aria-label="More"
              onClick={() => setOverlay((v) => (v === 'menu' ? null : 'menu'))}
            >
              {icons.more}
            </button>
          </div>
          <div className="bar-group right">
            <TimeoutSlots side="visitor" state={state} rule={palettes.visitor.rule} />
            <button
              className="btn"
              style={{ borderColor: palettes.visitor.rule }}
              disabled={state.teams.visitor.timeoutsUsed >= MAX_TIMEOUTS}
              onClick={() => append({ type: 'TIMEOUT', team: 'visitor' })}
            >
              {icons.timeout}
              time out
            </button>
          </div>
        </footer>

        {/* Nothing that can appear mid-match may displace the court: a tap target
            that moves is a mis-recorded rally. Everything below floats above it. */}
        <div className="scrim" hidden={overlay === null} onClick={() => setOverlay(null)} />

        {/* One sheet element. Its anchor is the side of the thing it acts on, so the
            operator does not have to read the title to know which team changes. */}
        <div
          className={`sheet ${overlay === 'add-home' ? 'sheet-left' : 'sheet-right'}`}
          hidden={overlay === null}
          role="dialog"
          aria-label={adding ? `Add a player to ${setup[adding].name}` : 'How this screen works'}
        >
          {overlay === 'menu' && (
            <>
              <div className="sheet-title">How this screen works</div>
              {HINT}
              {state.warnings.length > 0 && (
                <div className="sheet-warnings">
                  {state.warnings.map((w) => (
                    <div key={w.text}>{w.text}</div>
                  ))}
                </div>
              )}
              <div className="sheet-menu">
                <button className="btn" onClick={() => { setOverlay(null); props.onAdjust() }}>
                  Fix lineup
                </button>
                <button className="btn" onClick={() => setOverlay('add-home')}>
                  Add player to {setup.home.name}
                </button>
                <button className="btn" onClick={() => setOverlay('add-visitor')}>
                  Add player to {setup.visitor.name}
                </button>
                {/* Neither is a team action: the mark goes in the current server's
                    box whoever caused it, so neither belongs in a mirrored group. */}
                <button className="btn" onClick={() => { setOverlay(null); append({ type: 'REPLAY' }) }}>
                  Replay
                </button>
                <button className="btn" onClick={() => { setOverlay(null); append({ type: 'RESERVE' }) }}>
                  Re-serve
                </button>
                {state.setInProgress && (
                  <button
                    className="btn"
                    onClick={() => {
                      setOverlay(null)
                      append({ type: 'SET_ENDED', setNumber: state.currentSet, endTime: endTime() })
                      props.onSetEnded()
                    }}
                  >
                    End set {state.currentSet} manually
                  </button>
                )}
                <button className="btn" onClick={() => { setOverlay(null); props.onEditSetup() }}>
                  Edit teams
                </button>
                <button className="btn" onClick={() => { setOverlay(null); props.onExport() }}>
                  Export
                </button>
                <button className="btn" onClick={() => { setOverlay(null); props.onCloseout() }}>
                  Finish match
                </button>
                <button className="btn" onClick={() => { setOverlay(null); props.onHome() }}>
                  Matches
                </button>
              </div>
            </>
          )}

          {adding && (
            <>
              <div className="sheet-title">Add a player to {setup[adding].name}</div>
              <div className="sheet-row">
                <input
                  className="field field-number"
                  inputMode="numeric"
                  autoFocus
                  placeholder="Number"
                  value={newNumber}
                  maxLength={3}
                  onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, ''))}
                />
                <input
                  className="field"
                  placeholder="Name, optional"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button className="btn" onClick={() => setOverlay(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={
                    !newNumber.trim() ||
                    state.rosters[adding].some((p) => p.number === newNumber.trim())
                  }
                  onClick={() => {
                    append({
                      type: 'ROSTER_ADD',
                      team: adding,
                      number: newNumber.trim(),
                      name: newName.trim() || null,
                    })
                    setNewNumber('')
                    setNewName('')
                    setOverlay(null)
                  }}
                >
                  Add
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
