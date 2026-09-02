/*
 * In-match screen probe. Paste into the browser console with the in-match screen open.
 *
 *   layoutProbe()  asserts no overlay displaces the court
 *   anchorProbe()  asserts a team-scoped sheet opens on that team's side
 *   previewProbe() asserts set setup's court preview equals positionOf, both sides
 *   colorProbe()   asserts nothing renders a color outside the sanctioned set,
 *                  that every warning mark is amber and thick enough to find, and
 *                  that no layer holds more than one primary button
 *   probeAll()     runs the in-match three and reports each one's counts
 *
 * These were written because defects got past a screenshot: the hint sat in the
 * layout flow, and a green check mark shipped on the closeout screen. Run them after
 * any change to the in-match screen.
 *
 * EVERY PROBE ASSERTS A MINIMUM NUMBER OF CHECKS PERFORMED. See `enough` below. A
 * probe that iterates over query results reports success when the query matches
 * nothing, so a rename silently turns a guard into a rubber stamp. Read `counts` and
 * `short`, not just `pass` — though `pass` already includes them.
 */

/* Every probe asserts a MINIMUM number of checks performed, not only that the checks
   it ran passed. previewProbe queried .card[data-side] after a rename made it
   data-pos: it matched no cards, ran zero checks and reported pass, because
   [].every() is true. It had been passing vacuously for several commits. A guard that
   reports success for having done nothing is worse than no guard, because it buys
   confidence that nothing is wrong.
   Any probe that iterates over query results can fail this way, so every one of them
   now declares what it must have seen. `enough` is folded into `pass` rather than
   returned beside it, because a separate field is a field a caller can forget. */
function enough(counts) {
  const short = Object.entries(counts)
    .filter(([, c]) => c.got < c.min)
    .map(([k, c]) => `${k}: ${c.got} of ${c.min} expected`)
  return { ok: short.length === 0, short }
}

/* Nothing that can appear mid-match may displace the court: a tap target that moves
   is a mis-recorded rally. Measures with an overlay OPEN and CLOSED. */
