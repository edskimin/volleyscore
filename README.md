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
| `src/state/store.ts` | Ownership of the log; the only place it is written |
| `src/db/db.ts` | Dexie stores, export, import, migration |
| `src/ui/` | Screens |
| `docs/` | The specification, and the authority for behavior |

## Documents

- [`00-overview.md`](docs/00-overview.md) — purpose, scope, stack, principles
- [`01-data-model.md`](docs/01-data-model.md) — event schema, reducer rules, storage
- [`02-scoresheet-notation.md`](docs/02-scoresheet-notation.md) — how the sheet is marked
- [`03-screens-and-flows.md`](docs/03-screens-and-flows.md) — screens and interaction

## Develop

```bash
npm install
npm run dev
```

```bash
npm test
```

## Deploy

Static build, hosted on Vercel. `vercel.json` sets the framework, the SPA rewrite, and
a no-cache header on the service worker.

```bash
npm run build
```

## Offline

The app must work with no network connection. Gym wifi is unreliable and a rally must
never wait on a network round trip. Everything lives in IndexedDB.

IndexedDB on iOS is not durable storage — Safari can evict script-writable storage
after roughly seven days without site interaction. The blocking closeout export is the
real protection against losing a match, not the per-set backup store.

**Dexie cannot change a store's primary key in an upgrade.** It throws `UpgradeError`,
the database never opens, and every screen goes blank on any device that already ran
the previous version. Adding an index is safe; changing the key is not. If a key ever
genuinely has to change, create a new store and drop the old one. A failed open now
renders an error screen rather than a blank page, but it is still fatal to scoring.

## Status

Built: the reducer, the selection model, storage, and six of the seven screens —
home, match setup, set setup, the in-match screen, the scoresheet, and closeout.

The scoresheet is laid out in points against the real OHSAA form, whose geometry was
measured out of the PDF's vector rules and is recorded in `02-scoresheet-notation.md`.
A print at 100% on landscape letter lands on the printed grid.

Match setup stays editable for the life of a match, from the set setup screen or the
in-match overflow menu. Players the event log already names cannot be removed.

Closeout is blocking by design: a match cannot be marked complete until its log has
been written out to a file. `exportedAt` on the match record is what gates it, so the
block survives a reload rather than living in component state. The home screen flags
any match that has never been exported.

Not built yet:

- Adjustment mode, so the overflow menu has no "Fix lineup" entry yet.
- The prompt to install to the home screen (durability mitigation 2 in
  `01-data-model.md`). Mitigations 1 and 3, the blocking export and the per-set
  backup store, are both in place.

One deliberate deviation from the spec: `SET_ENDED` is not emitted automatically when
the win condition is met. A banner offers it instead, so a mis-tap on set point stays a
one-tap recovery rather than needing two undos.
