import { describe, expect, it } from 'vitest'
import {
  COIN_REWARDS,
  adjustEntry,
  awardEntry,
  coinBalance,
  dayKey,
  readingEntryId,
  recentCoinEntries,
  todayEarned,
} from './coins'
import type { CoinEntry } from '../types'

function entry(over: Partial<CoinEntry> = {}): CoinEntry {
  return {
    id: 'x',
    amount: 10,
    reason: 'pinyin',
    date: 1000,
    day: '2026-01-01',
    ...over,
  }
}

describe('dayKey', () => {
  it('agrees within a local day', () => {
    const morning = new Date(2026, 0, 31, 8, 0).getTime()
    const night = new Date(2026, 0, 31, 23, 30).getTime()
    expect(dayKey(morning)).toBe(dayKey(night))
  })

  it('differs across local midnight', () => {
    const beforeMidnight = new Date(2026, 0, 31, 23, 30).getTime()
    const afterMidnight = new Date(2026, 1, 1, 0, 5).getTime()
    expect(dayKey(beforeMidnight)).not.toBe(dayKey(afterMidnight))
  })

  it('does not use UTC (toISOString semantics)', () => {
    // 2026-01-31 23:30 local must stay in January locally, regardless of the
    // machine's UTC offset — a UTC-based dayKey would only fail west of UTC,
    // so this just pins the *implementation*, not a specific timezone.
    const ts = new Date(2026, 0, 31, 23, 30).getTime()
    expect(dayKey(ts)).toBe('2026-01-31')
  })
})

describe('coinBalance', () => {
  it('sums entries', () => {
    const entries = [entry({ amount: 50 }), entry({ amount: 10 }), entry({ amount: -20 })]
    expect(coinBalance(entries)).toBe(40)
  })

  it('is order-independent', () => {
    const entries = [entry({ amount: 50 }), entry({ amount: 10 }), entry({ amount: -20 })]
    const reversed = [...entries].reverse()
    expect(coinBalance(entries)).toBe(coinBalance(reversed))
  })

  it('does not clamp at 0', () => {
    const entries = [entry({ amount: 10 }), entry({ amount: -30 })]
    expect(coinBalance(entries)).toBe(-20)
  })
})

describe('awardEntry — reading (daily guard)', () => {
  const day1 = new Date(2026, 0, 31, 10, 0).getTime()
  const day1Later = new Date(2026, 0, 31, 20, 0).getTime()
  const day2 = new Date(2026, 1, 1, 10, 0).getTime()

  it('awards on first read of a book', () => {
    const result = awardEntry([], 'reading', { refId: 'book-a', now: day1 })
    expect(result).not.toBeNull()
    expect(result?.amount).toBe(COIN_REWARDS.reading)
    expect(result?.reason).toBe('reading')
    expect(result?.refId).toBe('book-a')
  })

  it('blocks a same-day repeat of the same book', () => {
    const first = awardEntry([], 'reading', { refId: 'book-a', now: day1 })!
    const second = awardEntry([first], 'reading', { refId: 'book-a', now: day1Later })
    expect(second).toBeNull()
  })

  it('allows a different book the same day', () => {
    const first = awardEntry([], 'reading', { refId: 'book-a', now: day1 })!
    const second = awardEntry([first], 'reading', { refId: 'book-b', now: day1Later })
    expect(second).not.toBeNull()
    expect(second?.amount).toBe(COIN_REWARDS.reading)
  })

  it('allows the same book the next day', () => {
    const first = awardEntry([], 'reading', { refId: 'book-a', now: day1 })!
    const second = awardEntry([first], 'reading', { refId: 'book-a', now: day2 })
    expect(second).not.toBeNull()
  })

  it('produces equal ids for two independent calls for the same book+day', () => {
    const a = awardEntry([], 'reading', { refId: 'book-a', now: day1 })!
    const b = awardEntry([], 'reading', { refId: 'book-a', now: day1Later })!
    expect(a.id).toBe(b.id)
    expect(a.id).toBe(readingEntryId(dayKey(day1), 'book-a'))
  })
})

describe('awardEntry — pinyin/review', () => {
  const now = new Date(2026, 0, 31, 10, 0).getTime()

  it('always mints a fresh entry for pinyin, amount 10', () => {
    const existing = awardEntry([], 'pinyin', { refId: 'sprint', now })!
    const again = awardEntry([existing], 'pinyin', { refId: 'sprint', now })
    expect(again).not.toBeNull()
    expect(again?.id).not.toBe(existing.id)
    expect(again?.amount).toBe(10)
    expect(existing.amount).toBe(10)
  })

  it('always mints a fresh entry for review, amount 5', () => {
    const existing = awardEntry([], 'review', { now })!
    const again = awardEntry([existing], 'review', { now })
    expect(again).not.toBeNull()
    expect(again?.id).not.toBe(existing.id)
    expect(again?.amount).toBe(5)
    expect(existing.amount).toBe(5)
  })
})

describe('adjustEntry', () => {
  it('accepts a positive reward and keeps the note', () => {
    const e = adjustEntry(20, '奖励贴纸', 5000)
    expect(e.amount).toBe(20)
    expect(e.reason).toBe('adjust')
    expect(e.note).toBe('奖励贴纸')
    expect(e.day).toBe(dayKey(5000))
  })

  it('accepts a negative redemption', () => {
    const e = adjustEntry(-15, '换玩具', 5000)
    expect(e.amount).toBe(-15)
  })

  it('works with no note', () => {
    const e = adjustEntry(5, undefined, 5000)
    expect(e.note).toBeUndefined()
  })
})

describe('recentCoinEntries', () => {
  it('returns the n most recent, newest first', () => {
    const entries = [entry({ id: 'a', date: 100 }), entry({ id: 'b', date: 300 }), entry({ id: 'c', date: 200 })]
    expect(recentCoinEntries(entries, 2).map((e) => e.id)).toEqual(['b', 'c'])
  })

  it('does not mutate the input array', () => {
    const entries = [entry({ id: 'a', date: 100 }), entry({ id: 'b', date: 300 })]
    const copy = [...entries]
    recentCoinEntries(entries, 1)
    expect(entries).toEqual(copy)
  })
})

describe('todayEarned', () => {
  const now = new Date(2026, 0, 31, 12, 0).getTime()
  const today = dayKey(now)
  const yesterday = dayKey(new Date(2026, 0, 30, 12, 0).getTime())

  it('sums only today\'s positive entries', () => {
    const entries = [
      entry({ amount: 50, day: today }),
      entry({ amount: 10, day: today }),
      entry({ amount: 100, day: yesterday }),
    ]
    expect(todayEarned(entries, now)).toBe(60)
  })

  it('is 0 when nothing was earned today', () => {
    expect(todayEarned([entry({ amount: 50, day: yesterday })], now)).toBe(0)
  })
})
