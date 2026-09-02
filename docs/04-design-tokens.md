# Design Tokens

The reference implementation at `reference/in-match.html` is the source of truth for
the in-match screen. This document is the source of truth for **every screen the
reference does not cover**.

Rule: never invent a color, radius, or size. If a screen needs something not defined
here, ask rather than choosing.

## Theming

Two themes, switched with `data-theme="dark"` or `data-theme="light"` on the root
element. Every chrome value is a CSS custom property. Nothing hardcodes a chrome color.

Dark is the default. The theme choice persists in local storage.

### Chrome palette

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--app-bg` | `#0B0B0F` | `#EFEFF2` | Page background |
| `--rail-bg` | `#101014` | `#FFFFFF` | Header rail, action bar, sheets, cards |
| `--border` | `#1E1E26` | `#E0E0E5` | Hairline separators |
| `--border-strong` | `#30303A` | `#C9C9D1` | Button and input outlines |
| `--text-primary` | `#F2F2F5` | `#16161A` | Headings, values, primary content |
| `--text-secondary` | `#9A9AA4` | `#55555F` | Supporting text |
| `--text-muted` | `#6E6E78` | `#85858F` | Labels, disabled, metadata |
| `--control-text` | `#B8B8C2` | `#34343C` | Button labels |
| `--control-hover` | `#1A1A21` | `#E8E8ED` | Pressed state |
| `--cell-active-bg` | `#FFFFFF` | `#FFFFFF` | Selected or serving court cell |
| `--scrim` | `rgba(0,0,0,0.62)` | `rgba(22,22,26,0.38)` | Behind an open sheet or menu |
| `--flag-amber` | `#E0952A` | `#E0952A` | Rule-broken or exceptional markers |

Amber is identical in both themes. It is the only accent color in the app and it
means exactly one thing: something happened outside the normal rules. Never use it
decoratively.

## Team colors

**Team colors are content, not chrome.** They come from match setup, stay fully
saturated in both themes, and must never be replaced by palette values.

Each team supplies one primary hex. Every other shade is derived at runtime by
`derivePalette()` in the reference file. Port that function; do not hand-pick shades,
because the operator can choose any color.

Derived roles:

| Role | Derivation | Used for |
|---|---|---|
| `base` | the primary hex | Panel background while serving |
| `dim` | dark theme: lightness minus 7. light theme: saturation times 0.4, lightness plus 16 | Panel background while receiving |
| `cellFront` | lightness plus 8 | Front-row court cells |
| `cellBack` | lightness plus 4 | Back-row court cells, available roster chips |
| `rule` | lightness plus 10 | Hairlines inside a panel, on-court chip outline, unused sub numbers |
| `ink` | white, or near-black if the team color is pale | Score, player numbers, team name |
| `inkMuted` | derived from base | Roman numerals, history trails, secondary text on a panel |
| `inkFaint` | derived from base | Tertiary text on a panel |

Two things this handles that a fixed palette would not:

- **Pale team colors.** If relative luminance exceeds 0.42, for example a gold or
  yellow team, `ink` flips to near-black so the score stays readable.
- **Theme-correct dimming.** In dark mode the receiving panel recedes by darkening.
  In light mode it recedes by desaturating and lifting, because on a pale background
  darkening reads as heavier rather than quieter.

Warn during setup if the two teams' colors are too close, since telling the panels
apart at a glance is the whole design.

## State language

These meanings are consistent everywhere in the app. Do not introduce a fourth state.

| State | Treatment | Meaning |
|---|---|---|
| Filled | solid `cellBack` background | Available, tappable |
| Outlined | transparent with `rule` border | Already in use, inert |
| Faded to 28 percent | reduced opacity | Not tappable in this context |
| Inverted | white background, team-colored text | Selected, or currently serving |

The roster row reads left to right on **both** sides. Only the score block, the court
grid, and the action bar mirror. Reading order never mirrors.

