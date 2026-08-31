import { useEffect, useMemo, useRef, useState } from 'react'

import type { MatchSetup, RosterPlayer, TeamSide, TeamSnapshot } from '../model/types'
import { contrastRatio, readableOn } from './color'

interface Props {
  /** Present when editing an existing match rather than creating one. */
  initial?: MatchSetup
  title?: string
  submitLabel?: string
  /** Numbers the event log already names; these cannot be removed from a roster. */
  locked?: Record<TeamSide, Set<string>>
  onCancel: () => void
  onStart: (setup: MatchSetup) => void
}

function blankTeam(name: string, color: string): TeamSnapshot {
  return {
    teamId: null,
    name,
    colorPrimary: color,
    colorText: readableOn(color),
    roster: [],
    liberoNumbers: [],
  }
}

function sortRoster(roster: RosterPlayer[]): RosterPlayer[] {
  // Jersey numbers are identifiers, not quantities. Sort numerically for display only.
  return [...roster].sort((a, b) => Number(a.number) - Number(b.number))
}

function TeamEditor({
  team,
  label,
  locked,
  onChange,
}: {
  team: TeamSnapshot
  label: string
  locked: Set<string>
  onChange: (next: TeamSnapshot) => void
}) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const numberRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [added, setAdded] = useState<string | null>(null)

  function add() {
    const n = number.trim()
    if (!n || team.roster.some((p) => p.number === n)) return
    onChange({
      ...team,
      roster: sortRoster([...team.roster, { number: n, name: name.trim() || null, captain: false }]),
    })
    setNumber('')
    setName('')
    setAdded(n)
    // Straight back to the number field, so a roster is entered without reaching for
    // the input between every player.
    numberRef.current?.focus()
  }

  // The list is sorted numerically and scrolls, so a high number could land out of
  // sight and read as though nothing happened. Bring it into view.
  //
  // The offset is computed rather than left to scrollIntoView, which lands a few
  // pixels short here and leaves the new row clipped — the exact thing being fixed.
  useEffect(() => {
    if (added === null) return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-number="${CSS.escape(added)}"]`)
    if (!list || !el) return
    const below = el.offsetTop + el.offsetHeight - (list.scrollTop + list.clientHeight)
    const above = el.offsetTop - list.scrollTop
    if (below > 0) list.scrollTop += below
    else if (above < 0) list.scrollTop += above
  }, [added, team.roster])

  function update(target: string, patch: Partial<RosterPlayer>) {
    onChange({
      ...team,
      roster: team.roster.map((p) => (p.number === target ? { ...p, ...patch } : p)),
    })
  }

  function remove(target: string) {
    onChange({
      ...team,
      roster: team.roster.filter((p) => p.number !== target),
      liberoNumbers: team.liberoNumbers.filter((n) => n !== target),
    })
  }

  function toggleLibero(target: string) {
    const has = team.liberoNumbers.includes(target)
    if (!has && team.liberoNumbers.length >= 2) return
    onChange({
      ...team,
      liberoNumbers: has
        ? team.liberoNumbers.filter((n) => n !== target)
        : [...team.liberoNumbers, target],
    })
  }

  return (
    <section className="card team-editor">
      <header style={{ borderColor: team.colorPrimary }}>
        <span className="eyebrow">{label}</span>
        <input
          className="team-name"
          value={team.name}
          placeholder="Team name"
          onChange={(e) => onChange({ ...team, name: e.target.value })}
        />
        <label className="color-well" style={{ background: team.colorPrimary }}>
          <input
            type="color"
            value={team.colorPrimary}
            onChange={(e) =>
              onChange({
                ...team,
                colorPrimary: e.target.value,
                colorText: readableOn(e.target.value),
              })
            }
          />
        </label>
      </header>

      <div className="add-player">
        <input
          ref={numberRef}
          className="num"
          inputMode="numeric"
          placeholder="#"
          value={number}
          maxLength={3}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add} disabled={!number.trim()}>
          Add
        </button>
      </div>

      {team.roster.length === 0 ? (
        <p className="faint roster-hint">
          Numbers are required, names are not. The sheet only needs numbers.
        </p>
      ) : (
        <ul className="roster" ref={listRef}>
          {team.roster.map((p) => {
            const libero = team.liberoNumbers.includes(p.number)
            return (
              <li
                key={p.number}
                data-number={p.number}
                className={[libero ? 'libero' : '', added === p.number ? 'just-added' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <b className="num">{p.number}</b>
                <span className="pname muted">{p.name ?? '—'}</span>
                <button
                  className={p.captain ? 'tag on' : 'tag'}
                  title="Floor captain"
                  onClick={() => update(p.number, { captain: !p.captain })}
                >
                  C
                </button>
                <button
                  className={libero ? 'tag on' : 'tag'}
                  title="Libero"
                  disabled={!libero && team.liberoNumbers.length >= 2}
                  onClick={() => toggleLibero(p.number)}
                >
                  L
                </button>
                <button
                  className="tag remove"
                  onClick={() => remove(p.number)}
                  disabled={locked.has(p.number)}
                  title={locked.has(p.number) ? 'Already used this match' : 'Remove'}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <footer className="muted">
        {team.roster.length} players · {team.liberoNumbers.length} libero
        {team.liberoNumbers.length === 1 ? '' : 's'}
      </footer>
    </section>
  )
}

export default function MatchSetupScreen({
  initial,
  title = 'New match',
  submitLabel = 'Continue',
  locked,
  onCancel,
  onStart,
}: Props) {
  const [home, setHome] = useState(() => initial?.home ?? blankTeam('', '#14284B'))
  const [visitor, setVisitor] = useState(() => initial?.visitor ?? blankTeam('', '#7A1120'))
  const [level, setLevel] = useState<MatchSetup['level']>(initial?.level ?? 'varsity')
  const [format, setFormat] = useState<MatchSetup['format']>(initial?.format ?? 'best_of_5')
  const [date, setDate] = useState(
    () => initial?.date ?? new Date().toISOString().slice(0, 10),
  )
  const [venue, setVenue] = useState(initial?.venue ?? '')
  const [scorerName, setScorerName] = useState(initial?.scorerName ?? '')
  const [r1Name, setR1Name] = useState(initial?.officials.r1Name ?? '')
  const [r1Number, setR1Number] = useState(initial?.officials.r1Number ?? '')
  const [r2Name, setR2Name] = useState(initial?.officials.r2Name ?? '')
  const [r2Number, setR2Number] = useState(initial?.officials.r2Number ?? '')

  // The whole in-match design depends on telling the two panels apart at a glance.
  const contrast = useMemo(
    () => contrastRatio(home.colorPrimary, visitor.colorPrimary),
    [home.colorPrimary, visitor.colorPrimary],
  )

  const ready =
    home.name.trim() !== '' &&
    visitor.name.trim() !== '' &&
    home.roster.length >= 6 &&
    visitor.roster.length >= 6

  function start() {
    onStart({
      level,
      format,
      date,
      venue: venue.trim() || null,
      officials: {
        r1Name: r1Name.trim() || null,
        r1Number: r1Number.trim() || null,
        r2Name: r2Name.trim() || null,
        r2Number: r2Number.trim() || null,
      },
      scorerName: scorerName.trim() || null,
      home: { ...home, name: home.name.trim() },
      visitor: { ...visitor, name: visitor.name.trim() },
    })
  }

  const setters: Record<TeamSide, (t: TeamSnapshot) => void> = { home: setHome, visitor: setVisitor }

  return (
    <div className="screen screen-scroll setup">
      <div className="topbar">
        <button className="btn ghost" onClick={onCancel}>
          ← Back
        </button>
        <h1>{title}</h1>
        <div className="spacer" />
        <button className="btn primary lg" onClick={start} disabled={!ready}>
          {submitLabel}
        </button>
      </div>

      {!ready && (
        <p className="faint requirement">
          Both teams need a name and at least six players. Everything else is optional.
        </p>
      )}

      <div className="team-grid">
        {(['home', 'visitor'] as TeamSide[]).map((side) => (
          <TeamEditor
            key={side}
            label={side}
            team={side === 'home' ? home : visitor}
            locked={locked?.[side] ?? new Set()}
            onChange={setters[side]}
          />
        ))}
      </div>

      {contrast < 1.6 && home.name && visitor.name && (
        <p className="contrast-warn">
          Those team colors are hard to tell apart ({contrast.toFixed(2)}:1). The in-match
          screen leans on the difference.
        </p>
      )}

      <section className="card meta-grid">
        <div className="field">
          <label>Level</label>
          <div className="seg">
            {(['freshman', 'jv', 'varsity'] as const).map((l) => (
              <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>
                {l === 'jv' ? 'JV' : l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Format</label>
          <div className="seg">
            {(['best_of_3', 'best_of_5'] as const).map((f) => (
              <button key={f} aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f === 'best_of_3' ? 'Best of 3' : 'Best of 5'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Venue</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Optional" />
        </div>
        <div className="field">
          <label>Scorer</label>
          <input
            value={scorerName}
            onChange={(e) => setScorerName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="field official">
          <label>R1</label>
          <div className="pair">
            <input value={r1Name} onChange={(e) => setR1Name(e.target.value)} placeholder="Name" />
            <input
              className="num"
              value={r1Number}
              onChange={(e) => setR1Number(e.target.value)}
              placeholder="OHSAA #"
            />
          </div>
        </div>
        <div className="field official">
          <label>R2</label>
          <div className="pair">
            <input value={r2Name} onChange={(e) => setR2Name(e.target.value)} placeholder="Name" />
            <input
              className="num"
              value={r2Number}
              onChange={(e) => setR2Number(e.target.value)}
              placeholder="OHSAA #"
            />
          </div>
        </div>
      </section>
    </div>
  )
}
