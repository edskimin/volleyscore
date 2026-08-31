// Substitution and libero replacement, as a pure function of a selection.
//
// The in-match gesture is bidirectional: tap a roster chip then a court cell, or a
// court cell then a roster chip. What that pair MEANS is decided here, not in the UI.
// The UI's only job is to dim what this module says is ineligible, because dimmed
// means not tappable and rule-breaking lives in adjustment mode instead.

import { BACK_ROW, MAX_SUBS, type EventBody, type SlotIndex, type TeamState } from './types'

/** Which libero, if any, the bench player is currently standing in for. */
export function liberoOwedPlayer(team: TeamState): string | null {
  if (!team.liberoOnCourt) return null
  return team.liberoOwes[team.liberoOnCourt] ?? null
}

export function liberoSlot(team: TeamState): SlotIndex | null {
  if (!team.liberoOnCourt) return null
  const i = team.slots.findIndex((s) => s.current === team.liberoOnCourt)
  return i < 0 ? null : (i as SlotIndex)
}

export function isLibero(team: TeamState, player: string): boolean {
  return team.liberoDesignated.includes(player)
}

export function onCourt(team: TeamState, player: string): boolean {
  return team.slots.some((s) => s.current === player)
}

/**
 * Reasons a bench player may not enter a given slot. Empty means eligible.
 * Returned as a reason so the UI can explain a dim on long-press if it ever needs to.
 */
export function ineligibleReason(
  team: TeamState,
  player: string,
  slot: SlotIndex,
): string | null {
  if (onCourt(team, player)) return 'Already on court.'
  const target = team.slots[slot]
  if (!target) return 'No such slot.'

  if (isLibero(team, player)) {
    // Back row only, and only one libero on court at a time.
    if (!BACK_ROW.includes(target.position)) return 'A libero may only play back row.'
    if (team.liberoOnCourt && team.liberoOnCourt !== player) {
      return `Libero #${team.liberoOnCourt} is already on court.`
    }
    return null
  }

  // A libero on court may only be replaced by the player she came in for.
  if (target.current === team.liberoOnCourt) {
    const owed = liberoOwedPlayer(team)
    return owed === player ? null : `Libero #${team.liberoOnCourt} must be replaced by #${owed}.`
  }

  // The compound exchange: the player the libero owes may re-enter into the libero's
  // slot, freeing the libero to replace a different back-row player.
  const owed = liberoOwedPlayer(team)
  if (owed === player && BACK_ROW.includes(target.position)) return null

  // A player who has already played may re-enter only in the slot she left.
  const mustReturnTo = team.exitSlot[player]
  if (mustReturnTo !== undefined && mustReturnTo !== slot) {
    return `#${player} must re-enter in slot ${team.slots[mustReturnTo].rn}.`
  }

  if (team.subsUsed.length >= MAX_SUBS) return `All ${MAX_SUBS} substitutions used.`
  return null
}

export function eligibleSlots(team: TeamState, player: string): SlotIndex[] {
  return ([0, 1, 2, 3, 4, 5] as SlotIndex[]).filter(
    (i) => ineligibleReason(team, player, i) === null,
  )
}

export function eligiblePlayers(team: TeamState, slot: SlotIndex, roster: string[]): string[] {
  return roster.filter((p) => ineligibleReason(team, p, slot) === null)
}

export type Exchange =
  | { kind: 'substitution'; events: EventBody[]; exceptional: boolean }
  | { kind: 'liberoIn'; events: EventBody[] }
  | { kind: 'liberoOut'; events: EventBody[] }
  | { kind: 'compoundLibero'; events: EventBody[] }
  | { kind: 'blocked'; reason: string }

/**
 * Resolve a bench player plus a court slot into the events it means.
 *
 * The compound case looks like one player running on and another running off, but is
 * actually two libero replacements. The inference is safe because a player whose last
 * exit was a libero replacement has no legal path back onto the court except into the
 * libero's slot, so there is exactly one valid reading.
 */
export function resolveExchange(
  team: TeamState,
  side: 'home' | 'visitor',
  benchPlayer: string,
  slot: SlotIndex,
): Exchange {
  const blocked = ineligibleReason(team, benchPlayer, slot)
  if (blocked) return { kind: 'blocked', reason: blocked }

  const target = team.slots[slot]
  const courtPlayer = target.current
  const owed = liberoOwedPlayer(team)

  // The libero leaving the court, replaced by the player she came in for.
  if (courtPlayer === team.liberoOnCourt && benchPlayer === owed) {
    return {
      kind: 'liberoOut',
      events: [
        {
          type: 'LIBERO_REPLACE',
          team: side,
          liberoNumber: courtPlayer,
          direction: 'out',
          slot,
          playerNumber: benchPlayer,
        },
      ],
    }
  }

  // The libero entering for a back-row player.
  if (isLibero(team, benchPlayer)) {
    return {
      kind: 'liberoIn',
      events: [
        {
          type: 'LIBERO_REPLACE',
          team: side,
          liberoNumber: benchPlayer,
          direction: 'in',
          slot,
          playerNumber: courtPlayer,
        },
      ],
    }
  }

  // The compound exchange. The libero comes out into her own slot, letting the owed
  // player back on, then goes straight back in for the selected court player.
  const lSlot = liberoSlot(team)
  if (
    benchPlayer === owed &&
    team.liberoOnCourt &&
    lSlot !== null &&
    courtPlayer !== team.liberoOnCourt &&
    BACK_ROW.includes(target.position)
  ) {
    const libero = team.liberoOnCourt
    return {
      kind: 'compoundLibero',
      events: [
        {
          type: 'LIBERO_REPLACE',
          team: side,
          liberoNumber: libero,
          direction: 'out',
          slot: lSlot,
          playerNumber: benchPlayer,
        },
        {
          type: 'LIBERO_REPLACE',
          team: side,
          liberoNumber: libero,
          direction: 'in',
          slot,
          playerNumber: courtPlayer,
        },
      ],
    }
  }

  // Everything else is an ordinary substitution.
  const mustReturnTo = team.exitSlot[benchPlayer]
  const exceptional = mustReturnTo !== undefined && mustReturnTo !== slot
  return {
    kind: 'substitution',
    exceptional,
    events: [
      {
        type: 'SUBSTITUTION',
        team: side,
        playerIn: benchPlayer,
        playerOut: courtPlayer,
        slot,
        exceptional,
      },
    ],
  }
}
