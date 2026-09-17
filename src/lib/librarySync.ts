import type { CharacterStats, CoinEntry, ReadingSession } from '../types'

/**
 * The shape of the library backup stored in Drive and merged across devices.
 * Characters are never deleted — a character the user "removes" is kept with
 * its `removed` flag set, so a sync can never drop data by omission. The coin
 * ledger (`coins`) is required rather than optional so `tsc` catches any spot
 * that builds a `LibraryBackup` without it (this deliberately breaks the
 * return literal below and `useDriveStore.ts`'s `localBackup()` until they are
 * updated — see the coin-rewards plan, Phase 2/3).
 */
export interface LibraryBackup {
  characters: Record<string, CharacterStats>
  sessions: ReadingSession[]
  coins: CoinEntry[]
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
 * - **Coins**: union by id, newest first, on an id collision the entry with
 *   the *earliest* `date` wins (see below) — and, unlike sessions, this list
 *   is never capped/sliced.
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

  // The coin ledger IS the balance (coinBalance() just sums it) — it is never
  // capped or sliced like sessions are. Sessions are a display log where
  // dropping old rows is harmless; dropping a coin entry silently changes how
  // much money the child has, and mergeLibraries() runs up to 4x per sync
  // tick plus once remotely, so any lossy step here would compound. On an id
  // collision (the same deterministic reading-reward id minted independently
  // on two devices) the entry with the earliest `date` wins, which keeps the
  // merge commutative and idempotent regardless of which side is "a" or "b".
  const coinsById = new Map<string, CoinEntry>()
  for (const c of [...(a.coins ?? []), ...(b.coins ?? [])]) {
    const existing = coinsById.get(c.id)
    if (!existing) {
      coinsById.set(c.id, c)
      continue
    }
    // Earliest date wins. On an exact date tie (only possible if the two
    // sides' entries also differ in content, since equal ids+dates+content
    // are indistinguishable anyway) fall back to a stable content compare so
    // the choice never depends on which side is passed as `a` vs `b`.
    if (c.date < existing.date || (c.date === existing.date && JSON.stringify(c) < JSON.stringify(existing))) {
      coinsById.set(c.id, c)
    }
  }
  const coins = [...coinsById.values()].sort((x, y) => y.date - x.date)

  return {
    characters,
    sessions,
    coins,
    lastModified: Math.max(a.lastModified ?? 0, b.lastModified ?? 0),
  }
}
