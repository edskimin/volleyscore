import { describe, expect, it } from 'vitest'

import { lineupProblems, lineupProblemSlots } from './lineup'

const FULL = ['4', '7', '56', '22', '11', '2']

describe('lineupProblems', () => {
  it('says nothing about a complete lineup', () => {
    expect(lineupProblems(FULL, 'Lake Ridge Academy')).toEqual([])
    expect(lineupProblemSlots(FULL).size).toBe(0)
  })

  it('names an empty lineup plainly rather than listing six slots', () => {
    expect(lineupProblems([null, null, null, null, null, null], 'Open Door')).toEqual([
      'Open Door has no lineup yet.',
    ])
  })

  it('names the empty slots, and agrees with itself about singular and plural', () => {
    const one = ['4', '7', '56', '22', '11', null]
    expect(lineupProblems(one, 'Lake Ridge Academy')[0]).toBe(
      'Lake Ridge Academy: no player in slot VI. All six slots need a player.',
    )
    const several = [null, '7', null, '22', null, null]
    expect(lineupProblems(several, 'Lake Ridge Academy')[0]).toBe(
      'Lake Ridge Academy: no player in slots I, III, V, VI. All six slots need a player.',
    )
    expect([...lineupProblemSlots(several)]).toEqual([0, 2, 4, 5])
  })

  // The case that stranded a real set setup: the same player in two slots, with a
  // disabled button and nothing saying why.
  it('names a player who holds two slots, and marks both', () => {
    const dup = ['4', '8', '14', '17', '18', '17']
    expect(lineupProblems(dup, 'Open Door')).toEqual([
      'Open Door: #17 is in IV and VI. Each slot needs a different player.',
    ])
    expect([...lineupProblemSlots(dup)]).toEqual([3, 5])
  })

  it('reports an empty slot and a duplicate together', () => {
    const both = ['4', '4', null, '17', '18', '2']
    expect(lineupProblems(both, 'Open Door')).toEqual([
      'Open Door: no player in slot III. All six slots need a player.',
      'Open Door: #4 is in I and II. Each slot needs a different player.',
    ])
  })
})
