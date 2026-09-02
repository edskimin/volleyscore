import { useEffect, useState } from 'react'

import { initialPosition } from '../model/reducer'
import { lineupProblems } from '../model/lineup'
import {
  ROMAN,
  type CourtPosition,
  type EventBody,
  type MatchSetup,
  type SlotIndex,
  type TeamSide,
} from '../model/types'
import { derivePalette } from './palette'
import type { Theme } from './palette'
import './set-setup.css'

/**
 * The in-progress set setup. This lives in App rather than in this component: going to
 * edit the teams unmounts this screen, and a half-entered lineup must survive the trip.
 */
export interface SetDraft {
  setNumber: number
  lineups: Record<TeamSide, (string | null)[]>
  firstServe: TeamSide
  targetScore: number
  liberos: Record<TeamSide, string[]>
  sidesSwitched: boolean
}

interface Props {
  setup: MatchSetup
  draft: SetDraft
  onDraftChange: (next: SetDraft) => void
  setsWon: Record<TeamSide, number>
  theme: Theme
  onToggleTheme: () => void
  onBack: () => void
  onEditSetup: () => void
  onSheet: () => void
  onCloseout: () => void
  onStart: (body: EventBody) => void
}

const SIDES: TeamSide[] = ['home', 'visitor']
const GRID: Record<TeamSide, CourtPosition[]> = {
  home: [5, 4, 6, 3, 1, 2],
  visitor: [2, 1, 3, 6, 4, 5],
}
const FRONT: CourtPosition[] = [2, 3, 4]