async function layoutProbe() {
  const app = document.querySelector('.app')
  /* Reads nothing it has not found. Dereferencing straight through a query meant a
     renamed class threw a TypeError from inside the probe, so the count below could
     never actually report it: an assertion that can never fire is the same defect as
     one that always passes. */
  const box = (sel) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel
    return el ? el.getBoundingClientRect() : null
  }
  const snap = () => {
    const cell = box('.cell')
    const area = box('.court-area')
    return {
      cellY: cell ? Math.round(cell.top) : null,
      courtH: area ? Math.round(area.height) : null,
      overflows: app ? app.scrollHeight > app.clientHeight : false,
    }
  }
  const more = [...document.querySelectorAll('.bar-group.centre .btn')][2]
  if (!app || !more) {
    return {
      counts: { app: { got: app ? 1 : 0, min: 1 }, overflowButton: { got: more ? 1 : 0, min: 1 } },
      short: ['the screen this probe measures is not on screen'],
      pass: false,
    }
  }

  /* Start from a known state. An overlay left open by a previous run would make the
     first click CLOSE it, so the probe would compare the court against itself, find
     nothing moved, and then fail on a sheet that is no longer there. */
  const shown = () => [...document.querySelectorAll('.sheet')].find((el) => !el.hidden)
  if (shown()) {
    document.querySelector('.scrim').click()
    await new Promise((r) => setTimeout(r, 250))
  }

  const closed = snap()
  more.click()
  await new Promise((r) => setTimeout(r, 300))
  const open = snap()
  const sheet = shown()
  const ab = app.getBoundingClientRect()
  const sb = sheet ? sheet.getBoundingClientRect() : { width: 0, height: 0 }
  if (sheet) more.click()

  /* "Nothing moved" means nothing if nothing opened. If the overflow button moved in
     the bar, this probe would compare the court against itself and pass. */
  const counts = {
    cells: { got: document.querySelectorAll('.cell').length, min: 12 },
    courtArea: { got: closed.courtH === null ? 0 : 1, min: 1 },
    sheetOpened: { got: sheet && sb.width > 0 && sb.height > 0 ? 1 : 0, min: 1 },
  }
  const en = enough(counts)

  return {
    closed,
    open,
    counts,
    short: en.short,
    pass:
      en.ok &&
      closed.cellY === open.cellY &&
      closed.courtH === open.courtH &&
      !closed.overflows &&
      !open.overflows &&
      getComputedStyle(sheet).position === 'absolute' &&
      // sheet is non-null whenever en.ok, which is evaluated first.
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

  /* At most one primary PER LAYER. A scrim defines a layer: while a sheet is open
     nothing beneath it is actionable, so a primary in the sheet and one in the base
     screen are not competing. Counting globally would fail a correct screen, so
     count only the primaries in the layer the operator can actually reach. */
  const scrimOpen = [...document.querySelectorAll('.scrim')].some((e) => !e.hidden)
  const primaries = [...document.querySelectorAll('.btn-primary, .btn.primary')].filter((el) => {
    if (el.hidden || el.closest('[hidden]')) return false
    const inSheet = !!el.closest('.sheet:not([hidden])')
    return scrimOpen ? inSheet : !inSheet
  })

  /* Three ways this probe could report success for having done nothing:
     - `.app` renamed, so the scan sees no elements and finds no violations;
     - a mark class renamed, so no mark is inspected and none can fail;
     - `.btn-primary` renamed, so no layer ever holds more than one.
     The mark minimum is conditional because zero warnings is a legitimate state. The
     app renders every warning twice, as a mark on the object and as text in the
     overflow, and those two must agree: if the overflow lists warnings, at least one
     mark must exist to inspect. The overflow's list is in the DOM even while the
     sheet is hidden, so this costs nothing and needs no interaction. */
  const warningsListed = document.querySelectorAll('.app .sheet-warnings div').length
  const counts = {
    // A real in-match or set-setup stage scans ~200 elements.
    scanned: { got: document.querySelectorAll('.app, .app *').length, min: 50 },
    markChecks: { got: marks.length, min: warningsListed > 0 ? 1 : 0 },
    // Counted including hidden ones: the in-match primary is hidden mid-set, but the
    // element is always rendered, so zero means the selector went stale.
    primaryElements: {
      got: document.querySelectorAll('.btn-primary, .btn.primary').length,
      min: 1,
    },
  }
  const en = enough(counts)

  return {
    theme: document.documentElement.dataset.theme,
    counts,
    short: en.short,
    scanned: counts.scanned.got,
    violations: bad.length,
    detail: bad,
    warningsListed,
    markChecks: marks.length,
    markFailures: marks.filter((m) => !m.ok),
    layer: scrimOpen ? 'sheet' : 'base',
    primariesInLayer: primaries.length,
    primaryLabels: primaries.map((p) => p.textContent.trim()),
    pass:
      en.ok &&
      bad.length === 0 &&
      marks.every((m) => m.ok) &&
      primaries.length <= 1,
  }
}


/* A sheet anchors to the SIDE of the thing it acts on. Opening "add player" for the
   home team must put the sheet on the same side as the home panel, or the operator
   has to read the title to know which team they are changing. */
async function anchorProbe() {
  const app = document.querySelector('.app')
  const more = [...document.querySelectorAll('.bar-group.centre .btn')][2]
  /* Find the panel by the team's own name, not by a home/visitor attribute: which
     side a team occupies is now a per-set fact, so the probe must not assume one. */
  const sideOfTeam = (name) => {
    const panel = [...document.querySelectorAll('.panel')].find(
      (el) => el.getAttribute('aria-label') === name,
    )
    if (!panel) return null
    const a = app.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    return p.left - a.left < a.right - p.right ? 'left' : 'right'
  }

  const results = []
  for (let i = 0; i < 2; i++) {
    more.click()
    await new Promise((r) => setTimeout(r, 200))
    const buttons = [...document.querySelectorAll('.sheet .btn')].filter((b) =>
      b.textContent.trim().startsWith('Add player to'),
    )
    // Reported, not thrown: a renamed control must show up as a shortfall in the
    // count below, not as a TypeError from inside the probe.
    if (!buttons[i]) break
    const team = buttons[i].textContent.trim().replace(/^Add player to\s*/, '')
    buttons[i].click()
    await new Promise((r) => setTimeout(r, 250))

    const opened = document.querySelector('.sheet:not([hidden])')
    if (!opened) break
    const a = app.getBoundingClientRect()
    const s = opened.getBoundingClientRect()
    const anchored = s.left - a.left < a.right - s.right ? 'left' : 'right'
    const expected = sideOfTeam(team)
    results.push({ team, expected, anchored, ok: expected !== null && anchored === expected })

    document.querySelector('.scrim').click()
    await new Promise((r) => setTimeout(r, 200))
  }
  // One per team. A team-scoped sheet whose control was renamed drops out of the
  // loop rather than throwing, and shows up here as a shortfall.
  const counts = {
    anchorChecks: { got: results.length, min: 2 },
    sidesResolved: { got: results.filter((r) => r.expected !== null).length, min: 2 },
  }
  const en = enough(counts)
  return { results, counts, short: en.short, pass: en.ok && results.every((r) => r.ok) }
}


