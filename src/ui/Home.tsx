import { useEffect, useRef, useState } from 'react'

import {
  dismissInstall,
  importMatch,
  isInstallDismissed,
  listMatches,
  type MatchRecord,
} from '../db/db'
import { fold } from '../model/reducer'
import InstallPrompt from './InstallPrompt'

interface Props {
  activeMatchId: string | null
  onNew: () => void
  onOpen: (matchId: string) => void
}

function summarize(record: MatchRecord): string {
  const s = fold(record.setup, record.events)
  if (s.completedSets.length === 0) return s.setInProgress ? 'in progress' : 'not started'
  return s.completedSets.map((set) => `${set.score.home}-${set.score.visitor}`).join(' · ')
}

export default function Home({ activeMatchId, onNew, onOpen }: Props) {
  const [matches, setMatches] = useState<MatchRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showInstall, setShowInstall] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => void listMatches().then(setMatches)
  useEffect(refresh, [])
  useEffect(() => {
    void isInstallDismissed().then((d) => setShowInstall(!d))
  }, [])

  async function onFile(file: File) {
    setError(null)
    try {
      const record = await importMatch(await file.text())
      refresh()
      onOpen(record.matchId)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen screen-scroll home-screen">
      <div className="topbar">
        <div className="wordmark">
          <b>VolleyScore</b>
          <span>OHSAA</span>
        </div>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <button className="btn primary lg" onClick={onNew}>
          New match
        </button>
      </div>

      {/* On iOS this opens the Files picker, which already surfaces iCloud Drive,
          Google Drive and Dropbox if they are installed. */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onFile(file)
        }}
      />

      {error && <p className="import-error">{error}</p>}

      {showInstall && (
        <InstallPrompt
          onDismiss={() => {
            // Hide only once the dismissal is stored, so the screen never disagrees
            // with what a reload will show.
            void dismissInstall().then(() => setShowInstall(false))
          }}
        />
      )}

      {matches.length === 0 ? (
        <div className="empty card">
          <h2>No matches yet</h2>
          <p className="muted">
            Start a new match, or import a <code>.json</code> export from another device.
          </p>
        </div>
      ) : (
        <ul className="match-list">
          {matches.map((m) => {
            const active = m.matchId === activeMatchId
            return (
              <li key={m.matchId}>
                <button className="match-row" onClick={() => onOpen(m.matchId)}>
                  <span className="swatches">
                    <i style={{ background: m.setup.home.colorPrimary }} />
                    <i style={{ background: m.setup.visitor.colorPrimary }} />
                  </span>
                  <span className="who">
                    <b>
                      {m.setup.home.name} <span className="faint">vs</span>{' '}
                      {m.setup.visitor.name}
                    </b>
                    <small className="muted">
                      {m.setup.date} · {m.setup.level}
                      {m.setup.venue ? ` · ${m.setup.venue}` : ''}
                    </small>
                  </span>
                  <span className="spacer" />
                  <span className="result num">{summarize(m)}</span>
                  {/* Browser storage on iOS can be evicted; an unexported match has no
                      copy that outlives it. */}
                  {!m.exportedAt && <span className="badge warn">not exported</span>}
                  {m.status === 'complete' && <span className="badge quiet">final</span>}
                  {active && <span className="badge">resume</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
