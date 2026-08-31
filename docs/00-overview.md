# Volleyball Scoring App: Overview

## Purpose

An iPad-first web app for scoring high school volleyball matches and producing an OHSAA-format scoresheet. Built for personal use, scoring a daughter's high school team from either the stands or near the scorer's table. Not a commercial product.

## Goals

1. Make recording a rally as fast and error-resistant as possible during live play.
2. Render an official-format scoresheet at any time, during or after the match.
3. Look substantially better than existing volleyball scoring software.

## Non-goals

Explicitly out of scope for this version:

- Player statistics of any kind: kills, digs, aces, assists, blocks, errors.
- Cards, sanctions, and penalty points (yellow, red, disqualification).
- The separate Libero Tracking Sheet document.
- Libero injury redesignation.
- Multi-match tournament management.
- Season aggregate statistics across matches.
- User accounts, authentication, and server-side sync.
- Selling or distributing to other users.

Libero replacement tracking IS in scope. It began as a non-goal but was added because without it the app misattributes serves and points to the player the libero replaced.

## Technology

- React PWA, installed to the iPad home screen so it runs full screen.
- Local-first. All state in IndexedDB, accessed through Dexie.js.
- No backend, no database server, no authentication.
- Static hosting on Vercel or GitHub Pages.
- Portability through JSON file export and import.

The app must work with no network connection. Gym wifi is unreliable and a rally must never wait on a network round trip.

## Core architectural principle

**The scoresheet is a pure function of the event log plus set setup.**

Everything the app displays — the live score, the court positions, the rotation, the rendered scoresheet — is derived by folding an append-only event log. Nothing is stored as mutable current state.

This gives three things for free:

- "View the scoresheet at any time" is just running the fold and rendering.
- Undo is dropping the last event and re-folding.
- Export is serializing the log.

Every design decision downstream depends on this. Do not introduce mutable current-state storage as an optimization.

## Document set

- `00-overview.md` (this document): purpose, scope, stack, principles.
- `01-data-model.md`: event schema, reducer rules, storage, export format.
- `02-scoresheet-notation.md`: how the printed sheet is marked.
- `03-screens-and-flows.md`: screen inventory and interaction design.

## Glossary

- **Set**: one game to 25 (or 15, configurable). A match is best of 3 or best of 5.
- **Serve order slot**: one of six positions in the serving rotation, labeled with Roman numerals I through VI. This is the row on the scoresheet. Slots are stable for a set. Players move between slots only by substitution or libero replacement.
- **Court position**: one of six physical spots on the court, numbered 1 through 6. Position 1 is right back and is the serving position. Positions rotate.
- **Service turn**: one continuous period during which a team holds serve.
- **Rotation pass**: one full cycle of all six serve order slots. Used to determine pen color on the scoresheet.
- **Side-out**: the receiving team wins the rally, gaining a point and the serve.
- **Libero replacement**: the libero entering or leaving the court. Not a substitution. Does not count against the 18 substitution limit.
