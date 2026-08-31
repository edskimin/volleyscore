// The fold. See docs/01-data-model.md.
//
// Everything the app displays is derived by folding an append-only event log over
// the match setup. Undo is dropping the last event and re-folding; a full match is a
// few hundred events, so this is deliberately not incremental.

import {
  BACK_ROW,
  MAX_SUBS,
  OTHER,
  ROMAN,
  type CourtPosition,
  type DerivedState,
  type MatchEvent,
  type MatchSetup,
  type RosterPlayer,
  type SetResult,
  type PendingMark,
  type SheetMark,
  type SlotIndex,
  type Slot,
  type TeamSide,
  type TeamState,
} from './types'

// --- Rotation --------------------------------------------------------------

/** A team rotates only when it gains the serve, never on the first serve of a set. */
export function rotatedPosition(position: CourtPosition): CourtPosition {
  return (((position - 2 + 6) % 6) + 1) as CourtPosition
}

/**
 * Court position a slot occupies at the start of a set.
 *
 * The serving team's slot N sits at court position N. The receiving team's slot N
 * sits at position N+1, wrapping VI to position 1, because the receiving team rotates
 * once when it first wins the serve, which brings its slot I to position 1.
 */
export function initialPosition(slot: SlotIndex, serving: boolean): CourtPosition {
  return serving ? ((slot + 1) as CourtPosition) : (((slot + 1) % 6) + 1) as CourtPosition
}

export function servingSlotIndex(team: TeamState): SlotIndex {
  const i = team.slots.findIndex((s) => s.position === 1)
  return i as SlotIndex
}

function rotate(team: TeamState): void {
  for (const slot of team.slots) slot.position = rotatedPosition(slot.position)
}

/** Even passes black, odd passes red. Both teams change color at different points. */
export function passColor(pass: number): string {
  return pass % 2 === 0 ? '#111111' : '#C0272D'
}

function recomputePass(team: TeamState): void {
  // Clamped: a receiving team has not started a turn yet, but its first one is
  // pass 0, so it must never read as -1.
  team.rotationPass = Math.max(0, Math.floor((team.serviceTurns - 1) / 6))
}

// --- Construction ----------------------------------------------------------

function emptyTeamState(): TeamState {
  return {
    slots: [],
    serviceTurns: 0,
    rotationPass: 0,
    timeoutsUsed: 0,
    subsUsed: [],
    liberoOnCourt: null,
    liberoDesignated: [],
    liberoSlotLock: {},
    liberoOwes: {},
    exitSlot: {},
    timeoutScores: [],
    running: {},
    sheetRows: [[], [], [], [], [], []],
    comments: [],
  }
}

function startTeam(lineup: string[], liberos: string[], serving: boolean): TeamState {
  const team = emptyTeamState()
  team.liberoDesignated = liberos
  team.slots = lineup.slice(0, 6).map<Slot>((number, i) => ({
    rn: ROMAN[i],
    position: initialPosition(i as SlotIndex, serving),
    current: number,
    history: [],
    liberoServeFlag: false,
  }))
  // Counting the first-serving team's opening turn is what keeps the two teams'
  // pen colors aligned. See docs/01-data-model.md, "Service turn counting".
  team.serviceTurns = serving ? 1 : 0
  recomputePass(team)
  return team
}

// --- Sheet writing ---------------------------------------------------------

/**
 * Each box is one play or action, in chronological order, in the row of the player
 * currently serving. Marks take the color of the row-owning team's rotation pass.
 */
function appendMark(team: TeamState, slot: SlotIndex, mark: PendingMark): void {
  team.sheetRows[slot].push({ ...mark, pass: team.rotationPass } as SheetMark)
}

/** Append to whichever row the clock is currently in: the serving team's server. */
function appendToServingRow(state: DerivedState, mark: PendingMark): void {
  const serving = state.teams[state.serveTeam]
  appendMark(serving, servingSlotIndex(serving), mark)
}

// --- Libero ----------------------------------------------------------------

function liberoAtServe(team: TeamState): boolean {
  if (!team.liberoOnCourt) return false
  return team.slots[servingSlotIndex(team)].current === team.liberoOnCourt
}

/**
 * A libero may serve in only one serve order slot per set. Stamp the lock the first
 * time she is at court position 1 as her team gains serve. If she later reaches
 * position 1 in a different slot, flag it — do not block it. The R2 makes that call.
 */
