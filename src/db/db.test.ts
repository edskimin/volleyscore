import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatchEvent, MatchSetup } from '../model/types'

// The module builds its Dexie instance at import time, so each test gets a fresh one.
async function load() {
  vi.resetModules()
  return import('./db')
}

function setup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  const mk = (numbers: string[]) =>
    numbers.map((number) => ({ number, name: null, captain: false }))
  return {
    level: 'varsity',
    format: 'best_of_5',
    date: '2026-10-14',
    venue: null,
    officials: { r1Name: null, r1Number: null, r2Name: null, r2Number: null },
    scorerName: null,
    home: {
      teamId: null,
      name: 'Avon Lake',
      colorPrimary: '#14284B',
      colorText: '#FFFFFF',
      roster: mk(['12', '7', '21', '4', '15', '9']),
      liberoNumbers: ['30'],
    },
    visitor: {
      teamId: null,
      name: "St. George's",
      colorPrimary: '#7A1120',
      colorText: '#FFFFFF',
      roster: mk(['3', '11', '8', '22', '6', '14']),
      liberoNumbers: [],
    },
    ...overrides,
  }
}

const rally: MatchEvent = {
  seq: 1,
  ts: '2026-10-14T18:00:00Z',
  type: 'RALLY_WON',
  team: 'home',
}

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('volleyscore')
    req.onsuccess = req.onerror = req.onblocked = () => resolve(null)
  })
})

afterEach(() => vi.resetModules())

// --- Schema and migration --------------------------------------------------

describe('schema', () => {
  it('opens from nothing', async () => {
    const { db } = await load()
    await expect(db.open()).resolves.toBeDefined()
    expect([...db.tables.map((t) => t.name)].sort()).toEqual([
      'appState',
      'backups',
      'matches',
      'teams',
    ])
    db.close()
  })

  /**
   * The regression that mattered: version 2 once changed the backups store's primary
   * key, which Dexie refuses outright. The database never opened and every screen went
   * blank on any device that had already run version 1.
   */
  it('upgrades a version 1 database without losing it', async () => {
    const legacy = new Dexie('volleyscore')
    legacy.version(1).stores({
      matches: 'matchId, updatedAt, status',
      teams: 'teamId, name, lastUsedAt',
      appState: 'key',
      backups: '++id, matchId, savedAt',
    })
    await legacy.open()
    await legacy.table('matches').put({
      schemaVersion: 1,
      matchId: 'old-match',
      createdAt: 'x',
      updatedAt: 'x',
      status: 'in_progress',
      setup: setup(),
      events: [],
    })
    await legacy.table('backups').add({ matchId: 'old-match', afterSet: 1, savedAt: 'x' })
    legacy.close()

    const { db } = await load()
    await expect(db.open()).resolves.toBeDefined()
    expect(await db.matches.get('old-match')).toBeDefined()
    expect(await db.backups.count()).toBe(1)
    db.close()
  })
})

// --- Matches ---------------------------------------------------------------

describe('matches', () => {
  it('creates a match that is active and not yet exported', async () => {
    const mod = await load()
    const record = await mod.createMatch(setup())
    expect(record.status).toBe('in_progress')
    expect(record.exportedAt).toBeNull()
    expect(await mod.getActiveMatchId()).toBe(record.matchId)
  })

  it('persists the log and nothing else', async () => {
    const mod = await load()
    const record = await mod.createMatch(setup())
    await mod.saveEvents(record.matchId, [rally])
    const stored = await mod.db.matches.get(record.matchId)
    expect(stored?.events).toHaveLength(1)
    expect(stored?.setup.home.name).toBe('Avon Lake')
  })

  it('edits setup without touching the log', async () => {
    const mod = await load()
    const record = await mod.createMatch(setup())
    await mod.saveEvents(record.matchId, [rally])
    await mod.saveSetup(record.matchId, setup({ venue: 'Blackman High School' }))
    const stored = await mod.db.matches.get(record.matchId)
    expect(stored?.setup.venue).toBe('Blackman High School')
    expect(stored?.events).toHaveLength(1)
  })

  it('lists most recently updated first', async () => {
    const mod = await load()
    const a = await mod.createMatch(setup())
    const b = await mod.createMatch(setup({ date: '2026-10-15' }))
    await mod.db.matches.update(a.matchId, { updatedAt: '2100-01-01T00:00:00Z' })
    expect((await mod.listMatches()).map((m) => m.matchId)).toEqual([a.matchId, b.matchId])
  })

  it('gates completion on the log having been written out', async () => {
    const mod = await load()
    const record = await mod.createMatch(setup())
    const exportedAt = await mod.markExported(record.matchId)
    expect((await mod.db.matches.get(record.matchId))?.exportedAt).toBe(exportedAt)
    await mod.markComplete(record.matchId)
    expect((await mod.db.matches.get(record.matchId))?.status).toBe('complete')
  })
})

// --- Backups ---------------------------------------------------------------

