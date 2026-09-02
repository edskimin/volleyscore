import { describe, expect, it } from 'vitest'

import {
  dropCurrentSet,
  fold,
  foldThroughSet,
  initialPosition,
  isDecidingSet,
  rotatedPosition,
  servingSlotIndex,
  undo,
} from './reducer'
import type { CourtPosition, MatchEvent, MatchSetup, SlotIndex, TeamSide } from './types'

// --- Fixtures --------------------------------------------------------------

const HOME_LINEUP = ['12', '7', '21', '4', '15', '9']
const VISITOR_LINEUP = ['3', '11', '8', '22', '6', '14']

function roster(numbers: string[], liberos: string[] = []) {
  return [...numbers, ...liberos].map((number) => ({
    number,
    name: null,
    captain: false,
  }))
}

function setup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
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
      roster: roster([...HOME_LINEUP, '2', '5'], ['30']),
      liberoNumbers: ['30'],
    },
    visitor: {
      teamId: null,
      name: 'Amherst',
      colorPrimary: '#7A1120',
      colorText: '#FFFFFF',
      roster: roster([...VISITOR_LINEUP, '27']),
      liberoNumbers: [],
    },
    ...overrides,
  }
}

let seq = 0
function ev<T extends Omit<MatchEvent, 'seq' | 'ts'>>(e: T): MatchEvent {
  seq += 1
  return { seq, ts: `2026-10-14T18:${String(seq % 60).padStart(2, '0')}:00Z`, ...e } as MatchEvent
}

function setStarted(firstServe: TeamSide, liberos: Record<TeamSide, string[]> = { home: [], visitor: [] }) {
  seq = 0
  return ev({
    type: 'SET_STARTED',
    setNumber: 1,
    targetScore: 25,
    firstServe,
    leftTeam: 'home',
    lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
    liberoDesignated: liberos,
    startTime: '18:00',
  })
}

const rally = (team: TeamSide) => ev({ type: 'RALLY_WON', team })

// --- Rotation primitives ---------------------------------------------------

describe('rotation primitives', () => {
  it('rotates each position back by one, wrapping 1 to 6', () => {
    const all: CourtPosition[] = [1, 2, 3, 4, 5, 6]
    expect(all.map(rotatedPosition)).toEqual([6, 1, 2, 3, 4, 5])
  })

  it('seats the serving team slot N at court position N', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => initialPosition(i as SlotIndex, true))).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
  })

  it('seats the receiving team slot N at position N+1, wrapping VI to 1', () => {
    // The receiving team's slot I is right front (position 2) at the start of a set;
    // it reaches position 1 after the single rotation earned by its first side-out.
    expect([0, 1, 2, 3, 4, 5].map((i) => initialPosition(i as SlotIndex, false))).toEqual([
      2, 3, 4, 5, 6, 1,
    ])
  })
})

// --- Service turn counting -------------------------------------------------

describe('service turn counting', () => {
  it('credits the first-serving team with its opening turn', () => {
    const s = fold(setup(), [setStarted('home')])
    expect(s.teams.home.serviceTurns).toBe(1)
    expect(s.teams.visitor.serviceTurns).toBe(0)
    expect(s.teams.home.rotationPass).toBe(0)
  })

  it('does not rotate the serving team into its own first serve', () => {
    const s = fold(setup(), [setStarted('home')])
    expect(s.teams.home.slots[0].position).toBe(1)
    expect(servingSlotIndex(s.teams.home)).toBe(0)
  })

  // The regression test for the off-by-one. Alternating rally winners give each team
  // consecutive service turns, so both teams walk slots I..VI in lockstep. Pen color
  // must flip for each team exactly when its slot I comes back up, and not before.
  it('flips rotation pass for both teams only when slot I returns', () => {
    const events: MatchEvent[] = [setStarted('home')]
    const observed: Array<{ team: TeamSide; slot: number; pass: number }> = []

    const observe = (s: ReturnType<typeof fold>) => {
      const t = s.teams[s.serveTeam]
      observed.push({ team: s.serveTeam, slot: servingSlotIndex(t), pass: t.rotationPass })
    }

    // Home's opening turn is granted by SET_STARTED, before any rally is played.
    observe(fold(setup(), events))

    // Strictly alternating winners flip the serve every rally, so each rally starts a
    // new service turn and walks both teams through slots I..VI and back to I.
    for (let i = 0; i < 28; i++) {
      events.push(rally(i % 2 === 0 ? 'visitor' : 'home'))
      observe(fold(setup(), events))
    }

    for (const side of ['home', 'visitor'] as TeamSide[]) {
      const turns = observed.filter((o) => o.team === side)
      // Each team's first six turns are slots I..VI, all in pass 0.
      expect(turns.slice(0, 6).map((t) => t.slot)).toEqual([0, 1, 2, 3, 4, 5])
      expect(turns.slice(0, 6).map((t) => t.pass)).toEqual([0, 0, 0, 0, 0, 0])
      // The seventh turn is slot I again, and only there does the color change.
      expect(turns[6].slot).toBe(0)
      expect(turns[6].pass).toBe(1)
    }
  })
})

