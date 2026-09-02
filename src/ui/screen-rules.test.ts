import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * There is no DOM in this suite, so these screens' rules cannot be exercised. What
 * can be checked is that the rule is still written down. Each of these is a fact that
 * was wrong once, produced a plausible-looking screen, and was only visible on the
 * artifact that gets kept.
 */
const src = (path: string) => readFileSync(path, 'utf8')

describe('a result is declared by the format, never by a lead', () => {
  it('closeout asks the fold whether the match is over', () => {
    // "Sets won differ" says who is ahead. In a best of five 2-1 is a lead and the
    // match is still on, but it read as a win, named a winner and marked the match
    // complete. matchComplete is the only thing that knows the format.
    const s = src('src/ui/Closeout.tsx')
    expect(s).toContain('state.matchComplete')
    expect(s).not.toMatch(/setsWon\.home\s*!==\s*state\.setsWon\.visitor/)
  })

  it('the sheet names a winner only for a set that has one', () => {
    // A set in progress has a leader, which is a different fact. Falling back to it
    // wrote "Avon Lake" into the set summary at 10-8.
    const s = src('src/ui/Scoresheet.tsx')
    expect(s).toContain('result?.winner ?? null')
    expect(s).not.toMatch(/winner[^\n]*\n[^\n]*state\.score\.home >/)
  })
})

describe('a match is never routed somewhere it cannot render', () => {
  it('opening a match derives its route instead of assuming the court', () => {
    // A match whose log has no SET_STARTED has no lineup, so the court cannot be
    // drawn and the screen throws. Opening straight to it made such a match
    // impossible to reopen. See src/state/route.test.ts for the crash itself.
    const s = src('src/App.tsx')
    expect(s).toContain('routeForMatch(store.state)')
    const onOpen = s.slice(s.indexOf('onOpen={'), s.indexOf('onOpen={') + 400)
    expect(onOpen).toContain('setRoute(null)')
    expect(onOpen).not.toContain("setRoute('inMatch')")
  })
})

describe('finishing a match is an event, not navigation', () => {
  it('every route into closeout records MATCH_ENDED once', () => {
    // Recorded on one button, the other two ways in left the sheet's Match End time
    // blank. Recorded on the route, every way in writes it, and the guard keeps a
    // second visit from writing it twice.
    const s = src('src/App.tsx')
    expect(s).toMatch(/const goCloseout[\s\S]*?MATCH_ENDED[\s\S]*?setRoute\('closeout'\)/)
    expect(s).not.toContain("onCloseout={() => setRoute('closeout')}")
    // Not also written by the button that happens to be nearest.
    expect(src('src/ui/InMatch.tsx')).not.toContain("append({ type: 'MATCH_ENDED'")
  })
})

describe('nothing is scored into a set that is not running', () => {
  it('gates every control that writes an event on the set being in progress', () => {
    // Between sets the screen stays reachable so undo works and the last set can be
    // read back. Taps that reached the log there were inert but exported, and the log
    // is the source of truth.
    const s = src('src/ui/InMatch.tsx')
    expect(s).toContain('const live = state.setInProgress')
    for (const control of [
      'className="score-block"\n            disabled={!live}',
      'disabled={blocked || !live}',
      'disabled={here || !eligible || !live}',
    ]) {
      expect(s).toContain(control)
    }
    // Both timeout buttons.
    expect(s.match(/disabled=\{!live \|\| state\.teams\[teamAt\('(left|right)'\)\]\.timeoutsUsed/g))
      .toHaveLength(2)
  })

  it('offers the way forward instead of a control it cannot honour', () => {
    expect(src('src/ui/InMatch.tsx')).toContain("label: 'start next set'")
  })

  it('says so in the serve-state language rather than a new treatment', () => {
    // Base means serving, dim means not serving. Between sets nobody is serving, so
    // both panels go dim and the screen loses its centre of gravity, which is what
    // "no rally is happening" already looks like. Dimming by any other means would
    // have collided with a meaning the operator has learned. One value drives all
    // three serve indications: panel tint, inverted cell, serve line.
    const s = src('src/ui/InMatch.tsx')
    expect(s).toContain('const serving = live && state.serveTeam === side')
    expect(s).toContain('const isServer = serving && courtPos === 1')
    expect(s).toContain('style={{ background: serving ? p.base : p.dim }}')
    // Blank, not "receiving": neither team is.
    expect(s).toContain('{!live ? null : serving ? (')
    // The line keeps its box so the centred score does not shift when it empties.
    expect(src('src/ui/in-match.css')).toMatch(/\.serve-line \{[^}]*min-height: 1lh/s)
  })
})