function checkLiberoServeLock(state: DerivedState, side: TeamSide): void {
  const team = state.teams[side]
  if (!liberoAtServe(team)) return
  const libero = team.liberoOnCourt as string
  const slot = servingSlotIndex(team)
  const locked = team.liberoSlotLock[libero]
  if (locked === undefined) {
    team.liberoSlotLock[libero] = slot
    team.slots[slot].liberoServeFlag = true
  } else if (locked !== slot) {
    state.warnings.push(
      `Libero #${libero} (${side}) is set to serve from slot ${ROMAN[slot]}, but is ` +
        `locked to slot ${ROMAN[locked]} this set.`,
    )
  }
}

// --- Rally -----------------------------------------------------------------

function setIsWon(state: DerivedState): boolean {
  const { home, visitor } = state.score
  const hi = Math.max(home, visitor)
  return hi >= state.targetScore && Math.abs(home - visitor) >= 2
}

function applyRally(state: DerivedState, winner: TeamSide): void {
  const loser = OTHER[winner]
  state.score[winner] += 1

  const w = state.teams[winner]

  if (winner === state.serveTeam) {
    // Serve point.
    const triangled = liberoAtServe(w)
    appendMark(w, servingSlotIndex(w), {
      kind: 'point',
      value: state.score[winner],
      circled: false,
      triangled,
    })
    w.running[state.score[winner]] = {
      kind: triangled ? 'triangle' : 'slash',
      pass: w.rotationPass,
    }
  } else {
    // Side-out. The losing server's row closes, the winner rotates into a new turn.
    const l = state.teams[loser]
    appendMark(l, servingSlotIndex(l), { kind: 'endOfService' })

    rotate(w)
    w.serviceTurns += 1
    recomputePass(w)
    state.serveTeam = winner
    checkLiberoServeLock(state, winner)

    // A side-out point is won while receiving, so it can never be a libero point.
    appendMark(w, servingSlotIndex(w), {
      kind: 'point',
      value: state.score[winner],
      circled: true,
      triangled: false,
    })
    w.running[state.score[winner]] = { kind: 'circle', pass: w.rotationPass }
  }

  state.setComplete = setIsWon(state)
}

// --- Fold ------------------------------------------------------------------

