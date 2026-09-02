# Data Model

## Storage layout

Three IndexedDB object stores, accessed through Dexie.

### `matches`

One record per match. The record holds setup plus the full event log.

```
{
  schemaVersion: 1,
  matchId: "uuid",
  createdAt: "ISO-8601",
  updatedAt: "ISO-8601",
  status: "in_progress" | "complete",
  setup: MatchSetup,
  events: Event[]
}
```

### `teams`

Saved teams, so a repeat opponent does not require re-entry. Keyed by a generated
id, not by name, so a rename does not orphan the record.

```
{
  teamId: "uuid",
  name: "Avon Lake",
  colorPrimary: "#14284B",
  colorText: "#FFFFFF",
  roster: [ { number: "12", name: "Skimin", captain: true } ],
  liberoNumbers: ["30"],
  lastUsedAt: "ISO-8601"
}
```

Saving a team is a convenience copy. Editing a saved team never mutates a match
already recorded. Matches carry their own roster snapshot.

### `appState`

Single record. Holds `activeMatchId` for crash recovery.

## Match setup

```
MatchSetup {
  level: "freshman" | "jv" | "varsity",
  format: "best_of_3" | "best_of_5",
  date: "YYYY-MM-DD",
  venue: string | null,
  officials: {
    r1Name: string | null, r1Number: string | null,
    r2Name: string | null, r2Number: string | null
  },
  scorerName: string | null,
  home: TeamSnapshot,
  visitor: TeamSnapshot
}

TeamSnapshot {
  teamId: "uuid" | null,
  name: string,
  colorPrimary: "#RRGGBB",
  colorText: "#RRGGBB",
  roster: [ { number: string, name: string | null, captain: boolean } ],
  liberoNumbers: string[]    // 0, 1, or 2 entries
}
```

Only rosters and team names are required. Everything else is optional, including
all officials fields.

Jersey numbers are strings, not integers. They are identifiers, not quantities.
Sort numerically for display but never do arithmetic on them.

## Event log

Append-only. Every event has a sequence number and a timestamp. Events are never
edited or deleted. Undo removes the last event and re-folds.

```
Event {
  seq: integer,           // monotonic from 1
  ts: "ISO-8601",
  type: string,
  ...type-specific fields
}
```

`team` in any event is `"home"` or `"visitor"`.

### `SET_STARTED`

```
{
  type: "SET_STARTED",
  setNumber: 1..5,
  targetScore: 25 | 15,        // editable at set start
  firstServe: "home" | "visitor",
  leftTeam: "home" | "visitor", // which team the scorer sees on their LEFT
  lineups: {
    home:    [ "12", "7", "21", "4", "15", "9" ],   // index 0 = slot I
    visitor: [ "3", "11", "8", "22", "6", "14" ]
  },
  liberoDesignated: { home: string[], visitor: string[] },
  startTime: "HH:MM"
}
```

Lineups are ordered by serve order, not by court position. Index 0 is slot I, the
team's first server.

### `RALLY_WON`

```
{ type: "RALLY_WON", team: "home" | "visitor" }
```

The only high-frequency event. Everything about score, rotation, and service
attribution derives from the sequence of these.

### `SUBSTITUTION`

```
{
  type: "SUBSTITUTION",
  team: "home",
  playerIn: "2",
  playerOut: "4",
  slot: 3,                  // 0-based index of the serve order slot, 3 = IV
  exceptional: boolean      // true if it broke the re-entry position rule
}
```

Counts against the team's 18 substitutions.

### `LIBERO_REPLACE`

```
{
  type: "LIBERO_REPLACE",
  team: "home",
  liberoNumber: "30",
  direction: "in" | "out",
  slot: 4,                  // 0-based serve order slot index
  playerNumber: "15"        // the non-libero: replaced on "in", returning on "out"
}
```

Does NOT count against the 18. Unlimited.

### `TIMEOUT`

```
{ type: "TIMEOUT", team: "home" }
```

`team` is the team CALLING the timeout. The notation lands in the serving team's
row, which the reducer works out. Two per team per set. No timer.

### `REPLAY` and `RESERVE`

```
{ type: "REPLAY" }
{ type: "RESERVE" }
```