**Dimmed always means not tappable.** There are no dimmed-but-tappable controls.
Overriding a rule happens in Fix lineup mode, never by tapping through a dimmed
control.

## Layout model

The app is locked to the iPad landscape aspect ratio, 1180 by 820, or 1.44:1. A
`.stage` element sizes itself to fit the viewport and centres; the `.app` inside it is
a CSS size container. Every dimension is then expressed in `cqh`, one percent of the
stage height.

This is deliberate and must be preserved. A fluid layout lets the score and the court
fly to opposite edges of a wide window and leaves the panel full of dead space. **The
proportions between the score, the court, and the roster row are the design.** On a
real iPad the stage is the full screen, so this costs nothing.

## Type

One family: the system sans stack. No second display face.

Sizes are shares of the stage height. The px equivalents are at an 820px-tall stage,
which is iPad landscape.

| Token | Size | At 820px | Used for |
|---|---|---|---|
| `--type-score` | `18cqh` | 148px | The two score numbers |
| `--type-team` | `max(15px, 2.9cqh)` | 24px | Team names |
| `--type-cell` | `max(24px, 6cqh)` | 49px | Jersey number in a court cell |
| `--type-cell-label` | `max(13px, 2.3cqh)` | 19px | Roman numerals in court cells |
| `--type-cell-hist` | `max(12px, 1.95cqh)` | 16px | History trails in court cells |
| `--type-chip` | `max(14px, 2.6cqh)` | 21px | Roster chip numbers |
| `--type-body` | `max(12px, 1.9cqh)` | 16px | Buttons, serve line, general text |
| `--type-label` | `max(11px, 1.7cqh)` | 14px | Labels, metadata |
| `--type-micro` | `max(12px, 2cqh)` | 16px | Substitution counter |

The Roman numeral badge on a bench chip is `max(11px, 1.85cqh)`, 15px at an 820px
stage.

The `max()` floors keep small text legible when the stage is small. Never go below
11px. All numeric displays use `font-variant-numeric: tabular-nums`
so digits do not jitter as values change.

Sentence case for all interface text. The two exceptions, both already in the
reference, are the level label in the rail and the word Set in the centre divider,
which are set in small tracked capitals as structural markers.

## Space and shape

Spacing scale, also in stage-height shares: `0.5cqh`, `1cqh`, `1.5cqh`, `2cqh`.
At an 820px stage that is roughly 4, 8, 12, and 16px.

| Radius | Value | At 820px | Used for |
|---|---|---|---|
| `--radius-panel` | `2cqh` | 16px | Team panels, sheets, large cards |
| `--radius-cell` | `1.2cqh` | 10px | Court cells, score tap area |
| `--radius-chip` | `0.85cqh` | 7px | Roster chips |
| `--radius-control` | `1.1cqh` | 9px | Buttons, inputs, toggles |

Key component sizes: court cell `19cqh` wide by `18.4cqh` tall, roster chip `5cqh`
tall, centre divider `7cqh` wide.

The court is deliberately large. On a real iPad the panel is much taller than it is
wide, and a small court leaves voids above and below it. Sizing the court to fill that
height removes the dead space and buys bigger tap targets and more legible numbers at
the same time.

Radius encodes scale. Do not apply one radius to everything.

## Overlays

**Nothing that can appear mid-match may displace the court.** A tap target that moves
is a mis-recorded rally. Sheets, menus, pickers, and the hint all float above the
court behind a `--scrim`, anchored to whatever opened them. They never push layout.

Sheets use `--rail-bg`, a 1px `--border`, and `--radius-panel`. Width is
`min-width: var(--sheet-min)` (48cqh) and `max-width: var(--sheet-max)` (86cqh).
A sheet anchored above the action bar sits at `bottom: 11cqh`.

