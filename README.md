# VolleyScore

An iPad-first web app for scoring high school volleyball matches and producing an
OHSAA-format scoresheet.

Not a commercial product. See [`docs/00-overview.md`](docs/00-overview.md) for scope.

## Architecture

**The scoresheet is a pure function of the event log plus set setup.** The live score,
court positions, rotation, and rendered sheet are all derived by folding an
append-only event log. Nothing is stored as mutable current state, which makes undo a
matter of dropping the last event and re-folding, and export a matter of serializing
the log.

Do not introduce mutable current-state storage as an optimization.

| Path | What it holds |
|---|---|
| `src/model/types.ts` | Event schema and derived state shapes |
| `src/model/reducer.ts` | The fold, rotation, and sheet-mark rules |
| `src/model/selection.ts` | What a substitution gesture means, and what is eligible |
| `src/model/lineup.ts` | Why a lineup is not ready to start, in words |
| `src/ui/palette.ts` | `derivePalette()`, ported from the reference implementation |
| `src/ui/in-match.css` | The in-match screen's styles, ported from the reference |
| `src/state/store.ts` | Ownership of the log; the only place it is written |
| `src/db/db.ts` | Dexie stores, export, import, migration |
| `src/db/db.test.ts` | Storage tests, including the version 1 to 2 upgrade path |
| `src/ui/` | Screens |
| `docs/` | The specification, and the authority for behavior |

## Documents

- [`00-overview.md`](docs/00-overview.md) — purpose, scope, stack, principles
- [`01-data-model.md`](docs/01-data-model.md) — event schema, reducer rules, storage
- [`02-scoresheet-notation.md`](docs/02-scoresheet-notation.md) — how the sheet is marked
- [`03-screens-and-flows.md`](docs/03-screens-and-flows.md) — screens and interaction
- [`04-design-tokens.md`](docs/04-design-tokens.md) — the visual language
- [`05-instructions.md`](docs/05-instructions.md) — build order and non-negotiables
- [`refeerence/in-match.html`](docs/refeerence/in-match.html) — the approved in-match
  screen, working. **The source of truth for that screen.** Open it in a browser.

## The in-match screen is a port

`src/ui/InMatch.tsx`, `src/ui/in-match.css` and `src/ui/palette.ts` are ported from the
reference implementation, not reinterpreted. Every color, size, radius and spacing value
is the reference's own, verified by measuring both in a browser: the stage geometry, the
whole type scale, and `derivePalette()` output all match exactly. `src/ui/palette.test.ts`
pins the palette against values captured by running the reference itself, so a drift
fails the suite.

The layout is deliberately **not** fluid. The app is locked to a 1180 by 820 stage and
every dimension is a share of the stage height in `cqh`. The proportions between the
score, the court and the roster row are the design.

**A derived conclusion is announced, never enforced.** The app can compute that a set
is over; only the first referee can decide it. Set and match completion appear as an
amber status line in the rail plus one primary control, with the court live and undo
reachable throughout. Nothing self-opens, scrims, or blocks. A prompt at set point that
sits in front of undo blocks it at the moment a mis-tap is most likely and most costly.

**A rule warning is a mark, not a message, and the mark has to be loud.** A hairline
outline reads as decoration and gets missed. Every warning has a two-level find path:
an amber dot beside the team name says which panel to look at, and a 3px amber outline
plus an amber dot on the cell says which object is wrong.

**A rule warning is a mark, not a message.** The warnings this app raises are states,
not events, so `computeWarnings()` derives them from the final folded state rather than
accumulating them as the log is folded, and each names the object it marks. An exhausted
substitution budget turns the whole 18 counter amber; a slot in violation gets an amber
outline on its court cell. Both clear by themselves when the condition does. The full
text sits in the overflow sheet. Never a toast, a banner, or a rail message: during a
rally the operator is looking at the court, not the corner.

**No green and no red, anywhere, as status.** Both are legitimate team colors and will
collide with a panel. A completed state is the primary text color; an attention state is
`--flag-amber`. Those are the only two, and `src/ui/colors.test.ts` enforces it by
scanning the stylesheets, so an unsanctioned color fails the suite rather than shipping.

