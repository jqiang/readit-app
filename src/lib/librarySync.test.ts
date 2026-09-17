import { describe, expect, it } from 'vitest'
import { mergeLibraries, type LibraryBackup } from './librarySync'
import { coinBalance, readingEntryId } from './coins'
import type { CharacterStats, CoinEntry, ReadingSession } from '../types'

function char(c: string, over: Partial<CharacterStats> = {}): CharacterStats {
  return {
    char: c,
    correctCount: 0,
    wrongCount: 0,
    box: 1,
    lastSeen: 1000,
    nextReview: 1000,
    ...over,
  }
}

function charsOf(...cs: CharacterStats[]): Record<string, CharacterStats> {
  return Object.fromEntries(cs.map((c) => [c.char, c]))
}

function session(id: string, date: number): ReadingSession {
  return {
    id,
    passageId: 'p',
    passageTitle: 't',
    date,
    totalChars: 0,
    correctChars: 0,
    wrongChars: [],
    learnedChars: [],
    removedChars: [],
  }
}

function coin(id: string, amount: number, date: number, over: Partial<CoinEntry> = {}): CoinEntry {
  return { id, amount, reason: 'adjust', date, day: '2026-01-01', ...over }
}

function backup(over: Partial<LibraryBackup> = {}): LibraryBackup {
  return { characters: {}, sessions: [], coins: [], lastModified: 0, ...over }
}

describe('mergeLibraries — never loses characters', () => {
  it('keeps the union of characters from both sides', () => {
    const a = backup({ characters: charsOf(char('我'), char('你')) })
    const b = backup({ characters: charsOf(char('他'), char('她')) })

    const merged = mergeLibraries(a, b)

    expect(new Set(Object.keys(merged.characters))).toEqual(new Set(['我', '你', '他', '她']))
  })

  it('does not wipe a populated cloud backup when local is empty (the original bug)', () => {
    // A device with cleared localStorage must never erase the cloud library.
    const remote = backup({
      characters: charsOf(char('我'), char('你'), char('好')),
      lastModified: 5000,
    })
    const emptyLocal = backup({ lastModified: 0 })

    expect(Object.keys(mergeLibraries(remote, emptyLocal).characters)).toHaveLength(3)
    // Order of operands must not matter for the union.
    expect(Object.keys(mergeLibraries(emptyLocal, remote).characters)).toHaveLength(3)
  })

  it('preserves characters unique to each device when both have edits', () => {
    const deviceA = backup({ characters: charsOf(char('猫'), char('狗')) })
    const deviceB = backup({ characters: charsOf(char('鱼'), char('鸟')) })

    const merged = mergeLibraries(deviceA, deviceB)

    expect(new Set(Object.keys(merged.characters))).toEqual(new Set(['猫', '狗', '鱼', '鸟']))
  })

  it('every key on either side survives the merge (union invariant)', () => {
    const scenarios: Array<[string[], string[]]> = [
      [['a'], []],
      [[], ['b']],
      [['a', 'b'], ['b', 'c']],
      [['x', 'y', 'z'], ['z']],
      [[], []],
    ]
    for (const [aKeys, bKeys] of scenarios) {
      const a = backup({ characters: charsOf(...aKeys.map((k) => char(k))) })
      const b = backup({ characters: charsOf(...bKeys.map((k) => char(k))) })
      const merged = mergeLibraries(a, b)
      for (const k of [...aKeys, ...bKeys]) {
        expect(merged.characters[k], `key ${k} missing`).toBeDefined()
      }
    }
  })
})

describe('mergeLibraries — newest metadata wins for shared characters', () => {
  it('picks the entry with the newer lastSeen', () => {
    const older = char('我', { lastSeen: 1000, box: 1, correctCount: 1 })
    const newer = char('我', { lastSeen: 2000, box: 4, correctCount: 9 })

    expect(mergeLibraries(backup({ characters: charsOf(older) }), backup({ characters: charsOf(newer) })).characters['我']).toEqual(newer)
    // Symmetric: whichever side the newer entry is on, it still wins.
    expect(mergeLibraries(backup({ characters: charsOf(newer) }), backup({ characters: charsOf(older) })).characters['我']).toEqual(newer)
  })
})

