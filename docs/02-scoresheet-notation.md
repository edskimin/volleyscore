# Scoresheet Notation

How to render the OHSAA-format sheet from the derived state. This is the part most
likely to be subtly wrong, so each rule is tagged with its source confidence.

## Sources

- **OHSAA Scoresheet PDF** (revised 1/15/15). The target form. Definitive for layout
  and the symbol key.
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
row. **[confidence: high, confirmed from the OHSAA form]**

The Player # column is split by the same dotted rule. The starter goes above,
substitutes below. **[confidence: high]**

The libero number is NEVER recorded in the Player Numbers column. It goes only in
the Libero # field. **[confidence: high]**

The floor captain is marked with a lowercase `c` after her number, for example
`12c`. **[confidence: high]**

### Running score column

Four narrow columns between the team blocks. Per team, two sub-columns: 1 to 16 and
17 to 32. **[confidence: high, from the OHSAA form. KHSAA uses 1-20 and 21-40.]**

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

## Printing

Design as an HTML page with a print stylesheet targeting **landscape letter**.

Print from a laptop, not the iPad. Desktop browsers give far more control over page
size and margins, and this is a dense layout. The iPad renders it for review during
the match; the laptop prints it after.

## Known gaps

- Whether a captain who enters as a substitute carries the `c` marking.
- Exact geometry of the `-I` mark as hand-drawn.
- Whether OHSAA expects the libero triangle in the running score column.
- Behavior if a serve order band exceeds 20 boxes. Extremely unlikely, but decide
  whether to shrink boxes or overflow into the comments.
