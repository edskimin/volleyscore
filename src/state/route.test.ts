import { describe, expect, it } from 'vitest'

import { fold, servingSlotIndex } from '../model/reducer'
import type { MatchEvent, MatchSetup, TeamSide } from '../model/types'
import { routeForMatch } from './route'

function roster(numbers: string[]) {
  return numbers.map((number) => ({ number, name: null, captain: false }))
}

function setup(format: MatchSetup['format'] = 'best_of_5'): MatchSetup {
  const team = (name: string, numbers: string[]) => ({
    teamId: null,
    name,
    colorPrimary: '#14284B',
    colorText: '#FFFFFF',
    roster: roster(numbers),
    liberoNumbers: [],
  })
  return {
    level: 'varsity',
    format,
    date: '2026-10-14',
    venue: null,
    officials: { r1Name: null, r1Number: null, r2Name: null, r2Number: null },
    scorerName: null,
    home: team('Avon Lake', ['12', '7', '21', '4', '15', '9']),
    visitor: team('Amherst', ['3', '11', '8', '22', '6', '14']),
  }
}

let seq = 0
function ev<T extends Omit<MatchEvent, 'seq' | 'ts'>>(e: T): MatchEvent {
  seq += 1
  return { seq, ts: `2026-10-14T18:00:0${seq % 10}Z`, ...e } as MatchEvent
}

const setStarted = (firstServe: TeamSide) =>
  ev({
    type: 'SET_STARTED',
    setNumber: 1,
    targetScore: 25,
    firstServe,
    leftTeam: 'home',
    lineups: {
      home: ['12', '7', '21', '4', '15', '9'],
      visitor: ['3', '11', '8', '22', '6', '14'],
    },
    liberoDesignated: { home: [], visitor: [] },
    startTime: '18:00',
  })

describe('a match with no set started is still openable', () => {
  it('routes an empty event log to set setup', () => {
    const state = fold(setup(), [])
    expect(routeForMatch(state)).toBe('setSetup')
  })

  it('is why: that state has no court to render', () => {
    // The crash this guards. With no SET_STARTED there are no slots, so nothing holds
    // court position 1 and findIndex reports -1. The in-match screen reads
    // slots[servingSlotIndex(t)].current and throws on undefined, which leaves the
    // match intact on disk and impossible to reopen.
    const state = fold(setup(), [])
    expect(state.teams.home.slots).toHaveLength(0)
    expect(servingSlotIndex(state.teams.home)).toBe(-1)
    expect(state.teams.home.slots[servingSlotIndex(state.teams.home)]).toBeUndefined()
  })

  it('routes to the court only while a set is in progress', () => {
    const state = fold(setup(), [setStarted('home')])
    expect(routeForMatch(state)).toBe('inMatch')
  })

  it('routes back to set setup once a set has ended', () => {
    const events = [setStarted('home'), ev({ type: 'SET_ENDED', setNumber: 1, endTime: '18:40' })]
    expect(routeForMatch(fold(setup(), events))).toBe('setSetup')
  })

  it('routes a match with no record home', () => {
    expect(routeForMatch(null)).toBe('home')
  })
})
