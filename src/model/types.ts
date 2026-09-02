// Types for the volleyball scoring app. See docs/01-data-model.md.
//
// The scoresheet is a pure function of `MatchSetup` plus the event log. Nothing in
// here describes mutable current state: `DerivedState` is the output of a fold and
// is never persisted.

export type TeamSide = 'home' | 'visitor'

export const OTHER: Record<TeamSide, TeamSide> = { home: 'visitor', visitor: 'home' }

/** Serve order slot index, 0-based. 0 = slot I, 5 = slot VI. */
export type SlotIndex = 0 | 1 | 2 | 3 | 4 | 5

/** Physical court position, 1-based. 1 is right back and is the serving position. */
export type CourtPosition = 1 | 2 | 3 | 4 | 5 | 6

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const

/** Court positions a libero may legally occupy. */
export const BACK_ROW: CourtPosition[] = [1, 5, 6]

export const MAX_SUBS = 18
export const MAX_TIMEOUTS = 2

// --- Setup -----------------------------------------------------------------

export interface RosterPlayer {
  /** Jersey numbers are identifiers, not quantities. Never do arithmetic on them. */
  number: string
  name: string | null
  captain: boolean
}

export interface TeamSnapshot {
  teamId: string | null
  name: string
  colorPrimary: string
  colorText: string
  roster: RosterPlayer[]
  /** 0, 1, or 2 entries. */
  liberoNumbers: string[]
}

export interface Officials {
  r1Name: string | null
  r1Number: string | null
  r2Name: string | null
  r2Number: string | null
}

export interface MatchSetup {
  level: 'freshman' | 'jv' | 'varsity'
  format: 'best_of_3' | 'best_of_5'
  date: string
  venue: string | null
  officials: Officials
  scorerName: string | null
  home: TeamSnapshot
  visitor: TeamSnapshot
}

// --- Events ----------------------------------------------------------------

interface EventBase {
  /** Monotonic from 1. */
  seq: number
  ts: string
}

export interface SetStarted extends EventBase {
  type: 'SET_STARTED'
  setNumber: number
  targetScore: number
  firstServe: TeamSide
  /**
   * Which team the scorer sees on their LEFT. Replaces a "sides switched" flag:
   * what matters is not whether they swapped but where they are now, and the OHSAA
   * sheet is written as the teams stand from the scorer's viewpoint.
   */
  leftTeam: TeamSide
  /** Ordered by serve order, not court position. Index 0 is slot I. */
  lineups: Record<TeamSide, string[]>
  liberoDesignated: Record<TeamSide, string[]>
  startTime: string
}

export interface RallyWon extends EventBase {
  type: 'RALLY_WON'
  team: TeamSide
}

export interface Substitution extends EventBase {
  type: 'SUBSTITUTION'
  team: TeamSide
  playerIn: string
  playerOut: string
  slot: SlotIndex
  /** True if it broke the re-entry position rule. */
  exceptional: boolean
}

export interface LiberoReplace extends EventBase {
  type: 'LIBERO_REPLACE'
  team: TeamSide
  liberoNumber: string
  direction: 'in' | 'out'
  slot: SlotIndex
  /** The non-libero: replaced on "in", returning on "out". */
  playerNumber: string
}

export interface Timeout extends EventBase {
  type: 'TIMEOUT'
  /** The team CALLING the timeout. The reducer works out whose row it lands in. */
  team: TeamSide
}

export interface Replay extends EventBase {
  type: 'REPLAY'
}

export interface Reserve extends EventBase {
  type: 'RESERVE'
}

export interface RosterAdd extends EventBase {
  type: 'ROSTER_ADD'
  team: TeamSide
  number: string
  name: string | null
}

export interface Adjustment extends EventBase {
  type: 'ADJUSTMENT'
  team: TeamSide | null
  /** Slot index (as a string key) to jersey number. */
  slotAssignments: Record<string, string> | null
  serveTeam: TeamSide | null
  serveSlot: SlotIndex | null
  liberoState: {
    onCourt: string | null
    owes: Record<string, string>
    slotLock: Record<string, SlotIndex>
  } | null
  countAgainstSubs: boolean
  /** Required, non-empty. */
  note: string
}

export interface SidesChanged extends EventBase {
  type: 'SIDES_CHANGED'
  /** Corrects which team is on the scorer's left, mid-set. */
  leftTeam: TeamSide
}

export interface SetEnded extends EventBase {
  type: 'SET_ENDED'
  setNumber: number
  endTime: string
}

export interface MatchEnded extends EventBase {
  type: 'MATCH_ENDED'
  endTime: string
}

