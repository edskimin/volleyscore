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

Tapping the scrim or pressing Escape dismisses. No shadows; the border and scrim
carry the separation.

## Controls

Buttons are outlined, never filled, except the primary action in a setup or
confirmation flow. Padding `1.2cqh` by `2cqh`, 1.5px border, `--radius-control`.
Icon plus label with a `0.8cqh` gap. Icons are `2.1cqh` inline SVG at 1.7 stroke width.

Team-scoped buttons in the action bar carry that team's derived `rule` color as their
border, so the operator knows which side a control belongs to without reading the
label. Shared controls in the centre keep `--border-strong`.

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

**Match setup and set setup.** Cards on `--rail-bg` with `--radius-panel`. Team
sections use that team's color as a left edge accent or a header underline, not as a
fill, because these screens are about data entry, not team identity. Lineup slots are
`--radius-cell` boxes with the Roman numeral as a `--type-micro` label. Toggle groups
use `--radius-control` with the selected option inverted.

**Scoresheet view.** The sheet renders as a white document on black ink regardless of
theme. It is paper. Only the chrome around it themes.

**Home.** A list of matches, each a `--rail-bg` card. Both team colors appear as small
markers, not as fills.

**Fix lineup mode.** Signal that normal rules are suspended by giving the working area
an amber border. That is the only place amber appears at any size.

## Status indicators

The rail carries a save indicator only. There is deliberately **no offline
indicator**: the app has no backend and no sync, so being offline changes nothing
about whether it works or whether data is safe. An indicator for a non-problem is
noise, and it implies a degraded state that does not exist.

## What not to do

- Do not introduce a new accent color. The palette is chrome, team colors, and amber.
- Do not use green or red for status. Red is a legitimate team color and would collide.
- Do not add shadows. Depth comes from the surface hierarchy and the scrim.
- Do not let any overlay displace the court.
- Do not add gradients.
- Do not use all-caps for anything other than the two structural labels named above.
