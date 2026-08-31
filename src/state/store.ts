// Ownership of the event log, and the only place it is written.
//
// A rally must never wait on anything. Appending updates React state synchronously
// and lets the IndexedDB write settle on its own; the log in memory is the truth for
// the current frame, and Dexie is a durability detail.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  backupAfterSet,
  createMatch,
  getActiveMatchId,
  markComplete,
  markExported,
  saveEvents,
  saveSetup,
  setActiveMatchId,
  shareExport,
  db,
  type MatchRecord,
} from '../db/db'
import { fold } from '../model/reducer'
import type { DerivedState, EventBody, MatchEvent, MatchSetup } from '../model/types'

function stamp(events: MatchEvent[], body: EventBody): MatchEvent {
  const seq = events.length === 0 ? 1 : events[events.length - 1].seq + 1
  return { ...body, seq, ts: new Date().toISOString() } as MatchEvent
}

export interface MatchStore {
  record: MatchRecord | null
  state: DerivedState | null
  loading: boolean
  /** A storage failure, surfaced rather than left as a blank screen. */
  error: string | null
  /**
   * Append events. Each is its own undo step, so a compound libero exchange takes two
   * taps of undo to reverse. That is deliberate: the log is the record of what the
   * app was told, and collapsing it would hide one of the two replacements.
   */
  append: (...bodies: EventBody[]) => void
  /** Undo is dropping the last event and re-folding. */
  undoLast: () => void
  canUndo: boolean
  start: (setup: MatchSetup) => Promise<void>
  /** Edit team names, colors, officials and rosters after the match has begun. */
  updateSetup: (setup: MatchSetup) => Promise<void>
  /** Write the log out to a file. Completion is blocked until this has succeeded. */
  exportMatch: () => Promise<void>
  /** Mark the match complete. Refuses while the log has never been exported. */
  complete: () => Promise<void>
  open: (matchId: string) => Promise<void>
  leave: () => Promise<void>
}

export function useMatchStore(): MatchStore {
  const [record, setRecord] = useState<MatchRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // On launch, resume an in-progress match silently. "New match" on the home screen
  // is a better escape hatch than a prompt on every reload.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const id = await getActiveMatchId()
        const found = id ? ((await db.matches.get(id)) ?? null) : null
        if (!cancelled) setRecord(found)
      } catch (err) {
        // A failed IndexedDB open must never leave a blank screen mid-match.
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const state = useMemo(
    () => (record ? fold(record.setup, record.events) : null),
    [record],
  )

  // Persistence is an effect, not a side effect inside a state updater: updaters must
  // be pure and React may invoke them more than once. Opening a match rewrites its own
  // log once, which costs nothing and keeps `updatedAt` honest about recency.
  useEffect(() => {
    if (record) void saveEvents(record.matchId, record.events)
  }, [record])

  // A second line against eviction: snapshot the whole match each time a set closes.
  // The backup store is keyed by match and set, so this upserts rather than piling up.
  const lastBackup = useRef(-1)
  useEffect(() => {
    if (!record) return
    const ended = record.events.filter((e) => e.type === 'SET_ENDED').length
    if (ended === lastBackup.current) return
    lastBackup.current = ended
    if (ended > 0) void backupAfterSet(record, ended)
  }, [record])

  const append = useCallback(
    (...bodies: EventBody[]) => {
      setRecord((prev) => {
        if (!prev) return prev
        let events = prev.events
        for (const body of bodies) events = [...events, stamp(events, body)]
        return { ...prev, events, updatedAt: new Date().toISOString() }
      })
    },
    [],
  )

  const undoLast = useCallback(() => {
    setRecord((prev) => {
      if (!prev || prev.events.length === 0) return prev
      return { ...prev, events: prev.events.slice(0, -1) }
    })
  }, [])

  const start = useCallback(
    async (setup: MatchSetup) => {
      setRecord(await createMatch(setup))
    },
    [],
  )

  const updateSetup = useCallback(async (setup: MatchSetup) => {
    let id: string | null = null
    setRecord((prev) => {
      if (!prev) return prev
      id = prev.matchId
      return { ...prev, setup }
    })
    if (id) await saveSetup(id, setup)
  }, [])

  const exportMatch = useCallback(async () => {
    if (!record) return
    await shareExport(record)
    const exportedAt = await markExported(record.matchId)
    setRecord((prev) => (prev ? { ...prev, exportedAt } : prev))
  }, [record])

  const complete = useCallback(async () => {
    // The guard is the point: a match is not complete until the file has been shared.
    if (!record?.exportedAt) return
    await markComplete(record.matchId)
    await setActiveMatchId(null)
    // Drop it from memory too, so nothing downstream still treats it as the match in
    // progress: the home screen would keep offering to resume a finished match.
    setRecord(null)
  }, [record])

  const open = useCallback(async (matchId: string) => {
    const found = (await db.matches.get(matchId)) ?? null
    if (found) await setActiveMatchId(matchId)
    setRecord(found)
  }, [])

  const leave = useCallback(async () => {
    await setActiveMatchId(null)
    setRecord(null)
  }, [])

  return {
    record,
    state,
    loading,
    error,
    append,
    undoLast,
    canUndo: (record?.events.length ?? 0) > 0,
    start,
    updateSetup,
    exportMatch,
    complete,
    open,
    leave,
  }
}