Notation only. Neither affects the score. Both are optional marks reached through
the overflow menu.

### `ROSTER_ADD`

```
{ type: "ROSTER_ADD", team: "visitor", number: "27", name: null }
```

Adds a player mid-match. Needed because opponent numbers are often collected
during warmups or discovered mid-set.

### `ADJUSTMENT`

The escape hatch. Suspends normal constraints so the operator can correct drift.

```
{
  type: "ADJUSTMENT",
  team: "home" | "visitor" | null,
  slotAssignments: { "0": "12", "3": "2" } | null,   // slot index to jersey number
  serveTeam: "home" | "visitor" | null,              // move the serve pointer
  serveSlot: 2 | null,                               // move the serving slot
  countAgainstSubs: boolean,
  note: string                                        // required, non-empty
}
```

Applied as a whole. `note` must be non-empty; the UI prefills it with the score at
the time. `countAgainstSubs` is asked once at confirmation, because the app cannot
distinguish a genuine exceptional substitution from correcting a mis-tap.

### `SET_ENDED`

```
{ type: "SET_ENDED", setNumber: 1, endTime: "HH:MM" }
```

Emitted when a set's win condition is met. The winner and score are derived, not
stored. Emitting this does not lock anything. Undo must walk back through it.

### `MATCH_ENDED`

```
{ type: "MATCH_ENDED", endTime: "HH:MM" }
```

Same rule. A state change, not a termination. The in-match screen stays live and
undo still works.

## Derived state

The reducer folds `setup` plus `events` into:

```
DerivedState {
  currentSet: integer,
  targetScore: integer,
  setsWon: { home: int, visitor: int },
  score: { home: int, visitor: int },
  serveTeam: "home" | "visitor",
  matchComplete: boolean,
  teams: {
    home: TeamState,
    visitor: TeamState
  },
  completedSets: SetResult[]
}

TeamState {
  slots: [ Slot x6 ],           // index 0 = slot I
  serviceTurns: integer,        // count of turns this team has held serve this set
  rotationPass: integer,        // floor(serviceTurns / 6). 0 = black, 1 = red, ...
  timeoutsUsed: integer,        // max 2
  subsUsed: SubRecord[],        // max 18
  liberoOnCourt: string | null, // jersey number
  liberoSlotLock: { [liberoNumber]: slotIndex },  // where each libero may serve
  liberoOwes: { [liberoNumber]: playerNumber },   // who she must be replaced by
  running: { [pointNumber]: RunMark },
  sheetRows: [ SheetRow x6 ]
}

Slot {
  rn: "I".."VI",
  position: 1..6,               // current court position
  current: "12",                // jersey number on court now
  history: ["4", "2", "4"],     // prior occupants, oldest first
  liberoServeFlag: boolean      // triangle on the Roman numeral
}
```

## Reducer rules

### Initial court positions at set start

The serving team's slot N sits at court position N.

The receiving team's slot N sits at court position N+1, wrapping VI to position 1.
This is because the receiving team rotates once when it first wins the serve, which
brings its slot I to position 1.

Verified against instructional material: for a receiving team, the slot I player is
the right front (position 2) at the start of the set.

### Rotation

A team rotates ONLY when it gains the serve, and never on the first serve of a set.

Rotation decrements every slot's court position by one, wrapping:

```
newPosition = ((position - 2 + 6) % 6) + 1
```

The server is always the slot currently at court position 1.

### Rally resolution

```
on RALLY_WON(w):
  loser = other(w)
  score[w] += 1

  if w == serveTeam:
      // serve point
      append to serving slot's sheet row: { kind: "point", value: score[w] }
      running[w][score[w]] = { kind: "slash" }
  else:
      // side-out
      append to loser's current serving slot's row: { kind: "endOfService" }
      rotate(w)
      w.serviceTurns += 1
      append to w's new serving slot's row: { kind: "point", value: score[w], circled: true }
      running[w][score[w]] = { kind: "circle" }
      serveTeam = w

  // libero serve lock check, see below
  // set win condition check
```

Marks carry the color derived from the scoring team's `rotationPass` at the moment
the mark is made.

