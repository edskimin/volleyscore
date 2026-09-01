import { useState } from 'react'

import { servingSlotIndex } from '../model/reducer'
import {
  ROMAN,
  type DerivedState,
  type EventBody,
  type MatchSetup,
  type SlotIndex,
  type TeamSide,
} from '../model/types'

interface Props {
  setup: MatchSetup
  state: DerivedState
  onCancel: () => void
  onApply: (events: EventBody[]) => void
}

const SIDES: TeamSide[] = ['home', 'visitor']

export default function Adjustment({ setup, state, onCancel, onApply }: Props) {
  const [slots, setSlots] = useState<Record<TeamSide, string[]>>(() => ({
    home: state.teams.home.slots.map((s) => s.current),
    visitor: state.teams.visitor.slots.map((s) => s.current),
  }))
  const [owes, setOwes] = useState<Record<TeamSide, Record<string, string>>>(() => ({
    home: { ...state.teams.home.liberoOwes },
    visitor: { ...state.teams.visitor.liberoOwes },
  }))
  const [clearLock, setClearLock] = useState<Record<TeamSide, boolean>>({
    home: false,
    visitor: false,
  })
  const [serveTeam, setServeTeam] = useState<TeamSide>(state.serveTeam)
  const [serveSlot, setServeSlot] = useState<SlotIndex>(
    servingSlotIndex(state.teams[state.serveTeam]),
  )
  const [note, setNote] = useState(`(${state.score.home}-${state.score.visitor}) `)
  const [countSubs, setCountSubs] = useState<boolean | null>(null)
  const [picking, setPicking] = useState<{ side: TeamSide; slot: number } | null>(null)

  const originalServeSlot = servingSlotIndex(state.teams[state.serveTeam])
  const serveChanged = serveTeam !== state.serveTeam || serveSlot !== originalServeSlot

  const slotsChanged = (side: TeamSide) =>
    slots[side].some((n, i) => n !== state.teams[side].slots[i].current)
  const liberoChanged = (side: TeamSide) =>
    clearLock[side] ||
    JSON.stringify(owes[side]) !== JSON.stringify(state.teams[side].liberoOwes)

  const changedSides = SIDES.filter((s) => slotsChanged(s) || liberoChanged(s))
  const anyChange = changedSides.length > 0 || serveChanged
  const needsSubAnswer = changedSides.length > 0
  const ready = anyChange && note.trim() !== '' && (!needsSubAnswer || countSubs !== null)

  function assign(side: TeamSide, slot: number, player: string) {
    setSlots((prev) => {
      const displaced = prev[side][slot]
      const next = [...prev[side]]
      next[slot] = player
      // Placing a libero implies she is standing in for whoever was in that slot;
      // the operator can correct that below if the inference is wrong.
      if (state.teams[side].liberoDesignated.includes(player) && displaced !== player) {
        setOwes((o) => ({ ...o, [side]: { ...o[side], [player]: displaced } }))
      }
      return { ...prev, [side]: next }
    })
    setPicking(null)
  }

  function apply() {
    const events: EventBody[] = []
    const trimmed = note.trim()

    const liberoStateFor = (side: TeamSide) => {
      const designated = state.teams[side].liberoDesignated
      const onCourt = slots[side].find((n) => designated.includes(n)) ?? null
      return {
        onCourt,
        owes: onCourt ? { [onCourt]: owes[side][onCourt] ?? '' } : {},
        slotLock: clearLock[side]
          ? {}
          : (state.teams[side].liberoSlotLock as Record<string, SlotIndex>),
      }
    }

    if (changedSides.length === 0) {
      events.push({
        type: 'ADJUSTMENT',
        team: null,
        slotAssignments: null,
        serveTeam,
        serveSlot,
        liberoState: null,
        countAgainstSubs: false,
        note: trimmed,
      })
    } else {
      changedSides.forEach((side, i) => {
        const assignments: Record<string, string> = {}
        slots[side].forEach((n, idx) => {
          if (n !== state.teams[side].slots[idx].current) assignments[String(idx)] = n
        })
        events.push({
          type: 'ADJUSTMENT',
          team: side,
          slotAssignments: Object.keys(assignments).length > 0 ? assignments : null,
          // The serve pointer is match level, so it rides on the first event only.
          serveTeam: i === 0 && serveChanged ? serveTeam : null,
          serveSlot: i === 0 && serveChanged ? serveSlot : null,
          liberoState: liberoStateFor(side),
          countAgainstSubs: i === 0 && countSubs === true,
          note: trimmed,
        })
      })
    }
    onApply(events)
  }

  return (
    <div className="screen screen-scroll setup adjust">
      <div className="topbar">
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <h1>Fix lineup</h1>
        <div className="spacer" />
        <button className="btn primary lg" onClick={apply} disabled={!ready}>
          Apply
        </button>
      </div>

      <section className="card adjust-intro">
        <p>
          Normal rules are off in here. Make as many changes as you need, then apply them
          together, so undo puts everything back in one step.
        </p>
        <ul>
          <li>
            <b>Wrong player in a slot.</b> A missed or mis-tapped substitution, a libero
            exchange that was not caught, or a starting lineup entered wrong.
          </li>
          <li>
            <b>Wrong slot serving.</b> First serve given to the wrong team, or a rally
            recorded against the wrong team.
          </li>
        </ul>
        <p className="warn-line">
          A rally that was never recorded cannot be fixed here. Add the missing point on
          the match screen instead, or the running score and the service rows will
          disagree.
        </p>
      </section>

      <div className="team-grid">
        {SIDES.map((side) => {
          const team = state.teams[side]
          const snap = setup[side]
          const onCourtLibero = slots[side].find((n) => team.liberoDesignated.includes(n))
          const lock = Object.entries(team.liberoSlotLock)[0]
          return (
            <section key={side} className="card lineup-editor">
              <header style={{ borderColor: snap.colorPrimary }}>
                <span className="eyebrow">{side}</span>
                <b>{snap.name}</b>
                {slotsChanged(side) && <span className="badge quiet">edited</span>}
              </header>

              <div className="slots">
                {ROMAN.map((rn, i) => {
                  const changed = slots[side][i] !== team.slots[i].current
                  return (
                    <button
                      key={rn}
                      className={`slot filled${changed ? ' changed' : ''}${
                        picking?.side === side && picking.slot === i ? ' selected' : ''
                      }`}
                      onClick={() =>
                        setPicking(
                          picking?.side === side && picking.slot === i
                            ? null
                            : { side, slot: i },
                        )
                      }
                    >
                      <em>
                        {rn} · pos {team.slots[i].position}
                      </em>
                      <b className="num">{slots[side][i]}</b>
                      {changed && <i>was {team.slots[i].current}</i>}
                    </button>
                  )
                })}
              </div>

              {picking?.side === side && (
                <div className="picker">
                  {/* No dimming: this is the mode where the rules are suspended. */}
                  {state.rosters[side].map((p) => (
                    <button
                      key={p.number}
                      className={`chip${slots[side].includes(p.number) ? ' used' : ''}`}
                      onClick={() => assign(side, picking.slot, p.number)}
                      style={
                        slots[side].includes(p.number)
                          ? { background: snap.colorPrimary, color: snap.colorText }
                          : undefined
                      }
                    >
                      <span className="num">{p.number}</span>
                    </button>
                  ))}
                </div>
              )}

              {onCourtLibero && (
                <div className="field">
                  <label>Libero #{onCourtLibero} is standing in for</label>
                  <select
                    value={owes[side][onCourtLibero] ?? ''}
                    onChange={(e) =>
                      setOwes((o) => ({
                        ...o,
                        [side]: { ...o[side], [onCourtLibero]: e.target.value },
                      }))
                    }
                  >
                    <option value="">—</option>
                    {state.rosters[side]
                      .filter((p) => !team.liberoDesignated.includes(p.number))
                      .map((p) => (
                        <option key={p.number} value={p.number}>
                          #{p.number}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {lock && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={clearLock[side]}
                    onChange={(e) =>
                      setClearLock((c) => ({ ...c, [side]: e.target.checked }))
                    }
                  />
                  Clear libero #{lock[0]} serve lock on slot {ROMAN[lock[1]]}
                </label>
              )}
            </section>
          )
        })}
      </div>

      <section className="card serve-fix">
        <div className="field">
          <label>Serving team</label>
          <div className="seg">
            {SIDES.map((side) => (
              <button
                key={side}
                aria-pressed={serveTeam === side}
                onClick={() => setServeTeam(side)}
              >
                {setup[side].name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Serving slot</label>
          <div className="seg">
            {ROMAN.map((rn, i) => (
              <button
                key={rn}
                aria-pressed={serveSlot === i}
                onClick={() => setServeSlot(i as SlotIndex)}
              >
                {rn}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card confirm">
        <div className="field">
          <label>Note (goes in the comments on the sheet)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was corrected"
          />
        </div>
        {needsSubAnswer && (
          <div className="field">
            <label>Count this against substitutions?</label>
            <div className="seg">
              <button aria-pressed={countSubs === false} onClick={() => setCountSubs(false)}>
                No, a correction
              </button>
              <button aria-pressed={countSubs === true} onClick={() => setCountSubs(true)}>
                Yes, a real substitution
              </button>
            </div>
            <p className="faint small">
              The app cannot tell a genuine exceptional substitution from a mis-tap being
              corrected, so it asks.
            </p>
          </div>
        )}
        {!anyChange && <p className="faint">Nothing has been changed yet.</p>}
      </section>
    </div>
  )
}
