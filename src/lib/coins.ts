import type { CoinEntry, CoinReason } from '../types'

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export const COIN_REWARDS = {
  pinyin: 10,
  review: 5,
  reading: 50,
} as const

/** The reasons that can *earn* coins (excludes 'adjust', which is manual). */
export type EarnReason = keyof typeof COIN_REWARDS

export const COIN_REASON_LABELS: Record<CoinReason, string> = {
  pinyin: '拼音游戏',
  review: '巩固复习',
  reading: '朗读课文',
  adjust: '家长调整',
}

// ---------------------------------------------------------------------------
// Day bucketing
// ---------------------------------------------------------------------------

/** Local `YYYY-MM-DD` for `ts`. Must use local date parts, never
 * `toISOString()`, which is UTC and would roll the day over during evening
 * reading in most timezones. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/** Plain sum of the ledger. Does not clamp at 0: clamping is not associative
 * under an unordered merge and would hide an over-deduction. */
export function coinBalance(entries: CoinEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0)
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

/** Deterministic id for a reading reward, so the once-per-day cap survives a
 * cross-device merge (two devices awarding the same book/day collapse to one
 * ledger entry instead of stacking). */
export function readingEntryId(day: string, passageId: string): string {
  return `read-${day}-${passageId}`
}

/**
 * Award a coin entry for `reason`, or `null` if the daily guard blocked it
 * (reading only: one paid session per book per local day). The guard is a
 * plain id lookup against `entries`, so the local rule and the cross-device
 * merge's id-collision dedupe are literally the same rule.
 */
export function awardEntry(
  entries: CoinEntry[],
  reason: EarnReason,
  opts: { refId?: string; now?: number } = {},
): CoinEntry | null {
  const now = opts.now ?? Date.now()
  const day = dayKey(now)

  if (reason === 'reading') {
    const id = readingEntryId(day, opts.refId ?? '')
    if (entries.some((e) => e.id === id)) return null
    return { id, amount: COIN_REWARDS.reading, reason, date: now, day, refId: opts.refId }
  }

  // Pinyin/review always mint a fresh, repeatable entry.
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`
  return { id, amount: COIN_REWARDS[reason], reason, date: now, day, refId: opts.refId }
}

// ---------------------------------------------------------------------------
// Manual adjustment
// ---------------------------------------------------------------------------

/** A parent-entered adjustment: positive to reward, negative to redeem. */
export function adjustEntry(amount: number, note: string | undefined, now: number): CoinEntry {
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    amount,
    reason: 'adjust',
    date: now,
    day: dayKey(now),
    note,
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** The `n` most recent entries, newest first. */
export function recentCoinEntries(entries: CoinEntry[], n: number): CoinEntry[] {
  return [...entries].sort((a, b) => b.date - a.date).slice(0, n)
}

/** Coins earned so far on `now`'s local day (redemptions/negative adjustments
 * on the same day are not netted out — this is "how much came in today"). */
export function todayEarned(entries: CoinEntry[], now: number): number {
  const day = dayKey(now)
  return entries.reduce((sum, e) => (e.day === day && e.amount > 0 ? sum + e.amount : sum), 0)
}
