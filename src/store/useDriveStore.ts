import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useLibraryStore } from './useLibraryStore'
import { mergeLibraries, type LibraryBackup } from '../lib/librarySync'
import * as drive from '../lib/googleDrive'

/** Snapshot the local library as a backup payload. */
function localBackup(): LibraryBackup {
  const { characters, sessions, lastModified } = useLibraryStore.getState()
  return { characters, sessions, lastModified }
}

/** Converge local state onto a merged backup, re-merging with whatever the
 * local store holds now so edits made during the network round-trip survive. */
function applyMerged(merged: LibraryBackup): void {
  const final = mergeLibraries(merged, localBackup())
  useLibraryStore.setState({
    characters: final.characters,
    sessions: final.sessions,
    lastModified: final.lastModified,
  })
}

type SyncStatus = 'idle' | 'connecting' | 'syncing' | 'error'

interface DriveState {
  connected: boolean
  email: string | null
  name: string | null
  lastSyncedAt: number | null
  status: SyncStatus
  error: string | null
  connect: () => void
  disconnect: () => void
  pushToCloud: () => Promise<void>
  pullFromCloud: () => Promise<void>
  syncWithCloud: () => Promise<void>
}

export const useDriveStore = create<DriveState>()(
  persist(
    (set) => ({
      connected: false,
      email: null,
      name: null,
      lastSyncedAt: null,
      status: 'idle',
      error: null,

      connect: () => {
        set({ status: 'connecting', error: null })
        drive.connect()
      },

      disconnect: () => {
        drive.disconnect()
        set({ connected: false, email: null, name: null, status: 'idle', error: null })
      },

      // Additive sync to the cloud: merges local into the remote backup and
      // uploads the union, then converges local onto the merged result. Never
      // drops characters in either direction — only tombstoned removals delete.
      pushToCloud: async () => {
        set({ status: 'syncing', error: null })
        try {
          const merged = await drive.pushLibrary(localBackup())
          applyMerged(merged)
          set({ status: 'idle', lastSyncedAt: Date.now() })
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      },

      // Additive restore from the cloud: merges the remote backup into local
      // (adding cloud characters, applying tombstones) without dropping local
      // characters the cloud hasn't seen.
      pullFromCloud: async () => {
        set({ status: 'syncing', error: null })
        try {
          const remote = await drive.pullLibrary()
          if (!remote) {
            set({ status: 'error', error: '云端还没有备份数据' })
            return
          }
          applyMerged(remote)
          set({ status: 'idle', lastSyncedAt: Date.now() })
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      },

      // Background / on-connect sync — explicitly pull first, then push, so
      // local picks up remote data even if the upload later fails. Both steps
      // are additive merges, so nothing is ever dropped in either direction.
      syncWithCloud: async () => {
        set({ status: 'syncing', error: null })
        try {
          const remote = await drive.pullLibrary()
          if (remote) applyMerged(remote)
          const merged = await drive.pushLibrary(localBackup())
          applyMerged(merged)
          set({ status: 'idle', lastSyncedAt: Date.now() })
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
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
      }),
    },
  ),
)