// --- Rally resolution ------------------------------------------------------

describe('rally resolution', () => {
  it('records a serve point as a plain number in the current server row', () => {
    const s = fold(setup(), [setStarted('home'), rally('home')])
    expect(s.score).toEqual({ home: 1, visitor: 0 })
    expect(s.serveTeam).toBe('home')
    expect(s.teams.home.sheetRows[0]).toEqual([
      { kind: 'point', value: 1, circled: false, triangled: false, pass: 0 },
    ])
    expect(s.teams.home.running[1]).toEqual({ kind: 'slash', pass: 0 })
  })

  it('closes the losing server row and circles the side-out point', () => {
    const s = fold(setup(), [setStarted('home'), rally('visitor')])
    expect(s.serveTeam).toBe('visitor')
    // The home server's row takes the end-of-service mark.
    expect(s.teams.home.sheetRows[0]).toEqual([{ kind: 'endOfService', pass: 0 }])
    // The visitor rotated, bringing slot I to position 1, and its point is circled.
    expect(servingSlotIndex(s.teams.visitor)).toBe(0)
    expect(s.teams.visitor.sheetRows[0]).toEqual([
      { kind: 'point', value: 1, circled: true, triangled: false, pass: 0 },
    ])
    expect(s.teams.visitor.running[1]).toEqual({ kind: 'circle', pass: 0 })
  })

  it('ends a set at the target score with a two point lead, and not before', () => {
    const events: MatchEvent[] = [setStarted('home')]
    for (let i = 0; i < 24; i++) events.push(rally('home'))
    for (let i = 0; i < 24; i++) events.push(rally('visitor'))
    expect(fold(setup(), events).setComplete).toBe(false) // 24-24

    events.push(rally('home'))
    expect(fold(setup(), events).setComplete).toBe(false) // 25-24, no two point lead
    events.push(rally('home'))
    expect(fold(setup(), events).setComplete).toBe(true) // 26-24
  })
})

// --- Box-consuming events --------------------------------------------------

describe('box-consuming events', () => {
  it('writes an opponent timeout into the serving team row as TX', () => {
    const s = fold(setup(), [
      setStarted('home'),
      rally('home'),
      ev({ type: 'TIMEOUT', team: 'visitor' }),
    ])
    // The clock is in the home server's row, even though the visitor called it.
    expect(s.teams.home.sheetRows[0][1]).toEqual({ kind: 'timeout', label: 'TX', pass: 0 })
    expect(s.teams.visitor.sheetRows.flat()).toEqual([])
    expect(s.teams.visitor.timeoutsUsed).toBe(1)
    expect(s.teams.visitor.timeoutScores).toEqual([{ calling: 0, opponent: 1 }])
  })

  it('writes a receiving team substitution into the serving team row as SX', () => {
    const s = fold(setup(), [
      setStarted('home'),
      ev({
        type: 'SUBSTITUTION',
        team: 'visitor',
        playerIn: '27',
        playerOut: '22',
        slot: 3,
        exceptional: false,
      }),
    ])
    expect(s.teams.home.sheetRows[0]).toEqual([
      { kind: 'sub', label: 'SX', playerIn: '27', playerOut: '22', pass: 0 },
    ])
    expect(s.teams.visitor.slots[3].current).toBe('27')
    expect(s.teams.visitor.slots[3].history).toEqual(['22'])
    expect(s.teams.visitor.exitSlot['22']).toBe(3)
    expect(s.teams.visitor.subsUsed).toHaveLength(1)
  })

  it('consumes no box for a libero replacement and does not count it as a sub', () => {
    const s = fold(setup(), [
      setStarted('home', { home: ['30'], visitor: [] }),
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 4,
        playerNumber: '15',
      }),
    ])
    expect(s.teams.home.sheetRows.flat()).toEqual([])
    expect(s.teams.home.subsUsed).toEqual([])
    expect(s.teams.home.slots[4].current).toBe('30')
    expect(s.teams.home.liberoOwes['30']).toBe('15')
  })
})

// --- Libero ----------------------------------------------------------------