export type MatchEvent =
  | SetStarted
  | RallyWon
  | Substitution
  | LiberoReplace
  | Timeout
  | Replay
  | Reserve
  | RosterAdd
  | Adjustment
  | SidesChanged
  | SetEnded
  | MatchEnded

/** An event before the log stamps `seq` and `ts` on it. Distributes over the union. */
export type EventBody<T = MatchEvent> = T extends unknown ? Omit<T, 'seq' | 'ts'> : never

// --- Sheet marks -----------------------------------------------------------

/** A mark in the running score column. Circle and triangle are mutually exclusive. */
export interface RunMark {
  kind: 'slash' | 'circle' | 'triangle'
  /** Rotation pass at the time the mark was made. Even black, odd red. */
  pass: number
}

export type SheetMark =
  | { kind: 'point'; value: number; circled: boolean; triangled: boolean; pass: number }
  | { kind: 'endOfService'; pass: number }
  | { kind: 'sub'; label: 'S' | 'SX'; playerIn: string; playerOut: string; pass: number }
  | { kind: 'timeout'; label: 'T' | 'TX'; pass: number }
  | { kind: 'replay'; pass: number }
  | { kind: 'reserve'; pass: number }

/** A mark before the rotation pass is stamped on it. Distributes over the union. */
export type PendingMark<T = SheetMark> = T extends unknown ? Omit<T, 'pass'> : never

/** One serve order band. The printed form gives it 20 boxes, two rows of 10. */
export type SheetRow = SheetMark[]

// --- Derived state ---------------------------------------------------------

export interface Slot {
  rn: (typeof ROMAN)[number]
  position: CourtPosition
  /** Jersey number on court now. May be a libero. */
  current: string
  /** Prior occupants, oldest first. */
  history: string[]
  /**
   * The non-libero players who have held this slot, oldest first. This is what the
   * Player Number column prints: the libero number is NEVER recorded there, it goes
   * only in the Libero # field.
   */
  sheetPlayers: string[]
  /** Triangle on the Roman numeral: the slot this libero is locked to serve from. */
  liberoServeFlag: boolean
}

export interface SubRecord {
  playerIn: string
  playerOut: string
  slot: SlotIndex
  exceptional: boolean
}

export interface TeamState {
  slots: Slot[]
  /** Service turns STARTED this set. The first-serving team is initialized to 1. */
  serviceTurns: number
  /** floor((serviceTurns - 1) / 6). 0 = black, 1 = red, ... */
  rotationPass: number
  timeoutsUsed: number
  subsUsed: SubRecord[]
  liberoOnCourt: string | null
  liberoDesignated: string[]
  /** Where each libero is locked to serve, once stamped. */
  liberoSlotLock: Record<string, SlotIndex>
  /** Who each on-court libero must be replaced by. */
  liberoOwes: Record<string, string>
  /** Slot each off-court player must re-enter in, if she has already played. */
  exitSlot: Record<string, SlotIndex>
  timeoutScores: Array<{ calling: number; opponent: number }>
  running: Record<number, RunMark>
  sheetRows: SheetRow[]
  comments: string[]
}

export interface SetResult {
  setNumber: number
  targetScore: number
  score: Record<TeamSide, number>
  /**
   * Null when the set was ended without meeting its win condition. Ending a set is
   * something the operator can always do; winning one is not, and an abandoned set
   * is not a set win.
   */
  winner: TeamSide | null
  /**
   * Whether this set counts towards the match result. False for a set played after
   * the match was already decided, which JV teams do for practice.
   */
  counts: boolean
  startTime: string
  endTime: string | null
}

export interface Warning {
  side: TeamSide
  /** What to mark: a court cell, or the substitution counter. */
  target: 'slot' | 'subs'
  slot?: SlotIndex
  text: string
}

export interface DerivedState {
  currentSet: number
  targetScore: number
  setsWon: Record<TeamSide, number>
  score: Record<TeamSide, number>
  serveTeam: TeamSide
  leftTeam: TeamSide
  setInProgress: boolean
  setComplete: boolean
  matchComplete: boolean
  teams: Record<TeamSide, TeamState>
  rosters: Record<TeamSide, RosterPlayer[]>
  completedSets: SetResult[]
  /**
   * Active rule warnings. These are states, not events: each names the object it
   * marks so the mark can be rendered in place and persist until the condition
   * clears. Never a toast, a banner, or a rail message. The R2 makes rulings, not
   * the tablet, so nothing here blocks.
   */
  warnings: Warning[]
}
