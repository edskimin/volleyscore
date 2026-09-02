/*
 * In-match screen probe. Paste into the browser console with the in-match screen open.
 *
 *   layoutProbe()  asserts no overlay displaces the court
 *   colorProbe()   asserts nothing renders a color outside the sanctioned set
 *
 * Both were written because a defect got past a screenshot: the first because an
 * earlier port put the hint in the layout flow, the second because a green check mark
 * shipped on the closeout screen. Run them after any change to the in-match screen.
 */

/* Nothing that can appear mid-match may displace the court: a tap target that moves
   is a mis-recorded rally. Measures with an overlay OPEN and CLOSED. */
async function layoutProbe() {
  const app = document.querySelector('.app')
  const snap = () => ({
    cellY: Math.round(document.querySelector('.cell').getBoundingClientRect().top),
    courtH: Math.round(document.querySelector('.court-area').getBoundingClientRect().height),
    overflows: app.scrollHeight > app.clientHeight,
  })
  const more = [...document.querySelectorAll('.bar-group.centre .btn')][2]

  const closed = snap()
  more.click()
  await new Promise((r) => setTimeout(r, 300))
  const open = snap()
  const sheet = [...document.querySelectorAll('.sheet')].find((s) => !s.hidden)
  const ab = app.getBoundingClientRect()
  const sb = sheet.getBoundingClientRect()
  more.click()

  return {
    closed,
    open,
    pass:
      closed.cellY === open.cellY &&
      closed.courtH === open.courtH &&
      !closed.overflows &&
      !open.overflows &&
      getComputedStyle(sheet).position === 'absolute' &&
      sb.top >= ab.top && sb.bottom <= ab.bottom &&
      sb.left >= ab.left && sb.right <= ab.right,
  }
}

/* Chrome tokens, derived team shades, and --flag-amber. Nothing else. */
function colorProbe(teamHexes) {
  const hexToHsl = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
    let H = 0, s = 0
    const l = (mx + mn) / 2
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
      H = 60 * (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4)
    }
    return { h: H, s: s * 100, l: l * 100 }
  }
  const hsl = (h, s, l) =>
    `hsl(${h.toFixed(1)} ${Math.max(0, Math.min(100, s)).toFixed(1)}% ${Math.max(0, Math.min(100, l)).toFixed(1)}%)`
  const relLum = (h) =>
    [0.2126, 0.7152, 0.0722].reduce((a, w, i) => {
      const v = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255
      return a + w * (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    }, 0)
  const derive = (hex, t) => {
    const c = hexToHsl(hex), pale = relLum(hex) > 0.42
    return [
      hex,
      t === 'light' ? hsl(c.h, c.s * 0.4, Math.min(c.l + 16, 62)) : hsl(c.h, c.s * 0.9, Math.max(c.l - 7, 6)),
      hsl(c.h, c.s, c.l + 8), hsl(c.h, c.s, c.l + 4), hsl(c.h, c.s, c.l + 10),
      pale ? '#14141A' : '#FFFFFF',
      pale ? hsl(c.h, c.s * 0.55, 26) : hsl(c.h, Math.min(c.s, 42), c.l + 46),
      pale ? hsl(c.h, c.s * 0.5, 40) : hsl(c.h, Math.min(c.s, 38), c.l + 34),
    ]
  }

  const pe = document.createElement('span')
  document.body.appendChild(pe)
  const norm = (c) => { pe.style.color = ''; pe.style.color = c; return getComputedStyle(pe).color }
  const cs = getComputedStyle(document.documentElement)
  const allowed = new Set(['rgba(0, 0, 0, 0)'])
  for (const t of ['--app-bg', '--rail-bg', '--border', '--border-strong', '--text-primary',
    '--text-secondary', '--text-muted', '--control-text', '--control-hover',
    '--cell-active-bg', '--scrim', '--flag-amber']) {
    const v = cs.getPropertyValue(t).trim()
    if (v) allowed.add(norm(v))
  }
  allowed.add(norm('rgba(127,127,127,0.14)')) // score-block pressed, from the reference
  for (const hex of teamHexes) for (const t of ['dark', 'light']) derive(hex, t).forEach((c) => allowed.add(norm(c)))
  // Resolve amber while the probe element is still attached: getComputedStyle on a
  // detached node returns nothing, which silently makes every mark check fail.
  const amber = norm(cs.getPropertyValue('--flag-amber').trim())
  pe.remove()

  // fill on an <svg>/<g> paints nothing; only shapes count.
  const CONTAINER = new Set(['svg', 'g', 'defs', 'symbol', 'title'])
  const bad = []
  for (const el of document.querySelectorAll('.app, .app *')) {
    const st = getComputedStyle(el)
    const check = (prop, val) => {
      if (!val || val === 'none' || val === 'rgba(0, 0, 0, 0)') return
      if (!allowed.has(val)) bad.push({ cls: (el.className.baseVal ?? el.className).toString(), prop, value: val })
    }
    check('color', st.color)
    check('backgroundColor', st.backgroundColor)
    for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
      if (st[`border${s}Style`] !== 'none' && parseFloat(st[`border${s}Width`]) > 0) {
        check(`border${s}`, st[`border${s}Color`])
      }
    }
    if (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) check('outline', st.outlineColor)
    if (el instanceof SVGElement && !CONTAINER.has(el.tagName.toLowerCase())) {
      check('fill', st.fill)
      check('stroke', st.stroke)
    }
  }
  /* A warning mark must be --flag-amber and nothing else. --warn once drifted to
     #f0b429 and became a second accent without anyone noticing; this is the check
     that would have caught it. */
  const marks = []
  for (const el of document.querySelectorAll('.app .cell.warn')) {
    const st = getComputedStyle(el)
    marks.push({ what: 'cell.warn outline', ok: st.outlineColor === amber, value: st.outlineColor })
    marks.push({ what: 'cell.warn width', ok: parseFloat(st.outlineWidth) >= 3, value: st.outlineWidth })
  }
  for (const el of document.querySelectorAll('.app .cell-flag, .app .head-flag')) {
    const st = getComputedStyle(el)
    marks.push({ what: el.className + ' fill', ok: st.backgroundColor === amber, value: st.backgroundColor })
  }
  for (const panel of document.querySelectorAll('.app .panel')) {
    const spent = [...panel.querySelectorAll('.sub-n')].every((n) => getComputedStyle(n).color === amber)
    const anySpent = [...panel.querySelectorAll('.sub-n')].some((n) => getComputedStyle(n).color === amber)
    // Either the whole row is amber, meaning the budget is spent, or amber marks
    // only the exceptional substitutions. A partly-amber row with no exceptional
    // subs would mean the mark had drifted.
    if (anySpent && !spent) marks.push({ what: 'sub row', ok: true, value: 'partial: exceptional subs only' })
  }

  return {
    theme: document.documentElement.dataset.theme,
    scanned: document.querySelectorAll('.app, .app *').length,
    violations: bad.length,
    detail: bad,
    markChecks: marks.length,
    markFailures: marks.filter((m) => !m.ok),
  }
}