describe('libero', () => {
  it('locks the serve slot on first serve and triangles her points', () => {
    // Home slot V holds the libero. Alternating rallies walk home to slot V serving.
    const events: MatchEvent[] = [setStarted('home', { home: ['30'], visitor: [] })]
    events.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 4,
        playerNumber: '15',
      }),
    )
    // Home turns run slot I, II, III, IV, V; each needs a side-out pair.
    for (let i = 0; i < 8; i++) events.push(rally(i % 2 === 0 ? 'visitor' : 'home'))
    let s = fold(setup(), events)
    expect(servingSlotIndex(s.teams.home)).toBe(4)
    expect(s.teams.home.liberoSlotLock['30']).toBe(4)
    expect(s.teams.home.slots[4].liberoServeFlag).toBe(true)

    events.push(rally('home'))
    s = fold(setup(), events)
    const marks = s.teams.home.sheetRows[4]
    expect(marks[marks.length - 1]).toMatchObject({ kind: 'point', triangled: true })
    expect(s.teams.home.running[s.score.home]).toMatchObject({ kind: 'triangle' })
  })

  it('warns rather than blocks when a libero would serve from a second slot', () => {
    const events: MatchEvent[] = [setStarted('home', { home: ['30'], visitor: [] })]
    events.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 4,
        playerNumber: '15',
      }),
    )
    for (let i = 0; i < 8; i++) events.push(rally(i % 2 === 0 ? 'visitor' : 'home'))
    // Move her to slot VI without going out first, then walk home's serve to slot VI.
    events.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'out',
        slot: 4,
        playerNumber: '15',
      }),
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 5,
        playerNumber: '9',
      }),
    )
    for (let i = 0; i < 2; i++) events.push(rally(i % 2 === 0 ? 'visitor' : 'home'))
    const s = fold(setup(), events)
    expect(servingSlotIndex(s.teams.home)).toBe(5)
    expect(s.teams.home.liberoSlotLock['30']).toBe(4) // lock is not moved
    // The warning marks the slot it is about, so the cell can carry the mark.
    expect(s.warnings).toEqual([
      {
        side: 'home',
        target: 'slot',
        slot: 5,
        text: expect.stringContaining('locked to slot V'),
      },
    ])
  })
})

// --- Undo ------------------------------------------------------------------

describe('undo', () => {
  it('re-folds to the previous state, including across SET_ENDED', () => {
    const events: MatchEvent[] = [setStarted('home')]
    for (let i = 0; i < 25; i++) events.push(rally('home'))
    events.push(ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:24' }))

    const ended = fold(setup(), events)
    expect(ended.setsWon.home).toBe(1)
    expect(ended.completedSets).toHaveLength(1)
    expect(ended.setInProgress).toBe(false)

    const backedOut = fold(setup(), undo(events))
    expect(backedOut.setsWon.home).toBe(0)
    expect(backedOut.completedSets).toEqual([])
    expect(backedOut.setInProgress).toBe(true)
    expect(backedOut.score).toEqual({ home: 25, visitor: 0 })
  })

  it('is a pure function of setup plus events', () => {
    const events: MatchEvent[] = [setStarted('home')]
    for (let i = 0; i < 12; i++) events.push(rally(i % 3 === 0 ? 'visitor' : 'home'))
    expect(fold(setup(), events)).toEqual(fold(setup(), events))
  })
})

describe('rotation pass floor', () => {
  it('reports pass 0 for a receiving team that has not served yet', () => {
    const s = fold(setup(), [setStarted('home')])
    expect(s.teams.visitor.serviceTurns).toBe(0)
    expect(s.teams.visitor.rotationPass).toBe(0)
  })
})

describe('player number column', () => {
  it('never records a libero, so the sheet prints the player she replaced', () => {
    const events: MatchEvent[] = [setStarted('home', { home: ['30'], visitor: [] })]
    events.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 4,
        playerNumber: '15',
      }),
    )
    const s = fold(setup(), events)
    expect(s.teams.home.slots[4].current).toBe('30')
    // The Libero # field carries her number; the Player Number column must not.
    expect(s.teams.home.slots[4].sheetPlayers).toEqual(['15'])
  })

  it('accumulates substitutes in order, as the form expects', () => {
    const events: MatchEvent[] = [setStarted('home')]
    for (const [playerIn, playerOut] of [
      ['2', '4'],
      ['4', '2'],
      ['2', '4'],
    ]) {
      events.push(
        ev({ type: 'SUBSTITUTION', team: 'home', playerIn, playerOut, slot: 3, exceptional: false }),
      )
    }
    expect(fold(setup(), events).teams.home.slots[3].sheetPlayers).toEqual(['4', '2', '4', '2'])
  })
})

