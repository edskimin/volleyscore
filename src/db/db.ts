// Local-first storage. See docs/01-data-model.md.
//
// IndexedDB on iOS is not durable: Safari can evict script-writable storage after
// roughly seven days without site interaction. The real protection is the blocking
// closeout export, not this file. The per-set backup store below is a second line.

import Dexie, { type EntityTable } from 'dexie'

import type { MatchEvent, MatchSetup, TeamSnapshot } from '../model/types'

export const SCHEMA_VERSION = 1

export interface MatchRecord {
  schemaVersion: number
  matchId: string
  createdAt: string
  updatedAt: string
  status: 'in_progress' | 'complete'
  setup: MatchSetup
  events: MatchEvent[]
}

export interface TeamRecord extends TeamSnapshot {
  teamId: string
  lastUsedAt: string
}

export interface AppStateRecord {
  key: 'singleton'
  activeMatchId: string | null
}

export interface BackupRecord {
  id?: number
  matchId: string
  savedAt: string
  afterSet: number
  payload: MatchExport
}

const db = new Dexie('volleyscore') as Dexie & {
  matches: EntityTable<MatchRecord, 'matchId'>
  teams: EntityTable<TeamRecord, 'teamId'>
  appState: EntityTable<AppStateRecord, 'key'>
  backups: EntityTable<BackupRecord, 'id'>
}

db.version(1).stores({
  matches: 'matchId, updatedAt, status',
  teams: 'teamId, name, lastUsedAt',
  appState: 'key',
  backups: '++id, matchId, savedAt',
})

export { db }

// --- Active match ----------------------------------------------------------

export async function getActiveMatchId(): Promise<string | null> {
  const row = await db.appState.get('singleton')
  return row?.activeMatchId ?? null
}

export async function setActiveMatchId(activeMatchId: string | null): Promise<void> {
  await db.appState.put({ key: 'singleton', activeMatchId })
}

// --- Matches ---------------------------------------------------------------

export async function createMatch(setup: MatchSetup): Promise<MatchRecord> {
  const now = new Date().toISOString()
  const record: MatchRecord = {
    schemaVersion: SCHEMA_VERSION,
    matchId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: 'in_progress',
    setup,
    events: [],
  }
  await db.matches.put(record)
  await setActiveMatchId(record.matchId)
  return record
}

/** Persist the log. The log is the only thing worth writing; state is derived. */
export async function saveEvents(matchId: string, events: MatchEvent[]): Promise<void> {
  await db.matches.update(matchId, { events, updatedAt: new Date().toISOString() })
}

/**
 * Setup is editable after a match starts: team colors, names, officials and roster
 * additions. It is not part of the event log, so changing it never invalidates a fold.
 */
export async function saveSetup(matchId: string, setup: MatchSetup): Promise<void> {
  await db.matches.update(matchId, { setup, updatedAt: new Date().toISOString() })
}

export async function listMatches(): Promise<MatchRecord[]> {
  return db.matches.orderBy('updatedAt').reverse().toArray()
}

// --- Export and import -----------------------------------------------------

export interface MatchExport {
  schemaVersion: number
  matchId: string
  exportedAt: string
  setup: MatchSetup
  events: MatchEvent[]
}

export function toExport(record: MatchRecord): MatchExport {
  return {
    schemaVersion: SCHEMA_VERSION,
    matchId: record.matchId,
    exportedAt: new Date().toISOString(),
    setup: record.setup,
    events: record.events,
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** e.g. 2026-10-14-avon-lake-vs-amherst.json */
export function exportFilename(setup: MatchSetup): string {
  return `${setup.date}-${slug(setup.home.name)}-vs-${slug(setup.visitor.name)}.json`
}

/**
 * Standalone-PWA share sheet behavior on iOS has been inconsistent across versions,
 * so both paths exist. Web Share is preferred; the blob link always works.
 */
export async function shareExport(record: MatchRecord): Promise<'shared' | 'downloaded'> {
  const payload = JSON.stringify(toExport(record), null, 2)
  const filename = exportFilename(record.setup)
  const file = new File([payload], filename, { type: 'application/json' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      // A user-cancelled share is not a failure worth escalating; fall through.
      if ((err as Error).name !== 'AbortError') throw err
    }
  }

  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}

/**
 * Migrate an imported file up to the current schema. Starts as a no-op, but the event
 * shape will change after the first real match and last season's files must stay
 * readable.
 */
export function migrate(data: MatchExport): MatchExport {
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `This file was written by a newer version of the app (schema ${data.schemaVersion}).`,
    )
  }
  return data
}

export async function importMatch(json: string): Promise<MatchRecord> {
  const data = migrate(JSON.parse(json) as MatchExport)
  if (!data.setup || !Array.isArray(data.events)) {
    throw new Error('That file is not a VolleyScore match export.')
  }
  const now = new Date().toISOString()
  const record: MatchRecord = {
    schemaVersion: SCHEMA_VERSION,
    matchId: data.matchId ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: 'in_progress',
    setup: data.setup,
    events: data.events,
  }
  await db.matches.put(record)
  return record
}

/** Belt and braces against eviction: snapshot after every completed set. */
export async function backupAfterSet(record: MatchRecord, afterSet: number): Promise<void> {
  await db.backups.put({
    matchId: record.matchId,
    savedAt: new Date().toISOString(),
    afterSet,
    payload: toExport(record),
  })
}
