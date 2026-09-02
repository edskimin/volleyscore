import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The stage screens (.app) and the screens still on the older tokens (.app-root)
 * share a stylesheet bundle, so a class name used by both leaks across. This has bitten
 * three times: .home matching a screen and a team panel, .field matching a wrapper and
 * an input, and .slot's min-height overriding the set setup slot's height, which
 * specificity alone does not fix because they are different properties.
 *
 * Rule: any selector in index.css naming a class the stage stylesheets also use must be
 * scoped to .app-root.
 */

function stageClassNames(): Set<string> {
  const names = new Set<string>()
  for (const file of ['src/ui/in-match.css', 'src/ui/set-setup.css']) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)) names.add(m[1])
  }
  for (const own of ['app', 'in-match', 'set-setup', 'stage']) names.delete(own)
  return names
}

/** Top-level selectors, with comments blanked so they are never read as selectors. */
function topLevelSelectors(css: string): string[] {
  const blanked = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < blanked.length; i++) {
    const c = blanked[i]
    if (c === '{') {
      if (depth === 0) {
        const sel = blanked.slice(start, i).trim()
        if (sel && !sel.startsWith('@')) out.push(...sel.split(',').map((s) => s.trim()))
      }
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) start = i + 1
    }
  }
  return out.filter(Boolean)
}

describe('stylesheet scoping', () => {
  it('never lets index.css reach a class the stage screens use', () => {
    const stage = stageClassNames()
    const leaking = topLevelSelectors(readFileSync('src/index.css', 'utf8')).filter((sel) => {
      if (sel.startsWith('.app-root')) return false
      const names = [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])
      return names.some((n) => stage.has(n))
    })
    expect(leaking, 'these must be scoped to .app-root').toEqual([])
  })

  it('keeps the shared .app token block unscoped so every stage screen gets it', () => {
    // A prefixing pass once turned `.app {` into `.app.in-match {`, which silently
    // stripped set setup of --s1..--s4, the radii and container-type: size. Several
    // measurements still matched by coincidence.
    const css = readFileSync('src/ui/in-match.css', 'utf8')
    expect(css).toMatch(/^\.app \{/m)
    const block = css.slice(css.indexOf('\n.app {'))
    for (const token of ['--s1:', '--s4:', '--radius-panel:', 'container-type: size']) {
      expect(block.slice(0, 900)).toContain(token)
    }
  })

  it('scopes every other in-match rule, including comma continuations', () => {
    // `, .app .rail-right` survived a first pass that only matched line starts.
    const css = readFileSync('src/ui/in-match.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const unscoped = [...css.matchAll(/(^|,\s*)\.app\s+\.[\w-]+/gm)].map((m) => m[0].trim())
    expect(unscoped).toEqual([])
  })
})