/* SET SETUP: the court preview must equal positionOf for BOTH the serving and the
   receiving team. That derivation is the piece most likely to be subtly wrong and
   least likely to be noticed: a wrong preview validates a wrong lineup, and the
   preview is the whole verification step. Read straight off the DOM, so it checks
   what is rendered rather than what the code intends. */
function previewProbe() {
  const RN = ['I', 'II', 'III', 'IV', 'V', 'VI']
  /* Keyed by SCREEN POSITION, like the screen itself. This probe was keyed by team
     and queried .card[data-side] after the left/right change renamed it to
     data-pos, so it matched no cards, ran zero checks, and reported pass because
     [].every() is true. A probe that measures nothing is worse than no probe, so
     the expected count is asserted below. */
  const GRID = { left: [5, 4, 6, 3, 1, 2], right: [2, 1, 3, 6, 4, 5] }
  const positionOf = (serves, slotIndex) => (serves ? slotIndex + 1 : ((slotIndex + 1) % 6) + 1)

  const pressed = (label) =>
    [...document.querySelectorAll('.controls .control')]
      .find((c) => new RegExp(label, 'i').test(c.textContent))
      ?.querySelector('button[aria-pressed="true"]')
      ?.textContent.trim()
  const firstServe = pressed('first serve')

  const rows = []
  for (const card of document.querySelectorAll('.card[data-pos]')) {
    const pos = card.dataset.pos
    // The team standing here, read off the card rather than assumed from the side.
    const name = card.querySelector('.card-name').textContent.trim()
    const serves = name === firstServe
    const lineup = [...card.querySelectorAll('.order .slot')].map((s) => {
      const n = s.querySelector('.slot-num')
      return n ? n.textContent.trim() : null
    })
    const cells = [...card.querySelectorAll('.court .pcell')]
    GRID[pos].forEach((court, i) => {
      // Which serve-order slot should stand at this court position?
      let expectIdx = -1
      for (let k = 0; k < 6; k++) if (positionOf(serves, k) === court) expectIdx = k
      const shownRn = cells[i].querySelector('.pcell-rn').textContent.trim()
      const shownNum = cells[i].querySelector('.pcell-num').textContent.trim()
      rows.push({
        pos, name, court, serves,
        expectRn: RN[expectIdx], shownRn,
        expectNum: lineup[expectIdx] ?? '\u2014', shownNum,
        ok: shownRn === RN[expectIdx] && shownNum === (lineup[expectIdx] ?? '\u2014'),
      })
    })
  }
  // Two cards, six positions each. Anything less means the probe lost the screen.
  const counts = { previewChecks: { got: rows.length, min: 12 } }
  const en = enough(counts)
  return {
    checks: rows.length,
    counts,
    short: en.short,
    firstServe,
    failures: rows.filter((r) => !r.ok),
    pass: en.ok && rows.every((r) => r.ok),
  }
}


/* Run the in-match probes together. Four hand-run probes is three chances to skip
   one, and the one skipped is the one that would have caught it. */
async function probeAll(teamHexes) {
  const out = {
    layout: await layoutProbe(),
    anchor: await anchorProbe(),
    color: colorProbe(teamHexes),
  }
  return {
    ...out,
    counts: Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, { pass: v.pass, ...v.counts }]),
    ),
    pass: Object.values(out).every((v) => v.pass),
  }
}
