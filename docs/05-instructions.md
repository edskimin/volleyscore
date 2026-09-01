# Instructions for Claude Code

Read this first.

## What this package is

A complete design and technical specification for an iPad volleyball scoring app,
plus a working reference implementation of the main screen.

```
00-overview.md              purpose, scope, stack, principles
01-data-model.md            event schema, reducer rules, storage, export
02-scoresheet-notation.md   how the printed sheet is marked
03-screens-and-flows.md     screen inventory and interaction design
04-design-tokens.md         the visual language
05-instructions.md          this file
reference/in-match.html     the approved in-match screen, working
```

## The single most important instruction

**Open `reference/in-match.html` in a browser before writing any code.**

It is not a mockup image or a description. It is the approved design, running, with
the substitution and rotation logic implemented. Click the scores. Do a substitution.
Toggle the theme button.

Your job for that screen is to **port it, not to redesign it**. Every color, size,
radius, and spacing value in that file was decided deliberately. Copy them.

If you find yourself choosing a color, stop. Either the value is in the reference
file, or it is in `04-design-tokens.md`, or you should ask.

### Do not make the layout fluid

The app sits on a fixed 1180 by 820 stage that scales to fit the viewport, and every
dimension is a share of the stage height in `cqh` units. This looks like something
worth "improving" into a responsive layout. It is not. A fluid layout throws the score
and the court to opposite edges of a wide window and fills the panel with dead space.
The proportions between the score, the court, and the roster row are the design. On a
real iPad the stage is the full screen, so this costs nothing.

## Build order

1. **The reducer and its tests, first.** A wrong fold produces a scoresheet that
   looks correct and is wrong, which is the worst possible failure for this app.
   Write it as a pure function: `(setup, events) => DerivedState`. Test it against
   hand-computed sequences before any UI exists.
2. **The in-match screen**, ported from the reference and wired to the reducer.
3. **Set setup**, so a real match can be started.
4. **Scoresheet renderer.**
5. **Export, import, and match closeout.**
6. **Match setup and home screen.**

Steps 1 through 3 are the minimum to score a live match, which is the fastest way to
find out what is actually wrong with the design.

## Non-negotiables

**The scoresheet is a pure function of the event log.** Never store derived state.
Never mutate current state and persist it. Every display, including the live score,
comes from folding the log. This makes undo trivial and export free. If you are
tempted to cache derived state for performance, do not; folding a full match is a few
hundred events.

**The app must work fully offline.** No network call may ever sit between a tap and a
recorded rally. No backend, no auth, no server-side anything.

**Undo must work for every event type**, including set end and match end. Nothing is
ever locked or destroyed.

**Dimmed means not tappable.** One meaning, everywhere. Rule overrides happen only in
Fix lineup mode.

**Jersey numbers are strings.** They are identifiers, not quantities. Sort numerically
for display, never do arithmetic.

**Set `schemaVersion` from day one** and write a migration function even if it is a
no-op. The event shape will change after the first real match, and last season's
exported files must stay readable.

## Things that will tempt you and should not

- Adding a status color. Green and red are not available; red is a legitimate team
  color. Amber means one thing only: a rule was broken deliberately.
- Filling buttons. Buttons are outlined except for the primary action in setup and
  confirmation flows.
- Adding shadows, gradients, or entrance animations. Depth comes from the surface
  hierarchy. This is a tool used under time pressure.
- Making the libero flow a special case of substitution. It is a separate event type
  and must never touch the 18-substitution counter.
- Blocking the operator on a judgment call. Warn instead. The second referee makes
  rulings, not the tablet.
- Storing team colors as theme values. They are content and stay saturated in both
  themes.

## Where the spec is deliberately uncertain

`02-scoresheet-notation.md` tags every notation rule with a confidence level. The
rules came from instructional materials rather than the NFHS rules book itself.

Two specific traps:

- **OHSAA circles the non-serve point. KHSAA squares it.** Much of the available
  instructional material uses the KHSAA form. Do not copy symbols from those examples.
- **Each serve-order band is two rows of ten boxes**, not one strip and not two
  rotation columns. Fill the top row, then the bottom.

`00-overview.md` lists open items to verify against the current rules book. Where a
rule is uncertain, the design makes it configurable rather than guessing. Preserve
that; do not hardcode a default you found in a document.

## Questions to ask rather than guess

- Any color, size, or radius not in the reference file or the tokens document.
- Any rules behavior not covered in the data model document.
- Any place where following the spec would require inventing a screen layout that
  the tokens do not clearly determine.

Asking costs one message. Guessing costs a rebuild.
