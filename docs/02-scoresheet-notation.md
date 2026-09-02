# Scoresheet Notation

How to render the OHSAA-format sheet from the derived state. This is the part most
likely to be subtly wrong, so each rule is tagged with its source confidence.

## Sources

- **OHSAA Scoresheet PDF** (revised 1/15/15). The target form. Definitive for layout
  and the symbol key. Its geometry has since been measured directly out of the PDF's
  vector rules; see "Sheet geometry" below. **[confidence: high, measured]**
- **VolleyWrite sample sheet** (Harding Academy v St. George's, 10/20/2016). A fully
  marked set, useful for procedure: mark sequencing within a row, the `S 3/9` sub
  notation, and the Player Number column accumulating occupants as `9, 3, 9, 3, 9`.
  **Not an OHSAA form.** Its key gives a *square* for a point from loss of rally where
  OHSAA gives a *circle*, so do not copy symbols from it.
- **NFHS Tennessee High School Volleyball Scoresheet Guide** (Funk and Goodwin, 2010).
  A slide-by-slide walkthrough of a full set on the KHSAA form. Definitive for
  marking procedure. Note the KHSAA form differs from OHSAA in one symbol: KHSAA
  squares the non-serve point, OHSAA circles it.
- **NFHS Rules Book, scoring section.** The actual authority. Not consulted directly.
- **NFHS Learn scoresheet instruction video.** Official. Not consulted directly.

Where the two consulted sources conflict, follow OHSAA for symbols and KHSAA
guidance for procedure.

## Sheet layout

Landscape. Left team block, center running score column, right team block.

Team names are written as the teams are positioned on the court from the
scorekeeper's viewpoint. **[confidence: high]** If `sidesSwitched` is true for a
set, the blocks swap.

### Team block structure

```
[First Serve X] [TEAM name]                    [Libero #]
[Player #] [Time Outs: box 1 | box 2]
+----+---------+--------------------------------------------+
| I  | 12c     | 10 boxes, top row                           |
|    | 2       | 10 boxes, bottom row                        |
+----+---------+--------------------------------------------+
| II | ...     | ...                                         |
... six bands, I through VI ...
+----+---------+--------------------------------------------+
Substitutions: 1 2 3 ... 18
Comments: ______________________________
```

**Each serve order band is two rows of 10 boxes**, separated by a dotted rule. That
is 20 boxes per band. Fill the top row left to right, then continue on the bottom
row. **[confidence: high, measured from the OHSAA form: ten vertical rules at 28.1pt
spacing across each band.]**

The Player # column is split by the same dotted rule. The starter goes above,
substitutes below. **[confidence: high]**

The libero number is NEVER recorded in the Player Numbers column. It goes only in
the Libero # field. **[confidence: high]**

The floor captain is marked with a lowercase `c` after her number, for example
`12c`. **[confidence: high]**

### Running score column

**Two** columns between the team blocks, one per team, each 28.1pt wide. Within a
column the numbers run 1 to 32 as a single vertical zigzag: 1 to 16 are left aligned
and 17 to 32 are indented to the right, interleaved line by line, so the column reads

```
1
      17
2
      18
3
      19
```

It looks like two sub-columns and behaves like two, but it is one table cell.
**[confidence: high, measured from the OHSAA form.]**

An earlier draft of this document described four narrow columns; that was wrong.
KHSAA uses 1-20 and 21-40 and is a different form.

**The column stops at 32.** This is the paper form's own limit, not the app's, and it
is not a bug to be fixed: a set that reaches 33 points for one team has no square to
mark it in on a real OHSAA sheet either. It is reachable in a long deuce (a set won
34-32 is not rare), so it will happen eventually. The app must not silently drop those
points, and it must not renumber the column to fit them, because a printed sheet whose
running score column disagrees with the official form is not a scoresheet. Continue
the count in the comments field, which is what a scorer does with a pen. Not yet
decided, and listed under Known gaps.

## The core principle

**Each box represents one play or action, recorded in chronological order in the row
of the player currently serving.** **[confidence: high]**

This is the rule that governs everything else. The strip is a chronological log of
the rally sequence, not a per-team ledger. A substitution made by the receiving team
is recorded in the SERVING team's strip, because that is where the clock is.

## Marks

### Service point

The serving team wins a rally while serving. Write the team's new running total as a
plain number in the next box of the current server's row. **[confidence: high]**

### End of service

The serving team loses the rally. Write `-I` (a dash meeting a vertical bar) in the
next box of that server's row. The OHSAA key lists these as two symbols, Loss of
Rally `-` and End of Service `I`, written together. **[confidence: high]**

### Non-serve point (side-out)

The receiving team wins the rally, gaining a point and the serve. Write the receiving
team's new running total, **circled**, in the first box of the row of their next
scheduled server. **[confidence: high for OHSAA circle; the KHSAA form uses a square
for the same mark, so do not copy from KHSAA examples]**

The same point is **circled in the running score column** as well, not slashed.
**[confidence: medium. KHSAA states explicitly that the mark applies to both the
player score and running score columns. Assumed to carry over to OHSAA's circle.]**

### Running score marks

Slash each point as it is scored. Circled for a non-serve point, slashed otherwise.
**[confidence: high]**

If the running score column and the individual service rows disagree, **the
individual service rows are official.** **[confidence: high]**

The app should therefore treat the running score as purely derived and never as a
source of truth.

### Substitution

Write in the current server's box: `S` if the serving team made the substitution,
`SX` if the receiving team did. Below or beside it, the entering player's number, a
slash, then the leaving player's number: `SX 25/23`. **[confidence: high]**

Then:
1. Add the entering player's number to the SUBBING team's Player Numbers column,
   below the dotted rule, beside the player leaving.
2. Slash the next number in that team's Substitutions row.

**[confidence: high]**

### Time out

Write `T` in the current server's box if the serving team called it, `TX` if the
opponent called it. **[confidence: high]**

Write the score in the calling team's time-out box, with the **calling team's score
first**. Two boxes per team; the second box being filled shows they have none left.
**[confidence: high]**

### Replay and re-serve

`R` for replay, `RS` for re-serve, in the next service box. Neither affects the
score. **[confidence: high]**

Both are optional in this app and are reached through the overflow menu.

### Libero

Three marks, all triangles:

1. **Serve position lock.** When a libero contacts the ball to serve, draw a triangle
   around the Roman numeral of that serve order slot. This marks the only position
   from which the libero may serve for the remainder of the set.
   **[confidence: high]**
2. **Points scored while the libero serves.** Triangle the point number in the
   service row. **[confidence: high]**
3. **Same points in the running score column.** Also triangled.
   **[confidence: medium. The OHSAA key lists "Libero Point" with a triangle without
   specifying columns. KHSAA states it applies to both Player and Running Score
   columns.]**

The triangle and the non-serve-point circle are mutually exclusive. A side-out point
is won while receiving, so no one on the scoring team served that rally and it can
never be a libero point. **[confidence: high, follows from the definitions]**

A point awarded while the libero is serving but NOT served by her, for example a
penalty point, is slashed normally, not triangled. **[confidence: medium]**

## Rotation color

**Each full pass through the serve order is written in a different color.** Start
with black or blue, red for the second rotation, black again for the third.
**[confidence: high]**

All notations made during a rotation use that rotation's color, including time outs,
substitutions, comments, and marks in the running score column.
**[confidence: high]**

On paper this is a workaround for cramped space. In a renderer it is free and makes
the sheet significantly easier to read, so keep it.

Implementation: `rotationPass = floor((serviceTurns - 1) / 6)`, per team, where
`serviceTurns` counts service turns *started* this set and the first-serving team is
initialized to 1. Counting that opening turn is required: the first-serving team does
not rotate into it, and if it is skipped the receiving team turns red one turn before
its slot I comes back up. Even passes
black `#111111`, odd passes red `#C0272D`. The two teams change color at different
points in the set, which is correct.

## Set summary

Winning team, final score, official's verification line (left blank for a human
signature), scorer name, set start time, set end time, match end time.
**[confidence: high]**

## Comments field

Free text per team per set. In this app it carries:

- Exceptional substitutions.
- ADJUSTMENT event notes.

Convention for anything score-referenced: the affected team's score is written
first, for example `(8-1)`. **[confidence: high]**

Cards and penalties are out of scope, so the standard card notations
(`Y #12 Team (7-6)`, `R #3 Team (7-3)`, `DQ #4 Team (4-14)`) are not implemented.

## Symbol key, as printed on the OHSAA form

| Meaning | Symbol |
|---|---|
| Floor Captain | `C` |
| Service Point | `1` |
| Loss of Rally | `-` |
| End of Service | `I` |
| Non-Serve Point | circled `1` |
| Penalty Point | `P1` (out of scope) |
| Replay | `R` |
| Re-Serve | `RS` |
| Time-Out | `T` |
| Time Out Opponent | `TX` |
| Substitution | `S` |
| Substitution Opponent | `SX` |
| Libero Point | triangle |

## Sheet geometry

Measured from the rectangle fills in the OHSAA PDF's content stream. The page carries
`/Rotate 90`, so display coordinates are the PDF's `(y, x)`. All values are points.

Page 792 x 612 landscape. Content is inset to x 30.4 through 757.9, a width of 727.5.

| Region | Width |
|---|---|
| Left team block | 335.5 |
| Centre running score | 56.2 (two columns of 28.1) |
| Right team block | 335.8 |

Within a team block, left to right:

| Column | Width |
|---|---|
| Serve order Roman numeral | 18.5 |
| Player # | 36 |
| Ten mark boxes | 28.1 each, 281 total |

Every row in a block must sum to 335.5 or the header will not sit over the bands. The
two header rows merge those columns as:

| Row | Cells |
|---|---|
| First Serve / TEAM / Libero # | 54.5, 196.7, 84.3 |
| Player # / Time Outs / box 1 / box 2 / rest | 54.5, 84.3, 28.1, 28.1, 140.5 |

Vertically, from the top of the table at y 119.6:

| Row | Height |
|---|---|
| Header row 1 | 21.6 |
| Header row 2 | 14.4 |
| Each of the six bands | 43.52 |
| Substitutions | 14.4 |
| Comments | 36 |

Then the SET SUMMARY bar and its two lines, and the symbol key across the foot.

Implementation note: express these as fixed flex bases with `box-sizing: border-box`,
not as grow weights. With a zero basis each cell's own padding and border distort its
share, and the columns drift by several points across a block.

## Printing

Design as an HTML page with a print stylesheet targeting **landscape letter**.

Print from a laptop, not the iPad. Desktop browsers give far more control over page
size and margins, and this is a dense layout. The iPad renders it for review during
the match; the laptop prints it after.

## Known gaps

- Whether a captain who enters as a substitute carries the `c` marking.
- Exact geometry of the `-I` mark as hand-drawn.
- Whether OHSAA expects the libero triangle in the running score column. The app draws
  it as a small triangle appended to the number rather than enclosing it, because the
  running score column is only 28.1pt wide and an enclosing triangle collides with the
  neighbouring line. The service rows do enclose it.
- What to do past running score 32. The column ends there on the printed form, so a
  set decided at 34-32 has nowhere to record the last points. Continuing in the
  comments field is the paper answer; the app currently just stops drawing.
- Behavior if a serve order band exceeds 20 boxes. Extremely unlikely, but decide
  whether to shrink boxes or overflow into the comments.
