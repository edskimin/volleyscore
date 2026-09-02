import { useLayoutEffect, useRef, useState } from 'react'

import { foldThroughSet, passColor, startedSets } from '../model/reducer'
import {
  MAX_SUBS,
  ROMAN,
  type DerivedState,
  type MatchEnded,
  type MatchEvent,
  type MatchSetup,
  type SetEnded,
  type SetStarted,
  type SheetMark,
  type SheetRow,
  type TeamSide,
  type TeamState,
} from '../model/types'
import './sheet.css'

interface Props {
  setup: MatchSetup
  events: MatchEvent[]
  /** Opened at a chosen set, e.g. from the closeout screen's per-set control. */
  initialSet?: number
  onBack: () => void
}

const BOXES_PER_ROW = 10
function Tri() {
  return (
    <svg className="tri" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="50,8 94,92 6,92" />
    </svg>
  )
}

const LEVEL = { freshman: 'Freshman', jv: 'Jr. Varsity', varsity: 'Varsity' } as const

function Mark({ mark }: { mark: SheetMark }) {
  const color = passColor(mark.pass)
  switch (mark.kind) {
    case 'point':
      return (
        <span
          className={`mk${mark.circled ? ' circled' : ''}${mark.triangled ? ' triangled' : ''}`}
          style={{ color }}
        >
          {mark.triangled && <Tri />}
          {mark.value}
        </span>
      )
    case 'endOfService':
      // The key lists Loss of Rally and End of Service as two symbols, written together.
      return (
        <span className="mk" style={{ color }}>
          –I
        </span>
      )
    case 'sub':
      return (
        <span className="mk small" style={{ color }}>
          {mark.label}
          <span className="sub">
            <sup>{mark.playerIn}</sup>/<sub>{mark.playerOut}</sub>
          </span>
        </span>
      )
    case 'timeout':
      return (
        <span className="mk small" style={{ color }}>
          {mark.label}
        </span>
      )
    case 'replay':
      return (
        <span className="mk small" style={{ color }}>
          R
        </span>
      )
    case 'reserve':
      return (
        <span className="mk small" style={{ color }}>
          RS
        </span>
      )
  }
}

