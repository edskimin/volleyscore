// Ownership of the event log, and the only place it is written.
//
// A rally must never wait on anything. Appending updates React state synchronously
// and lets the IndexedDB write settle on its own; the log in memory is the truth for
// the current frame, and Dexie is a durability detail.

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  createMatch,
  getActiveMatchId,
  saveEvents,
  setActiveMatchId,
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
  open: (matchId: string) => Promise<void>
  leave: () => Promise<void>
}

export function useMatchStore(): MatchStore {
  const [record, setRecord] = useState<MatchRecord | null>(null)
  const [loading, setLoading] = useState(true)

  // On launch, resume an in-progress match silently. "New match" on the home screen
  // is a better escape hatch than a prompt on every reload.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const id = await getActiveMatchId()
      const found = id ? ((await db.matches.get(id)) ?? null) : null
      if (!cancelled) {
        setRecord(found)
        setLoading(false)
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
    append,
    undoLast,
    canUndo: (record?.events.length ?? 0) > 0,
    start,
    open,
    leave,
  }
}
