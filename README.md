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

## Status

Built: the reducer, the selection model, storage, and four of the seven screens —
home, match setup, set setup, and the in-match screen.

Not built yet:

- The scoresheet render (`02-scoresheet-notation.md`). The reducer already produces
  the marks; nothing draws them. The in-match screen has no "Sheet" button until it
  does.
- Adjustment mode, so the overflow menu has no "Fix lineup" entry yet.
- Match closeout, including the blocking export. Export is reachable from the overflow
  menu in the meantime.

One deliberate deviation from the spec: `SET_ENDED` is not emitted automatically when
the win condition is met. A banner offers it instead, so a mis-tap on set point stays a
one-tap recovery rather than needing two undos.