/** Twenty boxes: fill the top row of ten left to right, then continue on the bottom. */
function Band({
  team,
  slot,
  captains,
}: {
  team: TeamState
  slot: number
  captains: Set<string>
}) {
  const s = team.slots[slot]
  const row: SheetRow = team.sheetRows[slot] ?? []
  const halves = [row.slice(0, BOXES_PER_ROW), row.slice(BOXES_PER_ROW, BOXES_PER_ROW * 2)]

  // Everyone who has held this slot, oldest first. The starter goes above the dotted
  // rule and substitutes below it. A libero is never recorded here.
  const occupants = s?.sheetPlayers ?? []
  const label = (n: string) => (captains.has(n) ? `${n}c` : n)

  return (
    <div className="row band">
      <div className="cel rn w-rn">
        {s?.liberoServeFlag && <Tri />}
        {ROMAN[slot]}
      </div>
      <div className="pn-stack w-pn">
        <span className="top">{occupants[0] ? label(occupants[0]) : ''}</span>
        <span>{occupants.slice(1).map(label).join(', ')}</span>
      </div>
      <div className="band-inner">
        {halves.map((half, i) => (
          <div key={i} className={`band-half${i === 0 ? ' top' : ''}`}>
            {Array.from({ length: BOXES_PER_ROW }, (_, j) => (
              <div key={j} className="cel w-box">
                {half[j] && <Mark mark={half[j]} />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TeamBlock({
  side,
  setup,
  state,
  firstServe,
  liberos,
  last,
}: {
  side: TeamSide
  setup: MatchSetup
  state: DerivedState
  firstServe: TeamSide
  liberos: string[]
  last?: boolean
}) {
  const team = state.teams[side]
  const snap = setup[side]
  const captains = new Set(snap.roster.filter((p) => p.captain).map((p) => p.number))

  return (
    <div className={`blk team${last ? ' last' : ''}`}>
      <div className="row h1">
        <div className="cel hdr w-hdr firstserve">
          <span>First</span>
          <span>Serve&nbsp;{firstServe === side ? '✕' : ''}</span>
        </div>
        <div className="cel hdr w-team">TEAM&nbsp;&nbsp;{snap.name}</div>
        <div className="cel hdr w-b3">Libero #&nbsp;{liberos.join(', ')}</div>
      </div>

      <div className="row h2">
        <div className="cel hdr w-hdr">Player #</div>
        <div className="cel hdr w-b3" style={{ justifyContent: 'center' }}>
          Time Outs
        </div>
        {/* The score in the calling team's box, calling team first. Two boxes; the
            second being filled shows they have none left. */}
        {[0, 1].map((i) => {
          const t = team.timeoutScores[i]
          return (
            <div key={i} className={`cel tobox w-box${t ? '' : ' grey'}`}>
              {t ? `${t.calling}:${t.opponent}` : i + 1}
            </div>
          )
        })}
        <div className="cel w-b5" />
      </div>

      {ROMAN.map((_, i) => (
        <Band key={i} team={team} slot={i} captains={captains} />
      ))}
    </div>
  )
}

/** Per team: 1..16 left aligned, 17..32 indented, interleaved down one column. */
function ScoreColumn({ team, score }: { team: TeamState; score: number }) {
  return (
    <div className="score-col">
      {Array.from({ length: 16 }, (_, i) => {
        const lo = i + 1
        const hi = i + 17
        return (
          <div key={i} className="score-pair">
            <ScoreNumber n={lo} team={team} score={score} />
            <ScoreNumber n={hi} team={team} score={score} hi />
          </div>
        )
      })}
    </div>
  )
}

function ScoreNumber({
  n,
  team,
  score,
  hi,
}: {
  n: number
  team: TeamState
  score: number
  hi?: boolean
}) {
  const mark = team.running[n]
  if (!mark || n > score) return <span className={`score-n${hi ? ' hi' : ''}`}>{n}</span>
  return (
    <span
      className={`score-n${hi ? ' hi' : ''} ${mark.kind}`}
      style={{ color: passColor(mark.pass) }}
    >
      <span>{n}</span>
    </span>
  )
}

export default function Scoresheet({ setup, events, initialSet, onBack }: Props) {
  const sets = startedSets(events)
  // Derived rather than clamped in an effect: undoing back past a set start must not
  // leave the tab pointing at a set that no longer exists.
  const [picked, setPicked] = useState<number | null>(initialSet ?? null)
  const setNumber = picked !== null && sets.includes(picked) ? picked : (sets[sets.length - 1] ?? 1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // Fit the page to the viewport without reflowing it: the sheet is laid out in
  // points against the real form and must not be allowed to reflow.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const fit = () => setScale(Math.min(1, (el.clientWidth - 24) / (792 * (96 / 72))))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const state = foldThroughSet(setup, events, setNumber)
  const started = events.find(
    (e): e is SetStarted => e.type === 'SET_STARTED' && e.setNumber === setNumber,
  )
  const ended = events.find(
    (e): e is SetEnded => e.type === 'SET_ENDED' && e.setNumber === setNumber,
  )
  const result = state?.completedSets.find((s) => s.setNumber === setNumber)
  const matchEnded = events.find((e): e is MatchEnded => e.type === 'MATCH_ENDED')

  if (!state || !started) {
    return (
      <div className="screen sheet-view">
        <div className="sheet-chrome">
          <button className="btn ghost" onClick={onBack}>
            ← Back
          </button>
          <h1>Scoresheet</h1>
        </div>
        <p className="muted">No set has been started yet.</p>
      </div>
    )
  }

  // Team names are written as the teams are positioned from the scorer's viewpoint,
  // which is exactly what leftTeam records.
  //
  // Column order is ONE layout fact for the whole set, applied retroactively: a flip
  // is a correction of the set's side assignment, not a change from that point on. On
  // paper a scorer cannot re-letter a half-filled sheet, so a sheet whose columns
  // swapped mid-set could never exist. foldThroughSet folds to the END of the set, so
  // this is the last SIDES_CHANGED within it, or SET_STARTED.leftTeam if there is
  // none, and every box is placed from this single value.
  const leftSide: TeamSide = state.leftTeam
  const rightSide: TeamSide = leftSide === 'home' ? 'visitor' : 'home'

  // Only a completed set has a winner. A set still being played has a leader, which
  // is not the same fact: naming the team ahead at 10-8 writes a result the match has
  // not produced. A set ended without meeting its win condition has no winner either,
  // so an unfinished summary stays blank rather than inventing one.
  const winner: TeamSide | null = result?.winner ?? null

  return (
    <div className="screen sheet-view">
      <div className="sheet-chrome">
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="set-tabs">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              disabled={!sets.includes(n)}
              aria-pressed={setNumber === n}
              onClick={() => setPicked(n)}
            >
              Set {n}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <span className="faint">Print from a laptop, landscape letter, 100%</span>
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="sheet-scroll" ref={scrollRef}>
        <div className="sheet-scale" style={{ '--scale': scale } as React.CSSProperties}>
          <div className="sheet">
            <div className="ink sheet-title">
              <span className="level">
                {(['freshman', 'jv', 'varsity'] as const).map((l, i) => (
                  <span key={l}>
                    {i > 0 && ' / '}
                    {setup.level === l ? <b>{LEVEL[l]}</b> : <em>{LEVEL[l]}</em>}
                  </span>
                ))}
              </span>
              <span>vs.</span>
              <span className="rule">
                {setup[leftSide].name} vs {setup[rightSide].name}
              </span>
              <span>at</span>
              <span className="rule">{setup.venue ?? ''}</span>
            </div>

            <div className="ink sheet-officials">
              <span>Date:</span>
              <span className="rule">{setup.date}</span>
              <span>Officials:</span>
              <span className="rule">
                {[setup.officials.r1Name, setup.officials.r1Number].filter(Boolean).join(' ')}
                <span className="cap">R1 (name and OHSAA #)</span>
              </span>
              <span className="rule">
                {[setup.officials.r2Name, setup.officials.r2Number].filter(Boolean).join(' ')}
                <span className="cap">R2 (name and OHSAA #)</span>
              </span>
            </div>

            <div className="ink sheet-table">
              <TeamBlock
                side={leftSide}
                setup={setup}
                state={state}
                firstServe={started.firstServe}
                liberos={started.liberoDesignated[leftSide]}
              />
              <div className="blk centre">
                <div className="row h1">
                  <div className="cel hdr" style={{ flex: 1, justifyContent: 'center' }}>
                    Set {setNumber}
                  </div>
                </div>
                <div className="row h2">
                  <div className="cel hdr" style={{ flex: 1, justifyContent: 'center' }}>
                    Set Score
                  </div>
                </div>
                <div className="centre-body">
                  <ScoreColumn team={state.teams[leftSide]} score={state.score[leftSide]} />
                  <ScoreColumn team={state.teams[rightSide]} score={state.score[rightSide]} />
                </div>
              </div>
              <TeamBlock
                side={rightSide}
                setup={setup}
                state={state}
                firstServe={started.firstServe}
                liberos={started.liberoDesignated[rightSide]}
                last
              />
            </div>

            <div className="ink sheet-subs">
              {([leftSide, null, rightSide] as (TeamSide | null)[]).map((side, i) =>
                side === null ? (
                  <div key="mid" className="subs-cell mid" />
                ) : (
                  <div key={side} className={`subs-cell ${i === 0 ? 'left' : 'right'}`}>
                    Substitutions:
                    {Array.from({ length: MAX_SUBS }, (_, n) => (
                      <i
                        key={n}
                        className={n < state.teams[side].subsUsed.length ? 'used' : undefined}
                      >
                        {n + 1}
                      </i>
                    ))}
                  </div>
                ),
              )}
            </div>

            <div className="ink sheet-comments">
              {([leftSide, null, rightSide] as (TeamSide | null)[]).map((side, i) =>
                side === null ? (
                  <div key="mid" className="comments-cell mid" />
                ) : (
                  <div key={side} className={`comments-cell ${i === 0 ? 'left' : 'right'}`}>
                    <b>Comments:</b> {state.teams[side].comments.join('; ')}
                  </div>
                ),
              )}
            </div>

            <div className="ink sheet-summary">
              <div className="summary-bar">SET SUMMARY</div>
              <div className="summary-body">
                <div className="summary-line">
                  <span>Winning Team:</span>
                  <span className="rule">{winner ? setup[winner].name : ''}</span>
                  <span>Final Score:</span>
                  <span className="rule short">
                    {state.score[leftSide]} – {state.score[rightSide]}
                  </span>
                  <span>Official&rsquo;s Verification:</span>
                  <span className="rule short" />
                </div>
                <div className="summary-line">
                  <span>Scorer:</span>
                  <span className="rule">{setup.scorerName ?? ''}</span>
                  <span>Time: Set Start</span>
                  <span className="rule short">{started.startTime}</span>
                  <span>Set End:</span>
                  <span className="rule short">{ended?.endTime ?? ''}</span>
                  <span>Match End:</span>
                  <span className="rule short">
                    {matchEnded?.endTime ?? ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="ink sheet-key">
              {[
                ['Floor\nCaptain', 'C'],
                ['Service\nPoint', '1'],
                ['Loss of\nRally', '–'],
                ['End of\nService', 'I'],
                ['Non-Serve\nPoint', '①'],
                ['Penalty\nPoint', 'P1'],
                ['Replay', 'R'],
                ['Re-Serve', 'RS'],
                ['Time-Out', 'T'],
                ['Time Out\nOpponent', 'TX'],
                ['Substitution', 'S'],
                ['Substitution\nOpponent', 'SX'],
                ['Libero\nPoint', '△'],
              ].map(([label, sym]) => (
                <div key={label}>
                  <span style={{ whiteSpace: 'pre-line' }}>{label}</span>
                  <b>{sym}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
