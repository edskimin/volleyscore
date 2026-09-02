# Screens and Flows

## Design principles

1. **Speed beats spectacle wherever they conflict.** The fastest possible thing is a
   large target that responds instantly. Animation confirms an action, never delays it.
2. **Landscape, two-handed.** Thumbs rest at the bottom corners. The score panels are
   the primary targets and each occupies roughly half the screen.
3. **Team colors drive the visual identity.** The two teams' colors are the palette.
4. **Dimmed means not tappable.** One meaning, no exceptions. Rule-breaking lives in
   an explicit mode, not behind a dimmed control.
5. **Warn, do not block, on judgment calls.** The R2 makes rulings, not the tablet.

## Screen inventory

1. Home
2. Match setup
3. Set setup
4. In match (the primary screen)
5. Scoresheet view
6. Adjustment mode
7. Match closeout

---

## 1. Home

- New match.
- Resume in-progress match, if `appState.activeMatchId` is set.
- List of saved matches, most recent first, with team names, date, and final score.
- Import a match from a file.

On launch, if a match is in progress, resume into it silently. Do not ask. "New
match" is always available on the home screen, which is a better escape hatch than
a prompt on every reload.

---

## 2. Match setup

Only rosters, team names, and first serve are required. Everything else optional.

**Teams.** Pick from saved teams or add new. A saved team prefills name, colors,
roster, and libero designations. Editing here does not mutate the saved record
unless the operator explicitly saves it back.

**Per team:** name, primary color, roster (jersey number required, name optional,
captain flag), up to two libero numbers.

**Match:** level (freshman / JV / varsity), format (best of 3 / best of 5), date,
venue.

**Officials:** R1 name and OHSAA number, R2 name and OHSAA number. All optional.

**Scorer name.** Optional.

### Notes

- Numbers are required; names are optional throughout. The sheet needs only numbers.
  The in-match serving indicator shows a name when one exists and the number alone
  otherwise.
- Both teams need lineups entered to produce a complete sheet. Opponent numbers are
  typically collected during warmups.
- The color picker should warn on low contrast between the two teams, since the
  whole in-match design depends on telling the panels apart at a glance.

---

## 3. Set setup

Runs before every set, including set 1.

- **Lineups**, entered by serve order slot I through VI, per team. **Default to the
  previous set's lineup**, since it often does not change.
- **First serve.** Alternates by default. Editable.
- **Target score.** Defaults: 25 for sets 1 through 4, 15 for a deciding set 5. For a
  best-of-3 third set, default 25. Always editable in one tap, because JV third sets
  vary between 15 and 25.
- **Libero designation** per team for this set. May differ per set.
- **Which team is on your left**, defaulting to the previous set's value. Replaces the
  old "teams switched sides" toggle: the operator has to score what is physically in
  front of them, and that depends on where they are sitting, not on who is hosting.

Emits `SET_STARTED`.

---

## 4. In match

The primary screen. Landscape, full bleed.

### Layout

```
+------------------------------------------------------------------+
| VARSITY   25-21 · 22-25 · in progress          18:42  [save] [wifi]|
+---------------------------+------+-------------------------------+
|  HOME PANEL               | SET  |  VISITOR PANEL                |
|                           |  3   |                               |
|  Team name      sets 1    |      |    sets 1      Team name      |
|                           | ---- |                               |
|  [ 20 ]  [court grid]     | 1-1  |  [court grid]  [ 17 ]         |
|  serving #12              |      |            receiving          |
|                           |      |                               |
|  [ roster row, 9 across ] |      |  [ roster row, 9 across ]     |
|  [ 1..18 sub counter    ] |      |  [ 1..18 sub counter    ]     |
+---------------------------+------+-------------------------------+
| [time out] [replay]  [undo] [sheet] [...]   [replay] [time out]  |
+------------------------------------------------------------------+
```

### The score is the button

Tapping a team's score awards that team the point. The tap target is generous. The
score number is what the eye is already on, so reading and recording collapse into
one object.

### Serve state reads three ways

Redundant on purpose, because this is what you least want to get wrong while
glancing:

1. The receiving team's entire panel dims to a darker shade of its own team color.
2. The serving team's court position 1 cell inverts to a light fill.
3. The server's jersey number is spelled out beneath the score.

The visual center of gravity swings across the screen with the serve. This is the
single most distinctive thing about the design.

### Court grid

Two columns by three rows per team, spatially truthful. Each team's front row sits
against the center divider, so the two front rows face each other across the net.

Court position to grid cell, home team (net on the right):

```
back-top    = pos 5     front-top    = pos 4
back-mid    = pos 6     front-mid    = pos 3
back-bottom = pos 1     front-bottom = pos 2
```

The visitor grid mirrors this: front column on the left, back column on the right.

Each cell shows:

