import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The green circled check on the closeout screen shipped because nothing checked it.
 * Green and red are banned as status: both are legitimate team colors and will
 * collide with a panel somewhere. A completed state is the primary text color; an
 * attention state is --flag-amber. Those are the only two.
 *
 * This scans the stylesheets rather than the DOM, so it runs without a browser and
 * fails the moment an unsanctioned color is written down.
 */

const SHEETS = ['src/index.css', 'src/ui/in-match.css', 'src/ui/sheet.css'] as const

/** Every color the app is allowed to name, and why. */
const ALLOWED = new Map<string, string>([
  // in-match.css chrome, dark theme
  ['#0b0b0f', '--app-bg dark'],
  ['#101014', '--rail-bg dark'],
  ['#1e1e26', '--border dark'],
  ['#30303a', '--border-strong dark'],
  ['#f2f2f5', '--text-primary dark'],
  ['#9a9aa4', '--text-secondary dark'],
  ['#6e6e78', '--text-muted dark'],
  ['#b8b8c2', '--control-text dark'],
  ['#1a1a21', '--control-hover dark'],
  ['rgba(0,0,0,0.62)', '--scrim dark'],
  // in-match.css chrome, light theme
  ['#efeff2', '--app-bg light'],
  ['#e0e0e5', '--border light'],
  ['#c9c9d1', '--border-strong light'],
  ['#16161a', '--text-primary light'],
  ['#55555f', '--text-secondary light'],
  ['#85858f', '--text-muted light'],
  ['#34343c', '--control-text light'],
  ['#e8e8ed', '--control-hover light'],
  ['rgba(22,22,26,0.38)', '--scrim light'],
  // shared
  ['#ffffff', '--cell-active-bg, both themes'],
  ['#e0952a', '--flag-amber, the one accent, identical in both themes'],
  ['rgba(127,127,127,0.14)', 'score-block pressed state, from the reference'],
  // index.css, the older ramp still used by the screens not yet ported
  ['#0e131a', 'legacy --bg'],
  ['#1d2836', 'legacy --surface'],
  ['#2a3746', 'legacy --surface-2'],
  ['#3a4859', 'legacy --surface-3'],
  ['rgb(255255255/0.14)', 'legacy --line'],
  ['rgb(255255255/0.26)', 'legacy --line-strong'],
  ['#eef2f7', 'legacy --fg'],
  ['#aab8c8', 'legacy --fg-dim'],
  ['#8494a5', 'legacy --fg-faint'],
  ['#fff', 'neutral white'],
  // sheet.css. The scoresheet is paper: white document, black ink, in both themes.
  ['#000', 'sheet ink'],
  ['#111', 'sheet ink'],
  ['#999', 'sheet dotted rule'],
  ['#b7b7b7', 'sheet greyed placeholder'],
  ['rgb(000/0.55)', 'sheet drop-away behind the page'],
])

function literals(css: string): string[] {
  return css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsl\([^)]*\)/g) ?? []
}

const normalise = (c: string) => c.toLowerCase().replace(/\s/g, '')

describe('color discipline', () => {
  it.each(SHEETS)('%s names only sanctioned colors', (file) => {
    const unknown = literals(readFileSync(file, 'utf8'))
      .map(normalise)
      .filter((c) => !ALLOWED.has(c))
    expect(unknown, `unsanctioned colors in ${file}`).toEqual([])
  })

  it('has no green or red status tokens anywhere in src', () => {
    for (const file of SHEETS) {
      const css = readFileSync(file, 'utf8')
      // These named a green "ok" and a red "danger". Both are gone.
      expect(css).not.toMatch(/--ok\b/)
      expect(css).not.toMatch(/--danger\b/)
      // --warn drifted from --flag-amber and became a second accent.
      expect(css).not.toMatch(/--warn\b/)
    }
  })

  it('keeps the one red in the app on the scoresheet, where it is notation', () => {
    // OHSAA writes each rotation pass in a different pen: black, then red. That is
    // content on a printed form, not a status color, and it belongs to the reducer.
    const reducer = readFileSync('src/model/reducer.ts', 'utf8')
    expect(reducer).toContain('#C0272D')
    expect(reducer).toMatch(/Even passes black, odd passes red/)
    for (const file of SHEETS) {
      expect(readFileSync(file, 'utf8')).not.toContain('C0272D')
    }
  })
})