function Triangle({ color }: { color: string }) {
  return (
    <svg
      width="1em"
      height="0.88em"
      viewBox="0 0 20 18"
      style={{ fontSize: '0.75em' }}
      aria-hidden="true"
    >
      <polygon points="10,1.5 18.5,16.5 1.5,16.5" fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

function Segment({
  label,
  options,
  current,
  onPick,
}: {
  label: string
  options: Array<{ v: string; t: string }>
  current: string
  onPick: (v: string) => void
}) {
  return (
    <div className="control">
      <span className="control-label">{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o.v} aria-pressed={o.v === current} onClick={() => onPick(o.v)}>
            {o.t}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SetSetupScreen({
  setup,
  draft,
  onDraftChange,
  setsWon,
  theme,
  onToggleTheme,
  onBack,
  onEditSetup,
  onSheet,
  onCloseout,
  onStart,
}: Props) {
  const { lineups, liberos, firstServe, targetScore, sidesSwitched } = draft
  /** Which slot the next chip fills. Transient, so it stays local. */
  const [active, setActive] = useState<Record<TeamSide, number>>({ home: 0, visitor: 0 })

  useEffect(() => {
    document.body.classList.add('stage-host')
    return () => document.body.classList.remove('stage-host')
  }, [])

  const patch = (p: Partial<SetDraft>) => onDraftChange({ ...draft, ...p })
  const complete = (side: TeamSide) =>
    lineupProblems(lineups[side], setup[side].name || side).length === 0
  const ready = complete('home') && complete('visitor')

  const needed = setup.format === 'best_of_5' ? 3 : 2
  const matchDecided = Math.max(setsWon.home, setsWon.visitor) >= needed

  /* Chip tap is the primary path: fill the active slot, advance. Six taps. */
  function tapChip(side: TeamSide, jersey: string) {
    // Only a free chip enters the six. A placed player is already in, and a
    // designated libero is not one of the six at all.
    if (chipState(side, jersey) !== 'free') return
    const i = active[side]
    const next = [...lineups[side]]
    next[i] = jersey
    patch({ lineups: { ...lineups, [side]: next } })
    setActive((a) => ({ ...a, [side]: nextEmptyIn(next, i + 1) }))
  }

  function nextEmptyIn(l: (string | null)[], from: number) {
    for (let i = 0; i < 6; i++) {
      const j = (from + i) % 6
      if (!l[j]) return j
    }
    return from % 6
  }

  function clear(side: TeamSide) {
    patch({ lineups: { ...lineups, [side]: [null, null, null, null, null, null] } })
    setActive((a) => ({ ...a, [side]: 0 }))
  }

  /** placed: already in the six. libero: designated, so not one of the six. */
  function chipState(side: TeamSide, jersey: string): 'placed' | 'libero' | 'free' {
    if (lineups[side].includes(jersey)) return 'placed'
    if (liberos[side].includes(jersey)) return 'libero'
    return 'free'
  }

  function toggleLibero(side: TeamSide, player: string) {
    const has = liberos[side].includes(player)
    if (has) {
      patch({ liberos: { ...liberos, [side]: liberos[side].filter((n) => n !== player) } })
      return
    }
    // A libero is not one of the six. Designating her clears her from the serve order
    // and puts the cursor back on the hole she left.
    const at = lineups[side].indexOf(player)
    patch({
      liberos: { ...liberos, [side]: [...liberos[side], player] },
      lineups:
        at === -1
          ? lineups
          : { ...lineups, [side]: lineups[side].map((n, i) => (i === at ? null : n)) },
    })
    if (at !== -1) setActive((a) => ({ ...a, [side]: at }))
  }

  function start() {
    onStart({
      type: 'SET_STARTED',
      setNumber: draft.setNumber,
      targetScore,
      firstServe,
      sidesSwitched,
      lineups: { home: lineups.home as string[], visitor: lineups.visitor as string[] },
      liberoDesignated: liberos,
      startTime: new Date().toTimeString().slice(0, 5),
    })
  }

  function renderCard(side: TeamSide) {
    const snap = setup[side]
    const p = derivePalette(snap.colorPrimary, theme)
    const lineup = lineups[side]
    const roster = [...snap.roster].sort((a, b) => Number(a.number) - Number(b.number))
    const designated = snap.roster.filter((r) => snap.liberoNumbers.includes(r.number))

    return (
      <section className="card" data-side={side} key={side}>
        <div className="card-head" style={{ borderBottomColor: p.base }}>
          <span className="card-role">{side === 'home' ? 'Home' : 'Visitor'}</span>
          <span className="card-name">{snap.name}</span>
        </div>

        <div className="card-body">
          <div className="order">
            {lineup.map((n, i) => (
              <button
                key={i}
                className="slot"
                data-active={active[side] === i}
                onClick={() => setActive((a) => ({ ...a, [side]: i }))}
              >
                <span className="slot-rn">{ROMAN[i]}</span>
                {n ? (
                  <span className="slot-num">{n}</span>
                ) : (
                  <span className="slot-empty">&mdash;</span>
                )}
                {firstServe === side && i === 0 && <span className="slot-first">first server</span>}
              </button>
            ))}
          </div>

          {/* Derived court. Reading it against the floor is what catches a mis-tap.
              initialPosition is the reducer's own rule, so what is previewed here is
              exactly what SET_STARTED will produce. */}
          <div className="preview">
            <div className="preview-label">On court</div>
            <div className="court">
              {GRID[side].map((pos) => {
                let idx = -1
                for (let i = 0; i < 6; i++) {
                  if (initialPosition(i as SlotIndex, firstServe === side) === pos) idx = i
                }
                const n = lineup[idx]
                return (
                  <div
                    key={pos}
                    className="pcell"
                    style={{ background: FRONT.includes(pos) ? p.cellFront : p.cellBack }}
                  >
                    <span className="pcell-rn" style={{ color: p.inkMuted }}>
                      {ROMAN[idx]}
                    </span>
                    <span className="pcell-num" style={{ color: n ? p.ink : p.inkMuted }}>
                      {n ?? '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="roster-label">
          Tap in serve order
          <button
            className="btn btn-quiet"
            style={{ marginLeft: '1cqh' }}
            onClick={() => clear(side)}
          >
            Clear
          </button>
        </div>
        <div className="roster">
          {roster.map((r) => {
            const st = chipState(side, r.number)
            return (
              <button
                key={r.number}
                className="chip"
                data-state={st}
                disabled={st !== 'free'}
                onClick={() => tapChip(side, r.number)}
              >
                {snap.liberoNumbers.includes(r.number) && (
                  <Triangle
                    color={st === 'free' ? 'var(--text-primary)' : 'var(--text-muted)'}
                  />
                )}
                {r.number}
              </button>
            )
          })}
        </div>

        {designated.length > 0 && (
          <div className="libero-row">
            <span className="control-label">Libero this set</span>
            {designated.map((r) => (
              <button
                key={r.number}
                className="lchip"
                aria-pressed={liberos[side].includes(r.number)}
                onClick={() => toggleLibero(side, r.number)}
              >
                <Triangle color="currentColor" />
                {r.number}
              </button>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="stage">
      <div className="app set-setup">
        <header className="rail">
          <div className="rail-left">
            <button className="btn" onClick={onBack}>
              Back
            </button>
            <span className="rail-title">Set {draft.setNumber}</span>
            {draft.setNumber > 1 && (
              <span className="rail-sub">
                Lineups carried over from set {draft.setNumber - 1}. Change what moved.
              </span>
            )}
          </div>
          <div className="rail-right">
            <button className="btn" onClick={onEditSetup}>
              Edit teams
            </button>
            {setsWon.home + setsWon.visitor > 0 && (
              <button className="btn" onClick={onSheet}>
                Sheet
              </button>
            )}
            <button className="btn" onClick={onToggleTheme}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            {matchDecided && (
              <button className="btn btn-primary" onClick={onCloseout}>
                Finish match
              </button>
            )}
            <button
              className={matchDecided ? 'btn' : 'btn btn-primary'}
              disabled={!ready}
              onClick={start}
            >
              Start set
            </button>
          </div>
        </header>

        <div className="controls">
          <Segment
            label="First serve"
            options={SIDES.map((s) => ({ v: s, t: setup[s].name || s }))}
            current={firstServe}
            onPick={(v) => patch({ firstServe: v as TeamSide })}
          />
          <Segment
            label="Play to"
            options={[
              { v: '15', t: '15' },
              { v: '25', t: '25' },
            ]}
            current={String(targetScore)}
            onPick={(v) => patch({ targetScore: Number(v) })}
          />
          <Segment
            label="Sides"
            options={[
              { v: 'same', t: 'As set 1' },
              { v: 'switched', t: 'Switched' },
            ]}
            current={sidesSwitched ? 'switched' : 'same'}
            onPick={(v) => patch({ sidesSwitched: v === 'switched' })}
          />
        </div>

        <main className="cards">{SIDES.map(renderCard)}</main>
      </div>
    </div>
  )
}