- The serve order Roman numeral, small, top-left. **The numeral travels with the
  players as they rotate**, because the numeral is the serve order slot, which is the
  row on the printed sheet. This makes the court view and the sheet the same object
  seen two ways.
- The current player's jersey number, large.
- The history trail of prior occupants of that slot, small, for example `4 2 4`.
- A triangle outline instead of a rounded cell when a libero occupies it.

### Roster row

The **full roster** in fixed numeric slots, nine across, wrapping to a second row.
Two rows is the normal case for a varsity roster.

Three states:

- **Outlined chip**: on court right now. Inert.
- **Filled chip**: available. Tappable.
- **Faded to 30 percent**: available, but not for the currently selected slot.

A chip never moves during a match, so the operator reaches for a known spot rather
than scanning. Adding a player mid-match through the overflow menu will reflow the
row, which is the one case that breaks this. Prefer entering opponent numbers during
warmups.

Off-court players who have already played carry a small Roman numeral showing the
slot they must return to. Liberos are drawn as triangles.

### Substitution gesture

Bidirectional. Tap a roster chip then a court cell, or a court cell then a roster
chip. Tapping the same thing twice deselects.

Dimming enforces the rules:

- Selecting a player who has already played dims every court cell except her slot.
- Selecting a court cell dims every roster chip not eligible to replace her.
- Selecting a libero dims the three front-row cells.
- If a libero is on court, the other libero's chip is disabled.

Dimmed is not tappable. To break a rule, use adjustment mode.

### The compound libero exchange

Handled by inference, not by a special gesture. See `01-data-model.md`. The operator
taps the returning player then the player leaving the court, exactly as if it were a
substitution, and the app emits two `LIBERO_REPLACE` events. The 18 counter is
untouched.

### Sub counter

The numbers 1 through 18 along the bottom of each panel, dim until used. This is a
real budget the operator will be asked about mid-match.

Test legibility on the device. At iPad size those digits are about six points tall.
If unreadable, fall back to dots with a "6 of 18" label, accepting the loss of "which
sub number was that."

### Bottom bar

Spatially mirrored. Home controls left, visitor controls right, shared controls
center. The operator never reads a label to know which team a button belongs to.

- Left: time out (home), replay (home)
- Center: undo, sheet, overflow
- Right: replay (visitor), time out (visitor)

Undo dims when there is nothing to undo.

### Overflow menu

- Hint (explains the gestures)
- Flip sides on screen
- Re-serve
- Add a player to a roster
- Fix lineup (adjustment mode)
- End set manually
- Export

---

## 5. Scoresheet view

A faithful render of the OHSAA form. See `02-scoresheet-notation.md`.

Chrome: back, set tabs 1 through 5, print, export. The sheet renders as a white
document inside dark chrome, because looking like paper is the point.

Reachable at any time from the in-match screen.

---

## 6. Adjustment mode

Labeled **"Fix lineup"** in the UI. Framed as error recovery, not as an injury tool.
The real use case is a mis-tap, a lineup entered wrong, or a missed substitution.
Genuine injuries are rare.

It is a **mode, not a single action**. Normal constraints are suspended, the operator
makes however many changes are needed, then confirms or cancels as one unit. This
gives a clean undo boundary.

Two kinds of drift, both fixable here, and the UI should name both:

1. **Wrong player in a slot.** Caused by a missed or mis-tapped substitution, a
   libero exchange not caught, or a bad starting lineup.
2. **Wrong slot serving.** Caused by first serve assigned to the wrong team at set
   start, or a rally recorded to the wrong team.

A third failure, a rally that was never recorded, cannot be fixed here. It must be
corrected by adding the missing point, or the running score and the service rows will
disagree.

Confirmation step requires:

- A **note**, prefilled with the current score. Cannot be empty.
- An answer to **"count this against substitutions?"** The app cannot distinguish a
  genuine exceptional substitution from a correction, so it asks once.

Emits one `ADJUSTMENT` event.

---

## 7. Match closeout

Triggered when the match win condition is met, or manually.

- Final score by set, match result.
- Match end time.
- **A direct control to open the scoresheet**, per set. Checking the sheet is the
  natural last step before exporting, and making the operator navigate back to the
  match screen to reach it is friction at exactly the wrong moment.
- **Export.** Blocking. The match is not marked complete until the file has been
  shared. Do not make this a dismissible reminder; it will be dismissed. This is the
  primary protection against IndexedDB eviction.
- Optionally save either team back to the saved teams store.

`MATCH_ENDED` is a state change, not a termination. The in-match screen stays live
and undo still walks back through it. A mis-tap on match point should be a one-tap
recovery, not a dead end.

---

## Deferred

Designed for but not built in this version:

- Cards, sanctions, and penalty points.
- The Libero Tracking Sheet document.
- Libero injury redesignation.
- Per-player entry counts (three per set).
- Season aggregate views across multiple imported matches.