**Nothing that can appear mid-match may displace the court.** A tap target that moves
is a mis-recorded rally. The overflow menu, the hint, the add-player sheet and the set
and match end prompts are all absolutely positioned sheets above a `--scrim`, anchored
above the action bar. Scrim tap and Escape dismiss. This is verified: the court area
measures 780px and its first cell sits at y 135 whether a sheet is open or closed.

The other screens still use `index.css` and its older tokens. The reference's styles are
scoped under `.app` and ours under `.app-root` so the two cannot reach each other.

## Develop

```bash
npm install
npm run dev
```

```bash
npm test
```

`scripts/probe.js` holds two browser probes for the in-match screen: `layoutProbe()`
asserts no overlay displaces the court, and `colorProbe()` asserts nothing renders a
color outside the chrome tokens, the derived team shades and `--flag-amber`, and that
every warning mark is amber and thick enough to find. Both exist because a defect got
past a screenshot.

**Never explain a consequence the operator cannot act on right now,** and never give
advice at the moment someone is doing the thing the advice discourages. Cut the
sentence rather than softening it.

75 tests. The reducer and selection model are pure and tested directly; the storage
layer runs against `fake-indexeddb`, including the version 1 to version 2 upgrade,
which is a real regression test — reintroducing the primary key change fails it with
Dexie's `UpgradeError`.

## Deploy

Static build, hosted on Vercel. `vercel.json` sets the framework, the SPA rewrite, and
a no-cache header on the service worker.

```bash
npm run build
```

## Export

Two paths, because standalone-PWA share sheet behavior on iOS has been inconsistent
across versions. Web Share is tried first; anything other than a deliberate cancel
falls through to a blob download. A share that is refused by a permissions policy
throws `NotAllowedError`, which must **not** be escalated — doing so strands the match
on the device with no way to write it out, and the download path exists for exactly
this case. A cancel returns `'cancelled'` and does not count as an export.

## Offline

The app must work with no network connection. Gym wifi is unreliable and a rally must
never wait on a network round trip. Everything lives in IndexedDB.

IndexedDB on iOS is not durable storage — Safari can evict script-writable storage
after roughly seven days without site interaction. The blocking closeout export is the
real protection against losing a match. Installing to the home screen helps and the
per-set backup store helps, but neither is a guarantee and the app says so.

**Dexie cannot change a store's primary key in an upgrade.** It throws `UpgradeError`,
the database never opens, and every screen goes blank on any device that already ran
the previous version. Adding an index is safe; changing the key is not. If a key ever
genuinely has to change, create a new store and drop the old one. A failed open now
renders an error screen rather than a blank page, but it is still fatal to scoring.

## Status

Built: the reducer, the selection model, storage, and all seven screens — home, match
setup, set setup, the in-match screen, the scoresheet, adjustment mode, and closeout.

The scoresheet is laid out in points against the real OHSAA form, whose geometry was
measured out of the PDF's vector rules and is recorded in `02-scoresheet-notation.md`.
A print at 100% on landscape letter lands on the printed grid.

Match setup stays editable for the life of a match, from the set setup screen or the
in-match overflow menu. Players the event log already names cannot be removed.

Closeout is blocking by design: a match cannot be marked complete until its log has
been written out to a file. `exportedAt` on the match record is what gates it, so the
block survives a reload rather than living in component state. The home screen flags
any match that has never been exported.

All three durability mitigations from `01-data-model.md` are in place: the blocking
closeout export, the install-to-home-screen prompt, and the per-set backup store.

Not built yet:

- Tests for `src/state`. The reducer, the selection model and the storage layer are
  covered; the store hook is not, because it would need jsdom and a React testing
  library for what is fairly thin glue. Worth adding if it grows.
- Everything in the Deferred list of `03-screens-and-flows.md`: cards and penalty
  points, the Libero Tracking Sheet, libero injury redesignation, per-player entry
  counts, and season aggregate views.

One deliberate deviation from the spec: `SET_ENDED` is not emitted automatically when
the win condition is met. A banner offers it instead, so a mis-tap on set point stays a
one-tap recovery rather than needing two undos.
