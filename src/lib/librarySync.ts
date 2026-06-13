import type { CharacterStats, ReadingSession } from '../types'

/**
 * The shape of the library backup stored in Drive and merged across devices.
 * Characters are never deleted — a character the user "removes" is kept with
 * its `removed` flag set, so a sync can never drop data by omission.
 */
export interface LibraryBackup {
  characters: Record<string, CharacterStats>
  sessions: ReadingSession[]
  /** Epoch ms of the last local mutation; kept for display/ordering only. */
  lastModified: number
}

const MAX_SESSIONS = 50

/**
 * Merge two library backups additively — the result is the union of both
 * sides, never a removal-by-omission:
 *
 * - **Characters**: union of both; for a char present on both sides the entry
 *   with the newer `lastSeen` wins, so the latest metadata *and* the latest
 *   `removed` flag (move-out / re-add) propagate. A side that simply hasn't
 *   heard of a char never deletes it.
 * - **Sessions**: union by id, newest first, capped at the most recent 50.
 */
export function mergeLibraries(a: LibraryBackup, b: LibraryBackup): LibraryBackup {
  const aChars = a.characters ?? {}
  const bChars = b.characters ?? {}

  const characters: Record<string, CharacterStats> = {}
  for (const char of new Set([...Object.keys(aChars), ...Object.keys(bChars)])) {
    const ca = aChars[char]
    const cb = bChars[char]
    characters[char] = !ca ? cb : !cb ? ca : cb.lastSeen > ca.lastSeen ? cb : ca
  }

  const byId = new Map<string, ReadingSession>()
  for (const s of [...(a.sessions ?? []), ...(b.sessions ?? [])]) byId.set(s.id, s)
  const sessions = [...byId.values()]
    .sort((x, y) => y.date - x.date)
    .slice(0, MAX_SESSIONS)

  return {
    characters,
    sessions,
    lastModified: Math.max(a.lastModified ?? 0, b.lastModified ?? 0),
  }
}