**A sheet anchors to the side of the thing it acts on.** Adding a player to the home
team opens the sheet on the left; to the visiting team, on the right. The screen is
already mirrored, so a sheet that ignores that forces the operator to re-read a title
they would otherwise not need. Use `.sheet-left`, `.sheet-right`, or `.sheet-centre`
for sheets that belong to neither team.

Tapping the scrim or pressing Escape dismisses. No shadows; the border and scrim
carry the separation.

## Screen position is not team role

The two panels are the **left team** and the **right team**. Home and visitor are tags
on a team, rendered as a small label beside the name, never a position.

This is not a preference. The OHSAA sheet is written as the teams stand on the court
from the scorekeeper's viewpoint, so which side a team occupies is already a required
per-set fact. And the operator cannot reliably score a screen that mirrors what is in
front of them, which depends on where they are sitting, not on who is hosting.

So: set setup asks which team is on your left, and the in-match overflow carries a
flip. Both write the same per-set fact.

**Side never enters the event log.** Events are keyed to team identity, so a flip is a
rendering change plus a per-set record. Flipping mid-set corrupts nothing, which is
what makes it safe to offer as a casual control rather than a guarded one.

Everything positional keys off `left` and `right`: the court grid mapping, panel
mirroring, action bar groups, and sheet anchoring.

## Announcing state without interrupting

Two rules that govern anything the app wants to tell the operator mid-match.

**A derived conclusion is announced, never enforced.** The app can compute that a set
is over. Only the first referee can decide it. So set complete and match complete
appear as an amber status line in the rail plus a primary "end set" control, with the
court fully live and undo reachable throughout. They never open a modal, never scrim,
and never self-dismiss. A prompt at set point that blocks undo is the worst possible
moment to block undo.

**A rule warning is a mark, not a message, and the mark has to be loud.** A hairline
outline reads as decoration and gets missed, which defeats the whole approach. Give
every warning a two-level find path: an amber dot beside the team name says which
panel to look at, and a 3px amber outline plus an amber dot on the cell says which
object is wrong.

The warnings this app raises are states,
not events: a libero about to serve from a second slot, a sub budget exhausted. Mark
the object that is wrong and let the mark persist until the condition clears. An
exhausted budget turns the whole 18 counter amber. A slot in violation gets the 3px
amber outline and cell dot described above. Never a toast, a banner, or a rail
message: during a
rally the operator is looking at the court and the scores, and a line in the corner
will not be read. The overflow sheet carries the full text of any active warning for
when there is a moment to read it.

## Controls

Buttons are outlined, never filled, except the primary action in a setup or
confirmation flow. A primary button is filled with `--text-primary` and its label is
`--app-bg`. There is at most one primary **per layer**.

A scrim defines a layer. While a sheet is open, nothing beneath it is actionable and
the scrim already renders anything below it as recessive, so a primary in the sheet
and a primary in the base screen do not compete. Do not swap the base screen's primary
to outlined when a sheet opens; that adds a state transition to solve a problem the
scrim has already solved.

Two primaries in the SAME layer is the real violation, and it means the screen has two
answers to "what should I do next". Pick one and outline the other. On match closeout,
export is the primary; finishing and closing is not. Padding `1.2cqh` by `2cqh`, 1.5px border, `--radius-control`.
Icon plus label with a `0.8cqh` gap. Icons are `2.1cqh` inline SVG at 1.7 stroke width.

Team-scoped buttons in the action bar carry that team's derived `rule` color as their
border, so the operator knows which side a control belongs to without reading the
label. Shared controls in the centre keep `--border-strong`.

**Only genuine team actions belong in a team's side of the bar.** A time out is one:
a team calls it, it counts against that team's two, and the score goes in that team's
box on the sheet. A replay is not: it is a referee decision about the rally, and the
mark goes in the current server's box whoever caused it. Mirroring a control that has
no side implies a choice that does not exist. Replay and re-serve live in the overflow.

