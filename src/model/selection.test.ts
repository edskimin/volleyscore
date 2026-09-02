import { describe, expect, it } from 'vitest'

import { fold } from './reducer'
import {
  eligibleSlots,
  ineligibleReason,
  liberoOwedPlayer,
  liberoSlot,
  resolveExchange,
} from './selection'
import type { EventBody, MatchEvent, MatchSetup, SlotIndex, TeamState } from './types'

const HOME_LINEUP = ['12', '7', '21', '4', '15', '9']
const VISITOR_LINEUP = ['3', '11', '8', '22', '6', '14']
const HOME_BENCH = ['2', '5', '18']
const HOME_LIBEROS = ['30', '31']

function setup(): MatchSetup {
  const mk = (numbers: string[]) =>
    numbers.map((number) => ({ number, name: null, captain: false }))
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
      roster: mk([...HOME_LINEUP, ...HOME_BENCH, ...HOME_LIBEROS]),
      liberoNumbers: HOME_LIBEROS,
    },
    visitor: {
      teamId: null,
      name: 'Amherst',
      colorPrimary: '#7A1120',
      colorText: '#FFFFFF',
      roster: mk(VISITOR_LINEUP),
      liberoNumbers: [],
    },
  }
}

let seq = 0
function ev(body: EventBody): MatchEvent {
  seq += 1
  return { seq, ts: `2026-10-14T18:00:${String(seq % 60).padStart(2, '0')}Z`, ...body } as MatchEvent
}

function start(): MatchEvent[] {
  seq = 0
  return [
    ev({
      type: 'SET_STARTED',
      setNumber: 1,
      targetScore: 25,
      firstServe: 'home',
      leftTeam: 'home',
      lineups: { home: HOME_LINEUP, visitor: VISITOR_LINEUP },
      liberoDesignated: { home: HOME_LIBEROS, visitor: [] },
      startTime: '18:00',
    }),
  ]
}

const home = (events: MatchEvent[]): TeamState => fold(setup(), events).teams.home

// Home serves first, so home slot N sits at court position N: slots I, V and VI
// (indexes 0, 4, 5) are the back row.
const BACK_SLOTS: SlotIndex[] = [0, 4, 5]