describe('backups', () => {
  it('replaces a set backup rather than accumulating rows', async () => {
    const mod = await load()
    const record = await mod.createMatch(setup())
    await mod.backupAfterSet(record, 1)
    await mod.backupAfterSet(record, 1)
    await mod.backupAfterSet(record, 2)
    expect(await mod.db.backups.count()).toBe(2)
    const rows = await mod.db.backups.toArray()
    expect(rows.map((r) => r.afterSet).sort()).toEqual([1, 2])
  })
})

// --- Export and import -----------------------------------------------------

describe('export and import', () => {
  it('names the file by date and teams', async () => {
    const mod = await load()
    expect(mod.exportFilename(setup())).toBe('2026-10-14-avon-lake-vs-st-george-s.json')
  })

  it('round trips a match through the export format', async () => {
    const mod = await load()
    const record = await mod.createMatch(setup())
    await mod.saveEvents(record.matchId, [rally])
    const payload = JSON.stringify(
      mod.toExport({ ...record, events: [rally] }),
      null,
      2,
    )
    const imported = await mod.importMatch(payload)
    expect(imported.events).toHaveLength(1)
    expect(imported.setup.home.name).toBe('Avon Lake')
    // A file already exists outside this device, so it does not block completion.
    expect(imported.exportedAt).not.toBeNull()
  })

  it('refuses a file from a newer schema rather than folding it wrongly', async () => {
    const mod = await load()
    expect(() => mod.migrate({ ...mod.toExport, schemaVersion: 99 } as never)).toThrow(
      /newer version/,
    )
  })

  it('migrates a schema 1 file, turning sidesSwitched into leftTeam', async () => {
    const mod = await load()
    // The old flag only drove the sheet's column order, where false put the visitor
    // on the left. An old file must still render the way it was written.
    const legacy = {
      schemaVersion: 1,
      matchId: 'old',
      exportedAt: 'x',
      setup: setup(),
      events: [
        { seq: 1, ts: 'x', type: 'SET_STARTED', setNumber: 1, sidesSwitched: false },
        { seq: 2, ts: 'x', type: 'SET_STARTED', setNumber: 2, sidesSwitched: true },
        { seq: 3, ts: 'x', type: 'RALLY_WON', team: 'home' },
      ],
    }
    const out = mod.migrate(legacy as never)
    expect(out.schemaVersion).toBe(mod.SCHEMA_VERSION)
    expect(out.events.map((e) => (e as { leftTeam?: string }).leftTeam)).toEqual([
      'visitor',
      'home',
      undefined,
    ])
    // The old field does not survive alongside the new one.
    expect(out.events.some((e) => 'sidesSwitched' in e)).toBe(false)
  })

  it('refuses a file that is not a match export', async () => {
    const mod = await load()
    await expect(mod.importMatch('{"schemaVersion":1}')).rejects.toThrow(/not a VolleyScore/)
  })
})

// --- Teams -----------------------------------------------------------------

describe('teams', () => {
  it('saves a team once and updates it in place', async () => {
    const mod = await load()
    const team = setup().home
    const teamId = await mod.saveTeam(team)
    await mod.saveTeam({ ...team, teamId, name: 'Avon Lake JV' })
    const rows = await mod.db.teams.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Avon Lake JV')
    expect(rows[0].liberoNumbers).toEqual(['30'])
  })
})

// --- App state -------------------------------------------------------------

describe('app state', () => {
  it('merges flags instead of replacing the row', async () => {
    const mod = await load()
    await mod.dismissInstall()
    await mod.setActiveMatchId('match-1')
    // Setting the active match must not wipe an unrelated flag in the same row.
    expect(await mod.isInstallDismissed()).toBe(true)
    expect(await mod.getActiveMatchId()).toBe('match-1')

    await mod.setActiveMatchId(null)
    expect(await mod.isInstallDismissed()).toBe(true)
  })
})

describe('stored matches migrate too', () => {
  it('rewrites a match already in IndexedDB, not just an imported file', async () => {
    // A match stored before leftTeam existed folds to undefined and crashes the
    // in-match screen, so the upgrade has to reach records already on the device.
    const legacy = new Dexie('volleyscore')
    legacy.version(1).stores({
      matches: 'matchId, updatedAt, status',
      teams: 'teamId, name, lastUsedAt',
      appState: 'key',
      backups: '++id, matchId, savedAt',
    })
    await legacy.open()
    await legacy.table('matches').put({
      schemaVersion: 1,
      matchId: 'legacy',
      createdAt: 'x',
      updatedAt: 'x',
      status: 'in_progress',
      setup: setup(),
      events: [
        { seq: 1, ts: 'x', type: 'SET_STARTED', setNumber: 1, sidesSwitched: true },
        { seq: 2, ts: 'x', type: 'RALLY_WON', team: 'home' },
      ],
    })
    legacy.close()

    const mod = await load()
    await mod.db.open()
    const stored = await mod.db.matches.get('legacy')
    const started = stored?.events[0] as { leftTeam?: string; sidesSwitched?: boolean }
    expect(started.leftTeam).toBe('home')
    expect('sidesSwitched' in started).toBe(false)
    expect(stored?.schemaVersion).toBe(mod.SCHEMA_VERSION)
    mod.db.close()
  })
})
