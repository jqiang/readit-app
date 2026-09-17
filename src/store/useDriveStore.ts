import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useLibraryStore } from './useLibraryStore'
import { mergeLibraries, type LibraryBackup } from '../lib/librarySync'
import * as drive from '../lib/googleDrive'

/** Snapshot the local library as a backup payload. */
function localBackup(): LibraryBackup {
  const { characters, sessions, coins, lastModified } = useLibraryStore.getState()
  return { characters, sessions, coins, lastModified }
}

/** Converge local state onto a merged backup, re-merging with whatever the
 * local store holds now so edits made during the network round-trip survive.
 * Passes the merge result straight to setState (rather than hand-enumerating
 * fields) so every `LibraryBackup` key lands in the store structurally — a
 * future field added to the backup shape can't be silently dropped here. */
function applyMerged(merged: LibraryBackup): void {
  useLibraryStore.setState(mergeLibraries(merged, localBackup()))
}

type SyncStatus = 'idle' | 'connecting' | 'syncing' | 'error'

interface DriveState {
  connected: boolean
  email: string | null
  name: string | null
  lastSyncedAt: number | null
  status: SyncStatus
  error: string | null
  /** True once a sync/API call has determined the stored token can't be
   * refreshed and interactive re-consent is required — i.e. `connected` is
   * stale and nothing will actually sync until the user reconnects. Surfaced
   * globally (header banner) since it can happen on any page, not just
   * Settings. Cleared by a successful connect or a successful sync. */
  needsReconnect: boolean
  connect: () => void
  disconnect: () => void
  pushToCloud: () => Promise<void>
  pullFromCloud: () => Promise<void>
  syncWithCloud: () => Promise<void>
}

export const useDriveStore = create<DriveState>()(
  persist(
    (set, get) => ({
      connected: false,
      email: null,
      name: null,
      lastSyncedAt: null,
      status: 'idle',
      error: null,
      needsReconnect: false,

      connect: () => {
        set({ status: 'connecting', error: null })
        drive.connect()
      },

      disconnect: () => {
        drive.disconnect()
        set({
          connected: false,
          email: null,
          name: null,
          status: 'idle',
          error: null,
          needsReconnect: false,
        })
      },

      // Additive sync to the cloud: merges local into the remote backup and
      // uploads the union, then converges local onto the merged result. Never
      // drops characters in either direction — only tombstoned removals delete.
      pushToCloud: async () => {
        if (get().status === 'syncing') return
        set({ status: 'syncing', error: null })
        try {
          const merged = await drive.pushLibrary(localBackup())
          applyMerged(merged)
          set({ status: 'idle', lastSyncedAt: Date.now(), needsReconnect: false })
        } catch (e) {
          set({
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
            needsReconnect: e instanceof drive.ReauthRequiredError ? true : get().needsReconnect,
          })
        }
      },

      // Additive restore from the cloud: merges the remote backup into local
      // (adding cloud characters, applying tombstones) without dropping local
      // characters the cloud hasn't seen.
      pullFromCloud: async () => {
        if (get().status === 'syncing') return
        set({ status: 'syncing', error: null })
        try {
          const remote = await drive.pullLibrary()
          if (!remote) {
            set({ status: 'error', error: '云端还没有备份数据' })
            return
          }
          applyMerged(remote)
          set({ status: 'idle', lastSyncedAt: Date.now(), needsReconnect: false })
        } catch (e) {
          set({
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
            needsReconnect: e instanceof drive.ReauthRequiredError ? true : get().needsReconnect,
          })
        }
      },

      // Background / on-connect sync — explicitly pull first, then push, so
      // local picks up remote data even if the upload later fails. Both steps
      // are additive merges, so nothing is ever dropped in either direction.
      // Called immediately whenever a connection is (re-)established — see
      // useGoogleOAuthRedirect — as well as periodically while connected.
      syncWithCloud: async () => {
        if (get().status === 'syncing') return
        set({ status: 'syncing', error: null })
        try {
          const remote = await drive.pullLibrary()
          if (remote) applyMerged(remote)
          const merged = await drive.pushLibrary(localBackup())
          applyMerged(merged)
          set({ status: 'idle', lastSyncedAt: Date.now(), needsReconnect: false })
        } catch (e) {
          set({
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
            needsReconnect: e instanceof drive.ReauthRequiredError ? true : get().needsReconnect,
          })
        }
      },
    }),
    {
      name: 'readit-drive',
      partialize: (state) => ({
        connected: state.connected,
        email: state.email,
        name: state.name,
        lastSyncedAt: state.lastSyncedAt,
        needsReconnect: state.needsReconnect,
      }),
    },
  ),
)
