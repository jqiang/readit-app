import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBackup } from '../lib/librarySync'
import { awardEntry, coinBalance } from '../lib/coins'

/**
 * End-to-end proof that the coin balance lives in the Drive backup and not
 * just in one browser's localStorage: two independent "browsers" sync through
 * a shared in-memory stand-in for the Drive appData file, and must agree on
 * the balance afterwards.
 *
 * The pure merge is already covered in `librarySync.test.ts`; what this file
 * covers is the wiring around it — that `localBackup()` actually puts `coins`
 * into the uploaded payload, and that `applyMerged()` actually writes a
 * remote ledger back into the library store. A regression in either would
 * leave coins working perfectly on one machine and silently absent on the
 * next, which no pure-merge test would catch.
 */

/** The single JSON file in Drive's appData folder, as raw text. */
let cloudFile: string | null = null

vi.mock('../lib/googleDrive', async () => {
  const { mergeLibraries } = await import('../lib/librarySync')
  return {
    // Mirrors the real pushLibrary: download, merge remote-with-local, upload.
    pushLibrary: vi.fn(async (data: LibraryBackup) => {
      const merged = cloudFile ? mergeLibraries(JSON.parse(cloudFile), data) : data
      cloudFile = JSON.stringify(merged)
      return merged
    }),
    pullLibrary: vi.fn(async () => (cloudFile ? JSON.parse(cloudFile) : null)),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConfigured: () => true,
    ReauthRequiredError: class ReauthRequiredError extends Error {},
  }
})

const { useLibraryStore } = await import('./useLibraryStore')
const { useDriveStore } = await import('./useDriveStore')

/** Wipe every trace of the previous browser, including the coin ledger. */
function freshBrowser() {
  useLibraryStore.setState({ characters: {}, sessions: [], coins: [], lastModified: 0 })
  useDriveStore.setState({ status: 'idle', error: null })
}

function balance() {
  return coinBalance(useLibraryStore.getState().coins)
}

describe('coin balance across browsers', () => {
  beforeEach(() => {
    cloudFile = null
    freshBrowser()
  })

  it('uploads the coin ledger to the cloud backup', async () => {
    useLibraryStore.getState().awardCoins('reading', 'book-1')
    await useDriveStore.getState().syncWithCloud()

    expect(cloudFile).not.toBeNull()
    const uploaded = JSON.parse(cloudFile!) as LibraryBackup
    expect(uploaded.coins).toHaveLength(1)
    expect(coinBalance(uploaded.coins)).toBe(50)
  })

  it('a second browser signing in picks up the balance', async () => {
    useLibraryStore.getState().awardCoins('reading', 'book-1')
    useLibraryStore.getState().awardCoins('pinyin')
    await useDriveStore.getState().syncWithCloud()
    expect(balance()).toBe(60)

    freshBrowser()
    expect(balance()).toBe(0)

    await useDriveStore.getState().syncWithCloud()
    expect(balance()).toBe(60)
  })

  it('coins earned on either browser survive and never double-count', async () => {
    // Browser A earns and syncs.
    useLibraryStore.getState().awardCoins('pinyin')
    await useDriveStore.getState().syncWithCloud()
    const browserA = useLibraryStore.getState().coins

    // Browser B starts fresh, syncs down, then earns its own coins.
    freshBrowser()
    await useDriveStore.getState().syncWithCloud()
    useLibraryStore.getState().awardCoins('review')
    await useDriveStore.getState().syncWithCloud()
    expect(balance()).toBe(15)

    // Browser A syncs again and converges on the same total.
    freshBrowser()
    useLibraryStore.setState({ coins: browserA })
    await useDriveStore.getState().syncWithCloud()
    expect(balance()).toBe(15)

    // Repeated syncs must not inflate it.
    for (let i = 0; i < 5; i++) await useDriveStore.getState().syncWithCloud()
    expect(balance()).toBe(15)
    expect(coinBalance(JSON.parse(cloudFile!).coins)).toBe(15)
  })

  it('a redemption on one browser reaches the other', async () => {
    useLibraryStore.getState().awardCoins('reading', 'book-1')
    await useDriveStore.getState().syncWithCloud()

    useLibraryStore.getState().adjustCoins(-20, '换了贴纸')
    await useDriveStore.getState().syncWithCloud()

    freshBrowser()
    await useDriveStore.getState().syncWithCloud()
    expect(balance()).toBe(30)
  })

  it('the same book on the same day pays once across browsers', async () => {
    const day = new Date()
    const now = day.getTime()
    // Both browsers award the same book offline, before either has synced.
    const a = awardEntry([], 'reading', { refId: 'book-1', now })!
    const b = awardEntry([], 'reading', { refId: 'book-1', now: now + 5000 })!

    useLibraryStore.setState({ coins: [a] })
    await useDriveStore.getState().syncWithCloud()

    freshBrowser()
    useLibraryStore.setState({ coins: [b] })
    await useDriveStore.getState().syncWithCloud()

    expect(balance()).toBe(50)
    expect(useLibraryStore.getState().coins).toHaveLength(1)
  })
})