describe('mergeLibraries — removals are flagged, never dropped', () => {
  it('a removed character is still present in the merged map', () => {
    const removedLocally = char('错', { removed: true, lastSeen: 3000 })
    const merged = mergeLibraries(
      backup({ characters: charsOf(removedLocally) }),
      backup({}),
    )
    // Kept (so the removal can sync), just flagged — not deleted.
    expect(merged.characters['错']).toBeDefined()
    expect(merged.characters['错'].removed).toBe(true)
  })

  it('propagates a removal when it is the newer edit', () => {
    const activeRemote = char('字', { removed: false, lastSeen: 1000 })
    const removedLocal = char('字', { removed: true, lastSeen: 2000 })

    const merged = mergeLibraries(
      backup({ characters: charsOf(activeRemote) }),
      backup({ characters: charsOf(removedLocal) }),
    )
    expect(merged.characters['字'].removed).toBe(true)
  })

  it('revives a character when the re-add is the newer edit', () => {
    const removedRemote = char('字', { removed: true, lastSeen: 1000 })
    const revivedLocal = char('字', { removed: false, lastSeen: 2000 })

    const merged = mergeLibraries(
      backup({ characters: charsOf(removedRemote) }),
      backup({ characters: charsOf(revivedLocal) }),
    )
    expect(merged.characters['字'].removed).toBe(false)
  })

  it('does not let an older active copy override a newer removal', () => {
    const newerRemoval = char('字', { removed: true, lastSeen: 5000 })
    const olderActive = char('字', { removed: false, lastSeen: 1000 })

    const merged = mergeLibraries(
      backup({ characters: charsOf(newerRemoval) }),
      backup({ characters: charsOf(olderActive) }),
    )
    expect(merged.characters['字'].removed).toBe(true)
  })
})

describe('mergeLibraries — sessions and metadata', () => {
  it('unions sessions by id, newest first', () => {
    const a = backup({ sessions: [session('s1', 100), session('s2', 300)] })
    const b = backup({ sessions: [session('s3', 200)] })

    const merged = mergeLibraries(a, b)

    expect(merged.sessions.map((s) => s.id)).toEqual(['s2', 's3', 's1'])
  })

  it('deduplicates sessions sharing an id', () => {
    const a = backup({ sessions: [session('dup', 100)] })
    const b = backup({ sessions: [session('dup', 100)] })

    expect(mergeLibraries(a, b).sessions).toHaveLength(1)
  })

  it('caps sessions at the 50 most recent', () => {
    const many = Array.from({ length: 60 }, (_, i) => session(`s${i}`, i))
    const merged = mergeLibraries(backup({ sessions: many }), backup({}))

    expect(merged.sessions).toHaveLength(50)
    // Newest kept, oldest dropped.
    expect(merged.sessions[0].date).toBe(59)
    expect(merged.sessions.at(-1)?.date).toBe(10)
  })

  it('takes the max lastModified', () => {
    expect(
      mergeLibraries(backup({ lastModified: 10 }), backup({ lastModified: 99 })).lastModified,
    ).toBe(99)
  })
})

describe('mergeLibraries — robustness', () => {
  it('tolerates missing characters/sessions/coins fields (legacy backups)', () => {
    const legacy = { lastModified: 1 } as unknown as LibraryBackup
    const merged = mergeLibraries(legacy, backup({ characters: charsOf(char('我')) }))

    expect(Object.keys(merged.characters)).toEqual(['我'])
    expect(merged.sessions).toEqual([])
    expect(merged.coins).toEqual([])
  })

  it('does not mutate its inputs', () => {
    const a = backup({
      characters: charsOf(char('我')),
      sessions: [session('s1', 1)],
      coins: [coin('c1', 10, 100)],
    })
    const b = backup({ characters: charsOf(char('你')), coins: [coin('c2', 5, 200)] })
    const aSnapshot = structuredClone(a)
    const bSnapshot = structuredClone(b)

    mergeLibraries(a, b)

    expect(a).toEqual(aSnapshot)
    expect(b).toEqual(bSnapshot)
  })

  it('converges: re-merging a merged result is stable', () => {
    const a = backup({
      characters: charsOf(char('我', { lastSeen: 2000 }), char('错', { removed: true, lastSeen: 3000 })),
      sessions: [session('s1', 1)],
      coins: [coin('c1', 10, 100), coin('c2', 50, 300)],
    })
    const b = backup({ characters: charsOf(char('你', { lastSeen: 1500 })), coins: [coin('c2', 50, 200)] })

    const once = mergeLibraries(a, b)
    const twice = mergeLibraries(once, b)
    const thrice = mergeLibraries(a, once)

    expect(twice).toEqual(once)
    expect(thrice).toEqual(once)
  })
})