describe('libero back row', () => {
  it('warns when a libero rotates into the front row without being replaced', () => {
    // Home slot I holds the libero at court position 1. Home loses serve, sides out
    // twice, and rotation carries her round to position 4.
    const events: MatchEvent[] = [setStarted('home', { home: ['30'], visitor: [] })]
    events.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 0,
        playerNumber: '12',
      }),
    )
    expect(fold(setup(), events).warnings).toEqual([])

    // Each home side-out rotates her back one position: 1 -> 6 -> 5 -> 4.
    for (let i = 0; i < 6; i++) events.push(rally(i % 2 === 0 ? 'visitor' : 'home'))
    const s = fold(setup(), events)
    const slot = s.teams.home.slots.find((x) => x.current === '30')
    expect(slot?.position).toBe(4)
    expect(s.warnings).toEqual([
      { side: 'home', target: 'slot', slot: 0, text: expect.stringContaining('front row') },
    ])
  })
})

describe('adjustment', () => {
  it('applies slot, serve and libero corrections as one event', () => {
    const events: MatchEvent[] = [setStarted('home', { home: ['30'], visitor: [] })]
    events.push(rally('home'), rally('home'))
    events.push(
      ev({
        type: 'ADJUSTMENT',
        team: 'home',
        slotAssignments: { '3': '2' },
        serveTeam: 'visitor',
        serveSlot: 2,
        liberoState: { onCourt: null, owes: {}, slotLock: {} },
        countAgainstSubs: true,
        note: '(2-0) fixed slot IV',
      }),
    )
    const s = fold(setup(), events)
    expect(s.teams.home.slots[3].current).toBe('2')
    // The player who came off still owes the slot she left.
    expect(s.teams.home.exitSlot['4']).toBe(3)
    expect(s.serveTeam).toBe('visitor')
    expect(servingSlotIndex(s.teams.visitor)).toBe(2)
    expect(s.teams.home.subsUsed).toHaveLength(1)
    expect(s.teams.home.comments).toContain('(2-0) fixed slot IV')
  })

  it('re-seats BOTH teams when first serve is corrected before any rally', () => {
    // Recorded as home serving, corrected to visitor. Both teams were seated from the
    // wrong answer: home took the serving seats it was not entitled to, and visitor
    // took the receiving seats. Moving the pointer alone would leave every player on
    // the floor one position out for the whole set.
    const events: MatchEvent[] = [setStarted('home')]
    events.push(
      ev({
        type: 'ADJUSTMENT',
        team: null,
        slotAssignments: null,
        serveTeam: 'visitor',
        serveSlot: null,
        liberoState: null,
        countAgainstSubs: false,
        note: '(0-0) first serve was recorded for the wrong team',
      }),
    )
    const corrected = fold(setup(), events)

    // Identical to having recorded visitor first serve in the first place.
    const clean = fold(setup(), [setStarted('visitor')])
    for (const side of ['home', 'visitor'] as TeamSide[]) {
      expect(corrected.teams[side].slots.map((x) => x.position)).toEqual(
        clean.teams[side].slots.map((x) => x.position),
      )
      // The opening service turn is what the pen color counts from, so it moves too.
      expect(corrected.teams[side].serviceTurns).toBe(clean.teams[side].serviceTurns)
    }
    expect(corrected.serveTeam).toBe('visitor')
    expect(servingSlotIndex(corrected.teams.visitor)).toBe(0)
    // Nobody moved slots; only where those slots stand changed.
    expect(corrected.teams.home.slots.map((x) => x.current)).toEqual(HOME_LINEUP)
  })

  it('moves only the pointer once a rally has been recorded', () => {
    // The seating is history by then. Positions are corrected explicitly through
    // slotAssignments, not inferred from a pointer move.
    const events: MatchEvent[] = [setStarted('home'), rally('home')]
    const before = fold(setup(), events)
    events.push(
      ev({
        type: 'ADJUSTMENT',
        team: null,
        slotAssignments: null,
        serveTeam: 'visitor',
        serveSlot: 0,
        liberoState: null,
        countAgainstSubs: false,
        note: '(1-0) serve was on the wrong team',
      }),
    )
    const s = fold(setup(), events)
    expect(s.serveTeam).toBe('visitor')
    expect(servingSlotIndex(s.teams.visitor)).toBe(0)
    expect(s.teams.home.slots.map((x) => x.position)).toEqual(
      before.teams.home.slots.map((x) => x.position),
    )
  })

  it('can put a libero back on court without counting a substitution', () => {
    const events: MatchEvent[] = [setStarted('home', { home: ['30'], visitor: [] })]
    events.push(
      ev({
        type: 'ADJUSTMENT',
        team: 'home',
        slotAssignments: { '4': '30' },
        serveTeam: null,
        serveSlot: null,
        liberoState: { onCourt: '30', owes: { '30': '15' }, slotLock: {} },
        countAgainstSubs: false,
        note: '(0-0) missed libero replacement',
      }),
    )
    const s = fold(setup(), events)
    expect(s.teams.home.slots[4].current).toBe('30')
    // Never recorded in the Player Number column.
    expect(s.teams.home.slots[4].sheetPlayers).toEqual(['15'])
    expect(s.teams.home.liberoOnCourt).toBe('30')
    expect(s.teams.home.liberoOwes['30']).toBe('15')
    expect(s.teams.home.subsUsed).toEqual([])
  })
})

