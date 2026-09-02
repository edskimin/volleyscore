// Local-first storage. See docs/01-data-model.md.
//
// IndexedDB on iOS is not durable: Safari can evict script-writable storage after
// roughly seven days without site interaction. The real protection is the blocking
// closeout export, not this file. The per-set backup store below is a second line.

import Dexie, { type EntityTable } from 'dexie'

import type { MatchEvent, MatchSetup, SetStarted, TeamSnapshot } from '../model/types'

export const SCHEMA_VERSION = 2

export interface MatchRecord {
  schemaVersion: number
  matchId: string
  createdAt: string
  updatedAt: string
  status: 'in_progress' | 'complete'
  /**
   * When the log was last written out to a file. A match is not complete until this
   * is set: the blocking closeout export is the real protection against eviction,
   * and a dismissible reminder would be dismissed.
   */
  exportedAt: string | null
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
  /** Whether the operator has waved away the install-to-home-screen prompt. */
  installDismissed?: boolean
}

export interface BackupRecord {
  id?: number
  matchId: string
  afterSet: number
  savedAt: string
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

db.version(2).stores({
  // Adds a compound index so a backup can be found by match and set and replaced
  // rather than accumulating one row per write.
  //
  // Note the primary key stays `++id`. Dexie cannot change a store's primary key in
  // an upgrade: it throws UpgradeError, the database never opens, and every screen in
  // the app goes blank on any device that already ran the previous version. Adding an
  // index is safe; changing the key is not. If a key ever genuinely has to change,
  // create a new store and drop the old one instead.
  backups: '++id, matchId, savedAt, [matchId+afterSet]',
})

/**
 * Rewrites stored matches through the event migration. Adding a version with an
 * upgrade is safe; changing a primary key is not, which is why this does not touch
 * `stores` at all.
 */
db.version(3).upgrade(async (tx) => {
  await tx
    .table('matches')
    .toCollection()
    .modify((m: MatchRecord) => {
      m.events = migrateEvents(m.events, m.schemaVersion ?? 1)
      m.schemaVersion = SCHEMA_VERSION
    })
})

export { db }

// --- Active match ----------------------------------------------------------

/** Merge rather than replace: appState is one row holding several unrelated flags. */
async function patchAppState(patch: Partial<AppStateRecord>): Promise<void> {
  const current = (await db.appState.get('singleton')) ?? {
    key: 'singleton' as const,
    activeMatchId: null,
  }
  await db.appState.put({ ...current, ...patch })
}

export async function getActiveMatchId(): Promise<string | null> {
  const row = await db.appState.get('singleton')
  return row?.activeMatchId ?? null
}

export async function setActiveMatchId(activeMatchId: string | null): Promise<void> {
  await patchAppState({ activeMatchId })
}

export async function isInstallDismissed(): Promise<boolean> {
  return (await db.appState.get('singleton'))?.installDismissed === true
}

export async function dismissInstall(): Promise<void> {
  await patchAppState({ installDismissed: true })
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
    exportedAt: null,
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
export type ExportResult = 'shared' | 'downloaded' | 'cancelled'

export async function shareExport(record: MatchRecord): Promise<ExportResult> {
  const payload = JSON.stringify(toExport(record), null, 2)
  const filename = exportFilename(record.setup)
  const file = new File([payload], filename, { type: 'application/json' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      const name = (err as Error).name
      // A deliberate cancel is not a failure, and must not quietly download instead.
      if (name === 'AbortError') return 'cancelled'
      // Anything else — NotAllowedError from a permissions policy, a share target that
      // refuses the file, an unsupported context — falls through to the download.
      // Having both paths is the whole point; escalating here would strand the match
      // on the device with no way to write it out.
    }
  }

  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
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
  // A malformed file must fail with the message importMatch gives, not with whatever
  // the migration happens to throw first.
  if (!Array.isArray(data.events)) return data
  return {
    ...data,
    schemaVersion: SCHEMA_VERSION,
    events: migrateEvents(data.events, data.schemaVersion),
  }
}

/**
 * 1 -> 2: SET_STARTED.sidesSwitched became leftTeam. The old flag only ever drove the
 * sheet's column order, where false put the visitor on the left, so that is the reading
 * that keeps an old record rendering the way it was written.
 *
 * This runs on imported files AND on matches already in IndexedDB, because a match
 * stored before the change has no leftTeam and would fold to undefined.
 */
export function migrateEvents(events: MatchEvent[], from: number): MatchEvent[] {
  if (from >= 2) return events
  return events.map((e) => {
    if (e.type !== 'SET_STARTED') return e
    const legacy = e as SetStarted & { sidesSwitched?: boolean }
    if (legacy.leftTeam) return e
    const { sidesSwitched, ...rest } = legacy
    return { ...rest, leftTeam: sidesSwitched ? 'home' : 'visitor' } as SetStarted
  })
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
    // An imported match came from a file, so it already exists outside this device.
    exportedAt: now,
    setup: data.setup,
    events: data.events,
  }
  await db.matches.put(record)
  return record
}

/** Belt and braces against eviction: snapshot after every completed set. */
export async function backupAfterSet(record: MatchRecord, afterSet: number): Promise<void> {
  const existing = await db.backups
    .where('[matchId+afterSet]')
    .equals([record.matchId, afterSet])
    .first()
  await db.backups.put({
    ...(existing?.id === undefined ? {} : { id: existing.id }),
    matchId: record.matchId,
    savedAt: new Date().toISOString(),
    afterSet,
    payload: toExport(record),
  })
}

/** Records that the log has been written out, which is what unblocks completion. */
export async function markExported(matchId: string): Promise<string> {
  const exportedAt = new Date().toISOString()
  await db.matches.update(matchId, { exportedAt, updatedAt: exportedAt })
  return exportedAt
}

export async function markComplete(matchId: string): Promise<void> {
  await db.matches.update(matchId, {
    status: 'complete',
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Save a team for reuse next time. This is a convenience copy: editing a saved team
 * never mutates a match already recorded, because matches carry their own snapshot.
 */
export async function saveTeam(team: TeamSnapshot): Promise<string> {
  const teamId = team.teamId ?? crypto.randomUUID()
  await db.teams.put({ ...team, teamId, lastUsedAt: new Date().toISOString() })
  return teamId
}