export function fold(setup: MatchSetup, events: MatchEvent[]): DerivedState {
  const rosters: Record<TeamSide, RosterPlayer[]> = {
    home: setup.home.roster.map((p) => ({ ...p })),
    visitor: setup.visitor.roster.map((p) => ({ ...p })),
  }

  const state: DerivedState = {
    currentSet: 0,
    targetScore: 25,
    setsWon: { home: 0, visitor: 0 },
    score: { home: 0, visitor: 0 },
    serveTeam: 'home',
    sidesSwitched: false,
    setInProgress: false,
    setComplete: false,
    matchComplete: false,
    teams: { home: emptyTeamState(), visitor: emptyTeamState() },
    rosters,
    completedSets: [],
    warnings: [],
  }

  const setsNeeded = setup.format === 'best_of_5' ? 3 : 2
  let currentSetMeta: Omit<SetResult, 'winner' | 'endTime'> | null = null

  for (const ev of events) {
    switch (ev.type) {
      case 'SET_STARTED': {
        state.currentSet = ev.setNumber
        state.targetScore = ev.targetScore
        state.score = { home: 0, visitor: 0 }
        state.serveTeam = ev.firstServe
        state.sidesSwitched = ev.sidesSwitched
        state.setInProgress = true
        state.setComplete = false
        state.teams = {
          home: startTeam(
            ev.lineups.home,
            ev.liberoDesignated.home,
            ev.firstServe === 'home',
          ),
          visitor: startTeam(
            ev.lineups.visitor,
            ev.liberoDesignated.visitor,
            ev.firstServe === 'visitor',
          ),
        }
        currentSetMeta = {
          setNumber: ev.setNumber,
          targetScore: ev.targetScore,
          score: { home: 0, visitor: 0 },
          startTime: ev.startTime,
        }
        break
      }

      case 'RALLY_WON':
        applyRally(state, ev.team)
        break

      case 'SUBSTITUTION': {
        const team = state.teams[ev.team]
        const slot = team.slots[ev.slot]
        if (slot) {
          slot.history.push(slot.current)
          slot.current = ev.playerIn
          team.exitSlot[ev.playerOut] = ev.slot
          delete team.exitSlot[ev.playerIn]
        }
        team.subsUsed.push({
          playerIn: ev.playerIn,
          playerOut: ev.playerOut,
          slot: ev.slot,
          exceptional: ev.exceptional,
        })
        if (team.subsUsed.length > MAX_SUBS) {
          state.warnings.push(
            `${ev.team} has used ${team.subsUsed.length} substitutions, over the limit of ${MAX_SUBS}.`,
          )
        }
        if (ev.exceptional) {
          team.comments.push(
            `Exceptional sub ${ev.playerIn}/${ev.playerOut} (${state.score[ev.team]}-${state.score[OTHER[ev.team]]})`,
          )
        }
        appendToServingRow(state, {
          kind: 'sub',
          label: ev.team === state.serveTeam ? 'S' : 'SX',
          playerIn: ev.playerIn,
          playerOut: ev.playerOut,
        })
        break
      }

      case 'LIBERO_REPLACE': {
        const team = state.teams[ev.team]
        const slot = team.slots[ev.slot]
        if (ev.direction === 'in') {
          if (slot) {
            if (!BACK_ROW.includes(slot.position)) {
              state.warnings.push(
                `Libero #${ev.liberoNumber} (${ev.team}) entered at court position ${slot.position}, which is front row.`,
              )
            }
            slot.current = ev.liberoNumber
          }
          team.liberoOnCourt = ev.liberoNumber
          team.liberoOwes[ev.liberoNumber] = ev.playerNumber
        } else {
          if (slot) slot.current = ev.playerNumber
          if (team.liberoOnCourt === ev.liberoNumber) team.liberoOnCourt = null
          delete team.liberoOwes[ev.liberoNumber]
        }
        // Never a substitution. Consumes no box on the sheet.
        break
      }

      case 'TIMEOUT': {
        const team = state.teams[ev.team]
        team.timeoutsUsed += 1
        team.timeoutScores.push({
          calling: state.score[ev.team],
          opponent: state.score[OTHER[ev.team]],
        })
        appendToServingRow(state, {
          kind: 'timeout',
          label: ev.team === state.serveTeam ? 'T' : 'TX',
        })
        break
      }

      case 'REPLAY':
        appendToServingRow(state, { kind: 'replay' })
        break

      case 'RESERVE':
        appendToServingRow(state, { kind: 'reserve' })
        break

      case 'ROSTER_ADD':
        if (!rosters[ev.team].some((p) => p.number === ev.number)) {
          rosters[ev.team].push({ number: ev.number, name: ev.name, captain: false })
        }
        break

      case 'ADJUSTMENT': {
        if (ev.team && ev.slotAssignments) {
          const team = state.teams[ev.team]
          for (const [key, number] of Object.entries(ev.slotAssignments)) {
            const slot = team.slots[Number(key)]
            if (slot && slot.current !== number) {
              slot.history.push(slot.current)
              slot.current = number
            }
          }
        }
        if (ev.team && ev.liberoState) {
          const team = state.teams[ev.team]
          team.liberoOnCourt = ev.liberoState.onCourt
          team.liberoOwes = { ...ev.liberoState.owes }
          team.liberoSlotLock = { ...ev.liberoState.slotLock }
          for (const [i, slot] of team.slots.entries()) {
            slot.liberoServeFlag = Object.values(ev.liberoState.slotLock).includes(
              i as SlotIndex,
            )
          }
        }
        if (ev.serveTeam) state.serveTeam = ev.serveTeam
        if (ev.serveSlot !== null) {
          // Move the serve pointer by rotating until the named slot is at position 1.
          const team = state.teams[state.serveTeam]
          for (let i = 0; i < 6 && servingSlotIndex(team) !== ev.serveSlot; i++) rotate(team)
        }
        if (ev.countAgainstSubs && ev.team) {
          state.teams[ev.team].subsUsed.push({
            playerIn: '',
            playerOut: '',
            slot: 0,
            exceptional: true,
          })
        }
        if (ev.team) state.teams[ev.team].comments.push(ev.note)
        else {
          state.teams.home.comments.push(ev.note)
          state.teams.visitor.comments.push(ev.note)
        }
        state.setComplete = setIsWon(state)
        break
      }

      case 'SET_ENDED': {
        const winner: TeamSide = state.score.home > state.score.visitor ? 'home' : 'visitor'
        state.setsWon[winner] += 1
        state.completedSets.push({
          setNumber: currentSetMeta?.setNumber ?? ev.setNumber,
          targetScore: currentSetMeta?.targetScore ?? state.targetScore,
          score: { ...state.score },
          winner,
          startTime: currentSetMeta?.startTime ?? '',
          endTime: ev.endTime,
        })
        state.setInProgress = false
        currentSetMeta = null
        break
      }

      case 'MATCH_ENDED':
        // A state change, not a termination. Undo must walk back through it.
        state.matchComplete = true
        break
    }
  }

  if (state.setsWon.home >= setsNeeded || state.setsWon.visitor >= setsNeeded) {
    state.matchComplete = true
  }

  return state
}

/** Undo is dropping the last event and re-folding. */
export function undo(events: MatchEvent[]): MatchEvent[] {
  return events.slice(0, -1)
}