### Set win condition

A set ends when a team reaches `targetScore` AND leads by at least 2. No cap.

### Match win condition

`best_of_3`: first to 2 sets. `best_of_5`: first to 3 sets.

### Substitution rules

- Increments `subsUsed`. Hard limit 18. At 18, the UI blocks further substitutions.
- A player who has already been on court this set may normally re-enter only in the
  serve order slot she left. The UI dims other slots and does not allow the tap.
  Breaking this requires ADJUSTMENT mode.
- The outgoing player's slot is recorded so the constraint can be enforced later.
- `history` on the slot grows: the outgoing player is appended, the incoming player
  becomes `current`.

### Libero rules

- **Back row only.** A libero may occupy only court positions 1, 5, and 6. The UI
  dims front-row cells during a libero selection.
- **One on court.** If a libero is on court, the other libero's chip is disabled.
- **Exit constraint.** A libero may be replaced only by the player she came in for,
  tracked in `liberoOwes`.
- **Serve slot lock.** A libero may serve in only one serve order slot per set. The
  first time she is in court position 1 at the moment her team gains serve, stamp
  `liberoSlotLock[liberoNumber] = slotIndex` and set `liberoServeFlag` on that slot.
  If she later reaches position 1 in a different slot, FLAG it, do not block it. The
  R2 makes that call, not the app.
- **Not a substitution.** Never increments `subsUsed`.
- **One replacement per dead ball**, except when replacing the right back position
  to serve the next rally. The app WARNS on a second replacement in the same dead
  ball rather than blocking, since the operator may have misread who ran on.

### The compound libero exchange

A common sequence looks like one player running on and another running off, but is
actually two libero replacements.

Detection rule, applied when the operator selects a bench player then a court player:

```
IF   selected bench player's last exit event was LIBERO_REPLACE
AND  a libero is currently on court
AND  the selected court player is NOT that libero
AND  the selected court player is in a back-row position (1, 5, or 6)
THEN emit two events:
       LIBERO_REPLACE { direction: "out", libero, playerNumber: benchPlayer }
       LIBERO_REPLACE { direction: "in",  libero, playerNumber: courtPlayer }
ELSE fall through to the normal SUBSTITUTION path.
```

The inference is safe because a player whose last exit was a libero replacement has
no legal path back onto the court except into the libero's slot. There is exactly
one valid reading.

If the selected court player is in the front row, the inference is invalid. Dim the
front row during this selection.

### Undo

Pop the last event, re-fold from the start. Do not attempt incremental reversal.
Folding a full match is a few hundred events and completes in under a millisecond.

Undo must work across every event type including `SET_ENDED` and `MATCH_ENDED`.

## Export format

One file per match. Extension `.json`. Avoid a custom extension; iOS handles unknown
MIME types badly.

```
{
  schemaVersion: 1,
  matchId: "uuid",
  exportedAt: "ISO-8601",
  setup: MatchSetup,
  events: Event[]
}
```

Filename: `2026-10-14-avon-lake-vs-amherst.json`

### Export mechanism

Implement both, because standalone-PWA share sheet behavior on iOS has been
inconsistent across versions:

1. **Web Share API with files.** Opens the native iOS share sheet, giving Mail,
   Save to Files, Google Drive, AirDrop, and Messages in one tap. Preferred path.
2. **Blob download link fallback.** Saves to the Files app. Always available.

### Import

A standard `<input type="file">`. On iOS this opens the Files picker, which already
surfaces iCloud Drive, Google Drive, and Dropbox if installed.

On import: validate `schemaVersion`, run migrations, fold, render.

### Versioning

Set `schemaVersion` from day one and write a migration function even if it starts as
a no-op. The event shape WILL change after the first real match. Last season's files
must stay readable.

## Durability warning

IndexedDB on iOS is not durable storage. Safari can evict script-writable storage
after roughly seven days without site interaction. Home-screen installed PWAs are
treated differently, but do not bet a season on that.

Mitigations, in order of importance:

1. Make the closeout export blocking. A match is not marked complete until the file
   has been shared. This is the real protection.
2. Prompt to install to the home screen.
3. Write a backup copy to a second object store after each set.