describe('mergeLibraries — coin ledger', () => {
  it('unions coins by id, deduping shared entries', () => {
    const a = backup({ coins: [coin('c1', 10, 100), coin('c2', 5, 200)] })
    const b = backup({ coins: [coin('c2', 5, 200), coin('c3', 50, 300)] })

    const merged = mergeLibraries(a, b)

    expect(merged.coins.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('keeps all 200 coin entries uncapped, unlike the 50-entry cap on sessions', () => {
    const many = Array.from({ length: 200 }, (_, i) => coin(`c${i}`, 1, i))
    const merged = mergeLibraries(backup({ coins: many }), backup({}))

    // Contrast with 'caps sessions at the 50 most recent' above: the ledger
    // IS the balance, so it is never sliced.
    expect(merged.coins).toHaveLength(200)
    expect(coinBalance(merged.coins)).toBe(200)
  })

  it('does not double-count coins across a full sync pipeline (pull -> applyMerged -> push -> applyMerged)', () => {
    const earned = [coin('r1', 50, 1000), coin('r2', 10, 2000)]
    const local = backup({ coins: earned })
    const remote = backup({ coins: [] })

    // pull -> applyMerged: local state becomes the union with the cloud copy.
    const afterPull = mergeLibraries(remote, local)
    // push: the remote side merges what we send with its own current copy.
    const remoteAfterPush = mergeLibraries(remote, afterPull)
    // applyMerged again locally, against whatever the push round-trip returned.
    const afterPush = mergeLibraries(afterPull, remoteAfterPush)

    expect(coinBalance(afterPush.coins)).toBe(60)

    // A second sync tick with no new local activity must not add anything.
    const tick2Pull = mergeLibraries(remoteAfterPush, afterPush)
    const tick2RemoteAfterPush = mergeLibraries(remoteAfterPush, tick2Pull)
    const tick2Local = mergeLibraries(tick2Pull, tick2RemoteAfterPush)

    expect(coinBalance(tick2Local.coins)).toBe(60)
    expect(tick2Local.coins).toHaveLength(2)
  })

  it('sums coins earned independently offline on two devices', () => {
    const deviceA = backup({ coins: [coin('a1', 10, 100), coin('a2', 5, 200)] })
    const deviceB = backup({ coins: [coin('b1', 50, 150)] })

    const merged = mergeLibraries(deviceA, deviceB)

    expect(merged.coins).toHaveLength(3)
    expect(coinBalance(merged.coins)).toBe(65)
  })

  it('the same book read on two devices the same day yields one 50-coin reward, not two', () => {
    const day = '2026-01-05'
    const id = readingEntryId(day, 'book-1')
    const deviceA = backup({
      coins: [{ id, amount: 50, reason: 'reading', date: 1000, day, refId: 'book-1' }],
    })
    const deviceB = backup({
      coins: [{ id, amount: 50, reason: 'reading', date: 2000, day, refId: 'book-1' }],
    })

    const merged = mergeLibraries(deviceA, deviceB)

    expect(merged.coins).toHaveLength(1)
    expect(coinBalance(merged.coins)).toBe(50)
  })

  it('is commutative when the same id carries different dates (earliest wins either way)', () => {
    const early = coin('x', 50, 1000)
    const late = coin('x', 50, 5000, { note: 'later mint' })

    const ab = mergeLibraries(backup({ coins: [early] }), backup({ coins: [late] }))
    const ba = mergeLibraries(backup({ coins: [late] }), backup({ coins: [early] }))

    expect(ab).toEqual(ba)
    expect(ab.coins[0].date).toBe(1000)
  })

  it('is commutative even on an exact date tie between differing entries', () => {
    const left = coin('x', 50, 1000, { note: 'left' })
    const right = coin('x', 50, 1000, { note: 'right' })

    const ab = mergeLibraries(backup({ coins: [left] }), backup({ coins: [right] }))
    const ba = mergeLibraries(backup({ coins: [right] }), backup({ coins: [left] }))

    expect(ab).toEqual(ba)
  })

  it('tolerates a legacy backup missing the coins field, keeping the local ledger', () => {
    const legacy = { characters: {}, sessions: [], lastModified: 1 } as unknown as LibraryBackup
    const local = backup({ coins: [coin('a', 10, 100)] })

    const merged = mergeLibraries(legacy, local)

    expect(merged.coins).toEqual([coin('a', 10, 100)])
  })
})
