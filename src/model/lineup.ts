// Why a lineup is not ready to start, in words.
//
// Kept out of the component so both branches can be tested: a duplicate is no longer
// reachable by tapping, since placing a player who already holds a slot moves her, but
// the check stays because a lineup can also arrive from a previous set or from an
// edited roster.

import { ROMAN } from './types'

export function lineupProblemSlots(lineup: (string | null)[]): Set<number> {
  const out = new Set<number>()
  lineup.forEach((player, i) => {
    if (!player) out.add(i)
    else if (lineup.filter((p) => p === player).length > 1) out.add(i)
  })
  return out
}

export function lineupProblems(lineup: (string | null)[], teamName: string): string[] {
  const out: string[] = []

  const empty = lineup.flatMap((p, i) => (p ? [] : [ROMAN[i]]))
  if (empty.length === lineup.length) {
    out.push(`${teamName} has no lineup yet.`)
  } else if (empty.length > 0) {
    out.push(
      `${teamName}: no player in ${empty.length === 1 ? 'slot' : 'slots'} ${empty.join(', ')}. ` +
        'All six slots need a player.',
    )
  }

  const held = new Map<string, number[]>()
  lineup.forEach((p, i) => {
    if (p) held.set(p, [...(held.get(p) ?? []), i])
  })
  for (const [player, slots] of held) {
    if (slots.length > 1) {
      out.push(
        `${teamName}: #${player} is in ${slots.map((i) => ROMAN[i]).join(' and ')}. ` +
          'Each slot needs a different player.',
      )
    }
  }

  return out
}