describe('eligibility', () => {
  it('confines a libero to back row slots', () => {
    expect(eligibleSlots(home(start()), '30')).toEqual(BACK_SLOTS)
  })

  it('disables the second libero while the first is on court', () => {
    const events = start()
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
    expect(eligibleSlots(home(events), '31')).toEqual([])
    expect(ineligibleReason(home(events), '31', 0)).toMatch(/#30 is already on court/)
  })

  it('lets a bench player into any slot before she has played', () => {
    expect(eligibleSlots(home(start()), '2')).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('pins a player who has played to the slot she left', () => {
    const events = start()
    events.push(
      ev({
        type: 'SUBSTITUTION',
        team: 'home',
        playerIn: '2',
        playerOut: '4',
        slot: 3,
        exceptional: false,
      }),
    )
    expect(eligibleSlots(home(events), '4')).toEqual([3])
    expect(ineligibleReason(home(events), '4', 0)).toMatch(/must re-enter in slot IV/)
  })

  it('refuses to sub for a libero with anyone but the player she replaced', () => {
    const events = start()
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
    expect(ineligibleReason(home(events), '2', 4)).toMatch(/must be replaced by #15/)
    expect(ineligibleReason(home(events), '15', 4)).toBeNull()
  })

  it('blocks substitutions once all 18 are spent', () => {
    const events = start()
    // Bounce two players in and out of slot IV until the budget is gone.
    for (let i = 0; i < 18; i++) {
      const [playerIn, playerOut] = i % 2 === 0 ? ['2', '4'] : ['4', '2']
      events.push(
        ev({
          type: 'SUBSTITUTION',
          team: 'home',
          playerIn,
          playerOut,
          slot: 3,
          exceptional: false,
        }),
      )
    }
    // The last sub brought #4 on, so #2 is the one sitting and asking to return.
    expect(home(events).subsUsed).toHaveLength(18)
    expect(home(events).slots[3].current).toBe('4')
    expect(ineligibleReason(home(events), '2', 3)).toMatch(/All 18 substitutions used/)
  })
})

describe('resolveExchange', () => {
  it('reads a plain bench-to-court tap as a substitution', () => {
    const x = resolveExchange(home(start()), 'home', '2', 3)
    expect(x.kind).toBe('substitution')
    expect(x).toMatchObject({ exceptional: false })
    expect(x.kind === 'substitution' && x.events[0]).toMatchObject({
      type: 'SUBSTITUTION',
      playerIn: '2',
      playerOut: '4',
      slot: 3,
    })
  })

  it('reads a libero tap as a replacement, not a substitution', () => {
    const x = resolveExchange(home(start()), 'home', '30', 4)
    expect(x.kind).toBe('liberoIn')
    expect(x.kind === 'liberoIn' && x.events[0]).toMatchObject({
      type: 'LIBERO_REPLACE',
      direction: 'in',
      liberoNumber: '30',
      playerNumber: '15',
      slot: 4,
    })
  })

  it('reads the owed player returning to the libero slot as the libero leaving', () => {
    const events = start()
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
    const t = home(events)
    expect(liberoOwedPlayer(t)).toBe('15')
    expect(liberoSlot(t)).toBe(4)

    const x = resolveExchange(t, 'home', '15', 4)
    expect(x.kind).toBe('liberoOut')
    expect(x.kind === 'liberoOut' && x.events).toHaveLength(1)
  })

  // The compound exchange. #15 runs on and #9 runs off, which looks like one
  // substitution but is two libero replacements and must not touch the 18 counter.
  it('infers two replacements when the owed player enters a different back row slot', () => {
    const events = start()
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
    const x = resolveExchange(home(events), 'home', '15', 5)
    expect(x.kind).toBe('compoundLibero')
    expect(x.kind === 'compoundLibero' && x.events).toEqual([
      {
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'out',
        slot: 4,
        playerNumber: '15',
      },
      {
        type: 'LIBERO_REPLACE',
        team: 'home',
        liberoNumber: '30',
        direction: 'in',
        slot: 5,
        playerNumber: '9',
      },
    ])

    // Folding them leaves #15 back on in her own slot, the libero in #9's, and the
    // substitution budget untouched.
    const emitted = x.kind === 'compoundLibero' ? x.events : []
    const after = home([...events, ...emitted.map(ev)])
    expect(after.slots[4].current).toBe('15')
    expect(after.slots[5].current).toBe('30')
    expect(after.liberoOwes['30']).toBe('9')
    expect(after.subsUsed).toEqual([])
  })

  it('does not infer a compound exchange into the front row', () => {
    const events = start()
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
    // Slot III is at court position 3, front row. The inference would be invalid, so
    // the selection is refused outright rather than falling through to a substitution:
    // being replaced by a libero counts as having played, so #15 owes slot V.
    const x = resolveExchange(home(events), 'home', '15', 2)
    expect(x.kind).toBe('blocked')
    expect(x.kind === 'blocked' && x.reason).toMatch(/must re-enter in slot V/)
  })

  it('flags a re-entry into the wrong slot as exceptional rather than silently allowing it', () => {
    const events = start()
    events.push(
      ev({
        type: 'SUBSTITUTION',
        team: 'home',
        playerIn: '2',
        playerOut: '4',
        slot: 3,
        exceptional: false,
      }),
    )
    // #4 must return to slot IV; anywhere else is blocked, not quietly marked.
    expect(resolveExchange(home(events), 'home', '4', 0).kind).toBe('blocked')
    expect(resolveExchange(home(events), 'home', '4', 3).kind).toBe('substitution')
  })
})
