import type { DerivedState } from '../model/types'

export type Route =
  | 'home'
  | 'matchSetup'
  | 'editSetup'
  | 'setSetup'
  | 'inMatch'
  | 'sheet'
  | 'closeout'
  | 'adjustment'

/**
 * Where a match lands when it is opened or resumed. A live set goes to the court, a
 * decided match to closeout, and anything else to set setup.
 *
 * The last case is not a tidy default, it is the reason this function exists. A match
 * whose log has no SET_STARTED has no lineup, so no slot holds position 1 and
 * `servingSlotIndex` returns -1; the in-match screen then reads `slots[-1].current`
 * and throws. Routing such a match anywhere but set setup makes it impossible to
 * reopen, which is the worst failure this app has: the match is intact on disk and
 * unreachable. Every path that opens a match goes through here.
 */
export function routeForMatch(state: DerivedState | null): Route {
  if (!state) return 'home'
  if (state.setInProgress) return 'inMatch'
  if (state.matchComplete) return 'closeout'
  return 'setSetup'
}
