import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * previewProbe queried a class a rename had removed. It matched no cards, ran zero
 * checks, and reported pass, because `[].every()` is true — for several commits, on a
 * screen nothing else measured. A guard that reports success for having done nothing
 * is worse than no guard, because it buys confidence.
 *
 * So every probe declares a minimum number of checks it must have performed, and that
 * minimum is folded into `pass` rather than returned beside it. This asserts the rule
 * holds for every probe in the file, including ones written later.
 */
const src = readFileSync('scripts/probe.js', 'utf8')

/** Each `function fooProbe(...)` and its body, by brace matching from the header. */
function probes(): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = []
  const header = /(?:async )?function (\w*Probe)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = header.exec(src)) !== null) {
    let i = src.indexOf('{', m.index)
    let depth = 0
    const start = i
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) break
    }
    out.push({ name: m[1], body: src.slice(start, i + 1) })
  }
  return out
}

describe('no probe can report success for having done nothing', () => {
  const found = probes().filter((p) => p.name !== 'probeAll')

  it('finds the probes to check', () => {
    // If this file is refactored past recognition, the tests below would all vacate —
    // which is the very failure they exist to prevent.
    expect(found.map((p) => p.name).sort()).toEqual([
      'anchorProbe',
      'colorProbe',
      'layoutProbe',
      'previewProbe',
    ])
  })

  for (const { name, body } of found) {
    it(`${name} declares what it must have seen`, () => {
      expect(body).toMatch(/const counts = \{/)
      expect(body).toMatch(/min:/)
    })

    it(`${name} folds that into pass rather than beside it`, () => {
      // `pass: en.ok && ...`, never a separate field a caller can forget to read.
      expect(body).toMatch(/const en = enough\(counts\)/)
      expect(body).toMatch(/pass:\s*\n?\s*en\.ok/)
    })
  }
})