describe('warnings are states, not events', () => {
  it('marks the substitution counter once the budget is spent, not after it', () => {
    const events: MatchEvent[] = [setStarted('home')]
    const sub = (playerIn: string, playerOut: string) =>
      ev({ type: 'SUBSTITUTION', team: 'home', playerIn, playerOut, slot: 3, exceptional: false })

    for (let i = 0; i < 17; i++) events.push(i % 2 === 0 ? sub('2', '4') : sub('4', '2'))
    expect(fold(setup(), events).warnings).toEqual([])

    events.push(sub('4', '2'))
    expect(fold(setup(), events).warnings).toEqual([
      { side: 'home', target: 'subs', text: expect.stringContaining('all 18 substitutions') },
    ])
  })

  it('clears a libero warning by itself once the condition clears', () => {
    const events: MatchEvent[] = [setStarted('home', { home: ['30'], visitor: [] })]
    events.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 0,
        playerNumber: '12',
      }),
    )
    // Rotate her round to the front row.
    for (let i = 0; i < 6; i++) events.push(rally(i % 2 === 0 ? 'visitor' : 'home'))
    expect(fold(setup(), events).warnings).toHaveLength(1)

    // Taking her off court ends the condition, so the mark goes with it. No
    // dismissal, no stale message left behind.
    events.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'out',
        slot: 0,
        playerNumber: '12',
      }),
    )
    expect(fold(setup(), events).warnings).toEqual([])
  })
})

describe('set and match results', () => {
  const endSet = (n: number, endTime: string) =>
    ev({ type: 'SET_ENDED', setNumber: n, endTime })

  it('does not count a set that was ended without being won', () => {
    // The operator can always end a set. That is not the same as winning one, and a
    // 0-0 set ended by mistake must not appear as a set win.
    const events: MatchEvent[] = [setStarted('home')]
    events.push(endSet(1, '18:05'))
    const s = fold(setup(), events)
    expect(s.setsWon).toEqual({ home: 0, visitor: 0 })
    expect(s.completedSets[0]).toMatchObject({ winner: null, counts: false })
    expect(s.matchComplete).toBe(false)
  })

  it('counts a set only once its win condition is met', () => {
    const events: MatchEvent[] = [setStarted('home')]
    for (let i = 0; i < 25; i++) events.push(rally('home'))
    for (let i = 0; i < 24; i++) events.push(rally('visitor'))
    // 25-24 is not a win: no two point lead.
    events.push(endSet(1, '18:30'))
    expect(fold(setup(), events).setsWon).toEqual({ home: 0, visitor: 0 })
    expect(fold(setup(), events).completedSets[0].winner).toBeNull()
  })

  it('lets an extra set be played without changing a decided match', () => {
    // JV teams play one for practice after the match is decided.
    const events: MatchEvent[] = []
    let seqSet = 0
    const playSet = (winnerSide: TeamSide) => {
      seqSet += 1
      events.push(
        ev({
          type: 'SET_STARTED',
          setNumber: seqSet,
          targetScore: 25,
          firstServe: 'home',
          leftTeam: 'home',
          lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
          liberoDesignated: { home: [], visitor: [] },
          startTime: `18:${String(seqSet).padStart(2, '0')}`,
        }),
      )
      for (let i = 0; i < 25; i++) events.push(rally(winnerSide))
      events.push(endSet(seqSet, `19:${String(seqSet).padStart(2, '0')}`))
    }

    playSet('home')
    playSet('home')
    playSet('home')
    const decided = fold(setup(), events)
    expect(decided.setsWon).toEqual({ home: 3, visitor: 0 })
    expect(decided.matchComplete).toBe(true)

    playSet('visitor')
    const after = fold(setup(), events)
    expect(after.setsWon).toEqual({ home: 3, visitor: 0 })
    expect(after.completedSets).toHaveLength(4)
    expect(after.completedSets[3]).toMatchObject({ winner: 'visitor', counts: false })
  })

  it('takes each set time from its own event, never a neighbouring one', () => {
    const events: MatchEvent[] = [
      ev({
        type: 'SET_STARTED',
        setNumber: 1,
        targetScore: 25,
        firstServe: 'home',
        leftTeam: 'home',
        lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
        liberoDesignated: { home: [], visitor: [] },
        startTime: '18:02',
      }),
    ]
    for (let i = 0; i < 25; i++) events.push(rally('home'))
    events.push(endSet(1, '18:27'))
    events.push(
      ev({
        type: 'SET_STARTED',
        setNumber: 2,
        targetScore: 25,
        firstServe: 'visitor',
        leftTeam: 'home',
        lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
        liberoDesignated: { home: [], visitor: [] },
        startTime: '18:34',
      }),
    )
    for (let i = 0; i < 25; i++) events.push(rally('visitor'))
    events.push(endSet(2, '19:01'))

    const sets = fold(setup(), events).completedSets
    expect(sets.map((s) => [s.setNumber, s.startTime, s.endTime])).toEqual([
      [1, '18:02', '18:27'],
      [2, '18:34', '19:01'],
    ])
  })
})

