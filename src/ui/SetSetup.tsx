import { useMemo, useState } from 'react'

import { lineupProblemSlots, lineupProblems } from '../model/lineup'
import { ROMAN, type EventBody, type MatchSetup, type TeamSide } from '../model/types'

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
  onBack: () => void
  onEditSetup: () => void
  onSheet: () => void
  onCloseout: () => void
  onStart: (body: EventBody) => void
}

function LineupEditor({
  side,
  setup,
  lineup,
  liberos,
  onAssign,
  onToggleLibero,
  problemSlots,
  showProblems,
}: {
  side: TeamSide
  setup: MatchSetup
  lineup: (string | null)[]
  liberos: string[]
  onAssign: (slot: number, player: string | null) => void
  onToggleLibero: (player: string) => void
  problemSlots: Set<number>
  showProblems: boolean
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const team = setup[side]

  // A libero cannot be a starter; she replaces someone already on court.
  const assignable = team.roster.filter((p) => !liberos.includes(p.number))
  const designated = team.roster.filter((p) => team.liberoNumbers.includes(p.number))

  function tapPlayer(number: string) {
    if (selected === null) return
    // One call, because the parent owns the draft: clearing the old slot and filling
    // the new one as two updates would both derive from the same stale draft, the
    // clear would be lost, and the player would end up in two slots at once.
    onAssign(selected, number)
    const next = lineup.findIndex((v, i) => i > selected && v === null)
    setSelected(next >= 0 ? next : null)
  }

  return (
    <section className="card lineup-editor">
      <header style={{ borderColor: team.colorPrimary }}>
        <span className="eyebrow">{side}</span>
        <b>{team.name}</b>
      </header>

      <div className="slots">
        {ROMAN.map((rn, i) => (
          <button
            key={rn}
            className={[
              'slot',
              lineup[i] ? 'filled' : '',
              selected === i ? 'selected' : '',
              showProblems && problemSlots.has(i) ? 'problem' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setSelected(selected === i ? null : i)}
          >
            <em>{rn}</em>
            <b className="num">{lineup[i] ?? '·'}</b>
            {i === 0 && <i>first server</i>}
          </button>
        ))}
      </div>

      <div className="picker">
        {assignable.map((p) => {
          const used = lineup.includes(p.number)
          return (
            <button
              key={p.number}
              className={`chip${used ? ' used' : ''}`}
              disabled={selected === null}
              onClick={() => tapPlayer(p.number)}
              style={used ? { background: team.colorPrimary, color: team.colorText } : undefined}
            >
              <span className="num">{p.number}</span>
              {p.captain && <i>c</i>}
            </button>
          )
        })}
      </div>

      {designated.length > 0 && (
        <div className="libero-row">
          <span className="eyebrow">Libero this set</span>
          {designated.map((p) => (
            <button
              key={p.number}
              className={`chip libero${liberos.includes(p.number) ? ' on' : ''}`}
              onClick={() => onToggleLibero(p.number)}
            >
              <span className="num">{p.number}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default function SetSetupScreen({
  setup,
  draft,
  onDraftChange,
  setsWon,
  onBack,
  onEditSetup,
  onSheet,
  onCloseout,
  onStart,
}: Props) {
  const [showProblems, setShowProblems] = useState(false)
  const { lineups, liberos, firstServe, targetScore, sidesSwitched } = draft
  const patch = (p: Partial<SetDraft>) => onDraftChange({ ...draft, ...p })

  const problemSlots = useMemo(
    () => ({
      home: lineupProblemSlots(lineups.home),
      visitor: lineupProblemSlots(lineups.visitor),
    }),
    [lineups],
  )

  /** What is stopping the set from starting, in words. */
  const problems = useMemo(
    () =>
      (['home', 'visitor'] as TeamSide[]).flatMap((side) =>
        lineupProblems(lineups[side], setup[side].name || side),
      ),
    [lineups, setup],
  )

  const complete = problems.length === 0

  // A decided match still offers another set, in case the result needs correcting,
  // but closing out is the primary action once it is.
  const needed = setup.format === 'best_of_5' ? 3 : 2
  const matchDecided = Math.max(setsWon.home, setsWon.visitor) >= needed

  function assign(side: TeamSide, slot: number, player: string | null) {
    const next = [...lineups[side]]
    // Placing a player who already holds another slot moves her rather than
    // duplicating her, so a mis-tap is one tap to fix.
    if (player !== null) {
      const existing = next.indexOf(player)
      if (existing >= 0 && existing !== slot) next[existing] = null
    }
    next[slot] = player
    patch({ lineups: { ...lineups, [side]: next } })
  }

  function toggleLibero(side: TeamSide, player: string) {
    const has = liberos[side].includes(player)
    patch({
      liberos: {
        ...liberos,
        [side]: has ? liberos[side].filter((n) => n !== player) : [...liberos[side], player],
      },
      // Designating a libero pulls her out of the starting six if she was placed there.
      lineups: has
        ? lineups
        : { ...lineups, [side]: lineups[side].map((n) => (n === player ? null : n)) },
    })
  }

  function start() {
    setShowProblems(false)
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

  return (
    <div className="screen screen-scroll setup">
      <div className="topbar">
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
        <h1>
          Set {draft.setNumber}
          {setsWon.home + setsWon.visitor > 0 && (
            <span className="muted num">
              {' '}
              · {setsWon.home}–{setsWon.visitor}
            </span>
          )}
        </h1>
        <div className="spacer" />
        <button className="btn ghost" onClick={onEditSetup}>
          Edit teams
        </button>
        {setsWon.home + setsWon.visitor > 0 && (
          <button className="btn ghost" onClick={onSheet}>
            Sheet
          </button>
        )}
        {matchDecided && (
          <button className="btn primary lg" onClick={onCloseout}>
            Finish match
          </button>
        )}
        {/* Always clickable: a dead button cannot say what is wrong with the lineup. */}
        <button
          className={matchDecided ? 'btn lg' : 'btn primary lg'}
          onClick={() => (complete ? start() : setShowProblems(true))}
          aria-disabled={!complete}
        >
          Start set
        </button>
      </div>

      <div className="set-controls card">
        <div className="field">
          <label>First serve</label>
          <div className="seg">
            {(['home', 'visitor'] as TeamSide[]).map((side) => (
              <button
                key={side}
                aria-pressed={firstServe === side}
                onClick={() => patch({ firstServe: side })}
              >
                {setup[side].name || side}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Play to</label>
          <div className="seg">
            {[15, 25].map((n) => (
              <button
                key={n}
                className="num"
                aria-pressed={targetScore === n}
                onClick={() => patch({ targetScore: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Sides</label>
          <div className="seg">
            <button
              aria-pressed={!sidesSwitched}
              onClick={() => patch({ sidesSwitched: false })}
            >
              As set 1
            </button>
            <button aria-pressed={sidesSwitched} onClick={() => patch({ sidesSwitched: true })}>
              Switched
            </button>
          </div>
        </div>
      </div>

      {showProblems && !complete && (
        <div className="card problems" role="alert">
          <b>The set cannot start yet</b>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="faint requirement">
        Lineups are entered by serve order, not court position. Slot I serves first.
      </p>

      <div className="team-grid">
        {(['home', 'visitor'] as TeamSide[]).map((side) => (
          <LineupEditor
            key={side}
            side={side}
            setup={setup}
            lineup={lineups[side]}
            liberos={liberos[side]}
            onAssign={(slot, player) => assign(side, slot, player)}
            onToggleLibero={(player) => toggleLibero(side, player)}
            problemSlots={problemSlots[side]}
            showProblems={showProblems}
          />
        ))}
      </div>
    </div>
  )
}