**Show a budget by showing what was spent, not by counting it.** Each team's time outs
render as two slots beside the button, each holding the score at the moment it was
called, calling team's score first, which is exactly what the OHSAA time-out box wants.
Filled slots are spent and empty ones remain, so remaining capacity is legible without
a number, and the button disables at two. Prefer this shape wherever a budget has few
enough units to display and each unit carries data worth keeping.

Minimum touch target 44px. Court cells, chips, and score areas already exceed this.

## Motion

Transitions are 120 to 140ms ease, and only on background-color and opacity. They
confirm a change; they never gate one.

No entrance animations, no page transitions, no hover effects. This is a tool used
under time pressure.

Respect `prefers-reduced-motion: reduce` by disabling all transitions.

## Screens not in the reference

Build these from the tokens above.

These live on the same 1180 by 820 stage and use the same `cqh` sizing.

**Set setup** now has its own reference at `reference/set-setup.html`. Two rules it
encodes are worth stating generally:

*Enter data in the shape of its source; verify it in the shape of reality.* Serve order
is entered as a linear I through VI list because that is the shape of the lineup sheet
being transcribed. The resulting court is shown live beside it because that is the
shape of the players on the floor, and comparing the two is what catches a
transcription error. These are not competing layouts; each matches a different physical
artifact.

*Make the common path the shortest one.* Tapping six roster chips in serve order fills
I through VI by auto-advance. Selecting a slot is for correction only. Requiring a slot
tap before every entry would double the taps on a screen used before every set.

*An invariant is enforced from both directions.* A designated libero is not one of the
six, so designating her clears her from the serve order AND fades her chip to 28
percent so she cannot be tapped back in. Untoggling her designation restores her, which
is why fading is right and removing her from the row is not: she is conditionally
unavailable, not absent, and the fade makes the toggle's effect visible.

**Match setup and set setup.** Cards on `--rail-bg` with `--radius-panel`. Team
sections use that team's color as a left edge accent or a header underline, not as a
fill, because these screens are about data entry, not team identity. Lineup slots are
`--radius-cell` boxes with the Roman numeral as a `--type-micro` label. Toggle groups
use `--radius-control` with the selected option inverted.

**Scoresheet view.** The sheet renders as a white document on black ink regardless of
theme. It is paper. Only the chrome around it themes.

**Home.** A list of matches, each a `--rail-bg` card. Both team colors appear as small
markers, not as fills.

**Match closeout.** Cards on `--rail-bg`. Include a direct control to open the
scoresheet for any set, since checking the sheet before exporting is the natural last
step. The export state is the primary action on the screen.

**Fix lineup mode.** Signal that normal rules are suspended by giving the working area
an amber border. That is the only place amber appears at any size.

## Status indicators

The rail carries a save indicator only. There is deliberately **no offline
indicator**: the app has no backend and no sync, so being offline changes nothing
about whether it works or whether data is safe. An indicator for a non-problem is
noise, and it implies a degraded state that does not exist.

## Writing in the interface

Never explain a consequence the operator cannot act on right now, and never give
advice at the moment someone is doing the thing the advice discourages. A sheet that
opens because you tapped "add player" should let you add a player, not tell you that
you should have entered the number earlier. Cut the sentence rather than softening it.

Labels and field names carry most of the meaning. If a panel needs a paragraph to be
usable, the panel is wrong.

## What not to do

- Do not introduce a new accent color. The palette is chrome, team colors, and amber.
- Do not use green or red for status, including check marks, success badges, and
  validation ticks. Both are legitimate team colors and will collide with a panel
  somewhere in the app. A completed state is `--text-primary`; an attention state is
  `--flag-amber`. Those are the only two.
- Do not add shadows. Depth comes from the surface hierarchy and the scrim.
- Do not let any overlay displace the court.
- Do not put a modal in front of undo, at set point or anywhere else.
- Do not report a rule violation as a message when it can be a mark.
- Do not add gradients.
- Do not use all-caps for anything other than the two structural labels named above.