describe('ending a match is not a one-way door', () => {
  it('undoes MATCH_ENDED like any other event', () => {
    const events: MatchEvent[] = [setStarted('home')]
    for (let i = 0; i < 25; i++) events.push(rally('home'))
    events.push(ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:30' }))
    events.push(ev({ type: 'MATCH_ENDED', endTime: '18:31' }))

    const ended = fold(setup({ format: 'best_of_3' }), events)
    expect(ended.matchComplete).toBe(true)

    // Dropping the last event puts the match back exactly where it was. Nothing is
    // locked or destroyed by ending it.
    const backedOut = fold(setup({ format: 'best_of_3' }), undo(events))
    expect(backedOut.completedSets).toHaveLength(1)
    expect(backedOut.setsWon).toEqual({ home: 1, visitor: 0 })
    expect(backedOut.score).toEqual({ home: 25, visitor: 0 })
  })
})

describe('a tie is not a win', () => {
  // The original bug: winner was `score.home > score.visitor ? 'home' : 'visitor'`,
  // so any tie fell through to the else branch and was awarded to the visitor. Ending
  // a set manually at 0-0 silently gave the opponent a set, on a screen that looked
  // entirely plausible, and printed a sheet that reconciled internally while stating
  // the wrong result.
  it('awards nobody when a set is ended manually at 0-0', () => {
    const events: MatchEvent[] = [setStarted('home')]
    events.push(ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:03' }))
    const s = fold(setup(), events)
    expect(s.completedSets[0].winner).toBeNull()
    expect(s.completedSets[0].counts).toBe(false)
    expect(s.setsWon).toEqual({ home: 0, visitor: 0 })
    // Specifically not the visitor, which is where the ternary used to land.
    expect(s.setsWon.visitor).toBe(0)
  })

  it('awards nobody when a set is ended manually at a tied non-zero score', () => {
    const events: MatchEvent[] = [setStarted('home')]
    for (let i = 0; i < 17; i++) events.push(rally('home'))
    for (let i = 0; i < 17; i++) events.push(rally('visitor'))
    expect(fold(setup(), events).score).toEqual({ home: 17, visitor: 17 })

    events.push(ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:40' }))
    const s = fold(setup(), events)
    expect(s.completedSets[0]).toMatchObject({ winner: null, counts: false })
    expect(s.setsWon).toEqual({ home: 0, visitor: 0 })
  })
})

describe('side is a rendering fact, never an input to the fold', () => {
  /** A match with rallies, a substitution, a libero, a timeout and a completed set. */
  function playedMatch(leftTeam: TeamSide): MatchEvent[] {
    seq = 0
    const e: MatchEvent[] = [
      ev({
        type: 'SET_STARTED',
        setNumber: 1,
        targetScore: 25,
        firstServe: 'home',
        leftTeam,
        lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
        liberoDesignated: { home: ['30'], visitor: [] },
        startTime: '18:00',
      }),
    ]
    e.push(
      ev({
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 4,
        playerNumber: '15',
      }),
    )
    for (let i = 0; i < 9; i++) e.push(rally(i % 3 === 0 ? 'visitor' : 'home'))
    e.push(ev({ type: 'TIMEOUT', team: 'visitor' }))
    e.push(
      ev({ type: 'SUBSTITUTION', team: 'home', playerIn: '2', playerOut: '4', slot: 3, exceptional: false }),
    )
    for (let i = 0; i < 6; i++) e.push(rally('home'))
    return e
  }

  /** Everything the fold derives, minus the one field that is allowed to differ. */
  const derived = (s: ReturnType<typeof fold>) => {
    const { leftTeam: _ignored, ...rest } = s
    return rest
  }

  it('derives an identical state whichever team is on the left', () => {
    const asHome = fold(setup(), playedMatch('home'))
    const asVisitor = fold(setup(), playedMatch('visitor'))

    expect(asHome.leftTeam).toBe('home')
    expect(asVisitor.leftTeam).toBe('visitor')
    // Score, rotation, serve, sheet rows, running score, warnings, substitutions:
    // if any of these move, something is keying off position that should not be.
    expect(derived(asVisitor)).toEqual(derived(asHome))
  })

  it('is unchanged by a flip in the middle of a set', () => {
    const base = playedMatch('home')
    const flipped = [...base]
    // Insert the flip halfway through, where a mid-set correction would land.
    flipped.splice(6, 0, ev({ type: 'SIDES_CHANGED', leftTeam: 'visitor' }))

    const before = fold(setup(), base)
    const after = fold(setup(), flipped)
    expect(after.leftTeam).toBe('visitor')
    expect(derived(after)).toEqual(derived(before))
  })

  it('lets a flip be undone like any other event', () => {
    const events = [...playedMatch('home'), ev({ type: 'SIDES_CHANGED', leftTeam: 'visitor' })]
    expect(fold(setup(), events).leftTeam).toBe('visitor')
    expect(fold(setup(), undo(events)).leftTeam).toBe('home')
  })
})

describe('a flip corrects the whole set, not the rest of it', () => {
  /** A set with marks either side of a mid-set flip, then ended. */
  function setWithFlip(withFlip: boolean): MatchEvent[] {
    seq = 0
    const e: MatchEvent[] = [
      ev({
        type: 'SET_STARTED',
        setNumber: 1,
        targetScore: 25,
        firstServe: 'home',
        leftTeam: 'home',
        lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
        liberoDesignated: { home: [], visitor: [] },
        startTime: '18:00',
      }),
    ]
    for (let i = 0; i < 7; i++) e.push(rally(i % 2 === 0 ? 'home' : 'visitor'))
    if (withFlip) e.push(ev({ type: 'SIDES_CHANGED', leftTeam: 'visitor' }))
    for (let i = 0; i < 7; i++) e.push(rally(i % 3 === 0 ? 'visitor' : 'home'))
    e.push(ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:40' }))
    return e
  }

  it('applies a mid-set flip to the whole set, so columns never split', () => {
    const flipped = foldThroughSet(setup(), setWithFlip(true), 1)!
    // One value for the set, taken at its end: the last SIDES_CHANGED within it.
    // The sheet places every box from this, so a box from before the flip cannot
    // land in a different column from one after it.
    expect(flipped.leftTeam).toBe('visitor')

    const plain = foldThroughSet(setup(), setWithFlip(false), 1)!
    expect(plain.leftTeam).toBe('home')

    // And no box moved: the marks themselves are keyed to team identity.
    for (const side of ['home', 'visitor'] as TeamSide[]) {
      expect(flipped.teams[side].sheetRows).toEqual(plain.teams[side].sheetRows)
      expect(flipped.teams[side].running).toEqual(plain.teams[side].running)
    }
  })

  it('does not leak a flip into the next set, which states its own side', () => {
    const events = setWithFlip(true)
    events.push(
      ev({
        type: 'SET_STARTED',
        setNumber: 2,
        targetScore: 25,
        firstServe: 'visitor',
        leftTeam: 'home',
        lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
        liberoDesignated: { home: [], visitor: [] },
        startTime: '18:45',
      }),
    )
    expect(foldThroughSet(setup(), events, 1)!.leftTeam).toBe('visitor')
    expect(foldThroughSet(setup(), events, 2)!.leftTeam).toBe('home')
  })
})


// --- Format ----------------------------------------------------------------

describe('the format decides the result, not the lead', () => {
  /** Win `n` sets for `side`, each 25-0, then end them. */
  function setsWon(n: number, side: TeamSide, format: MatchSetup['format']) {
    const events: MatchEvent[] = []
    for (let i = 1; i <= n; i++) {
      events.push(
        ev({
          type: 'SET_STARTED',
          setNumber: i,
          targetScore: 25,
          firstServe: side,
          leftTeam: 'home',
          lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
          liberoDesignated: { home: [], visitor: [] },
          startTime: '18:00',
        }),
      )
      for (let k = 0; k < 25; k++) events.push(rally(side))
      events.push(ev({ type: 'SET_ENDED', setNumber: i, endTime: '18:40' }))
    }
    return fold(setup({ format }), events)
  }

  it('does not complete a best of five at two sets to nil', () => {
    // The lead is 2-0 and unequal, which is all "sets won differ" ever knew. A
    // closeout that reads a difference would name a winner and mark the match done
    // three sets early, on the artifact that gets kept.
    const s = setsWon(2, 'home', 'best_of_5')
    expect(s.setsWon).toEqual({ home: 2, visitor: 0 })
    expect(s.matchComplete).toBe(false)
  })

  it('completes a best of three at two sets to nil', () => {
    expect(setsWon(2, 'home', 'best_of_3').matchComplete).toBe(true)
  })

  it('completes a best of five only at three', () => {
    expect(setsWon(3, 'home', 'best_of_5').matchComplete).toBe(true)
  })
})

describe('a deciding set is a standing, not a set number', () => {
  it('is the set both teams can win the match with', () => {
    expect(isDecidingSet('best_of_5', { home: 2, visitor: 2 })).toBe(true)
    expect(isDecidingSet('best_of_3', { home: 1, visitor: 1 })).toBe(true)
  })

  it('is not a set only one team can win the match with', () => {
    expect(isDecidingSet('best_of_5', { home: 2, visitor: 1 })).toBe(false)
    expect(isDecidingSet('best_of_5', { home: 1, visitor: 1 })).toBe(false)
  })

  it('does not care how many sets were started', () => {
    // An abandoned 0-0 set and an extra set both add to the count of sets started
    // without adding to either team's wins, so set five may be the seventh started
    // and the seventh may be the deciding one. Only the standing decides.
    const won = { home: 2, visitor: 2 }
    expect(isDecidingSet('best_of_5', won)).toBe(true)
    expect(isDecidingSet('best_of_5', { home: 2, visitor: 1 })).toBe(false)
  })
})


// --- Re-declaring a set's setup ---------------------------------------------

describe('a set start can be taken back before the first point', () => {
  const started = (firstServe: TeamSide, setNumber = 1) =>
    ev({
      type: 'SET_STARTED',
      setNumber,
      targetScore: 25,
      firstServe,
      leftTeam: 'home',
      lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
      liberoDesignated: { home: [], visitor: [] },
      startTime: '18:00',
    })

  it('leaves no trace of the wrong start', () => {
    // The whole point. Correcting first serve this way must be indistinguishable
    // from having entered it correctly, because nothing had happened yet: no
    // ADJUSTMENT comment on the sheet, no second SET_STARTED for the fold to
    // disagree with itself over.
    const wrong = [started('home')]
    const corrected = [...dropCurrentSet(wrong), started('visitor')]
    const clean = [started('visitor')]

    expect(dropCurrentSet(wrong)).toEqual([])
    const a = fold(setup(), corrected)
    const b = fold(setup(), clean)
    expect(a.serveTeam).toBe(b.serveTeam)
    expect(a.teams.home.slots).toEqual(b.teams.home.slots)
    expect(a.teams.visitor.slots).toEqual(b.teams.visitor.slots)
    expect(a.teams.home.serviceTurns).toBe(b.teams.home.serviceTurns)
    expect(a.teams.visitor.serviceTurns).toBe(b.teams.visitor.serviceTurns)
    expect(a.teams.home.sheetRows).toEqual(b.teams.home.sheetRows)
    expect(a.teams.visitor.sheetRows).toEqual(b.teams.visitor.sheetRows)
  })

  it('takes what was recorded after the start with it', () => {
    const events = [
      started('home'),
      ev({ type: 'TIMEOUT', team: 'home' }),
      ev({ type: 'SUBSTITUTION', team: 'home', playerIn: '2', playerOut: '4', slot: 3, exceptional: false }),
    ]
    expect(dropCurrentSet(events)).toEqual([])
  })

  it('keeps the sets already played', () => {
    const events = [
      started('home'),
      ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:40' }),
      started('visitor', 2),
    ]
    expect(dropCurrentSet(events)).toHaveLength(2)
    expect(fold(setup(), dropCurrentSet(events)).completedSets).toHaveLength(1)
  })

  it('refuses to reach past a set that has ended', () => {
    // The guard that matters: between sets the last SET_STARTED belongs to a set
    // that was played. Dropping it would delete a played set from the record.
    const events = [started('home'), ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:40' })]
    expect(dropCurrentSet(events)).toBe(events)
    expect(fold(setup(), dropCurrentSet(events)).completedSets).toHaveLength(1)
  })

  it('does nothing to a match with no set started', () => {
    expect(dropCurrentSet([])).toEqual([])
  })
})
