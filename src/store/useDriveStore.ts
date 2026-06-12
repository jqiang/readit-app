import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useLibraryStore } from './useLibraryStore'
import * as drive from '../lib/googleDrive'

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

      pushToCloud: async () => {
        set({ status: 'syncing', error: null })
        try {
          const { characters, sessions, lastModified } = useLibraryStore.getState()
          const result = await drive.pushLibrary({ characters, sessions, lastModified })
          if (result.status === 'skipped-stale') {
            set({
              status: 'error',
              error: `云端备份比本地数据更新（云端：${new Date(result.remoteLastModified).toLocaleString('zh-CN')}），已跳过推送。请先从云端恢复，避免覆盖较新的数据。`,
            })
            return
          }
          set({ status: 'idle', lastSyncedAt: Date.now() })
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      },

      pullFromCloud: async () => {
        set({ status: 'syncing', error: null })
        try {
          const data = await drive.pullLibrary()
          if (!data) {
            set({ status: 'error', error: '云端还没有备份数据' })
            return
          }
          const localLastModified = useLibraryStore.getState().lastModified
          if (localLastModified > (data.lastModified ?? 0)) {
            set({
              status: 'error',
              error: `本地数据比云端备份更新（本地：${new Date(localLastModified).toLocaleString('zh-CN')}），已取消恢复，避免覆盖较新的本地数据。如需强制恢复旧版本，请先推送本地数据或重置本地数据。`,
            })
            return
          }
          useLibraryStore.setState({
            characters: data.characters ?? {},
            sessions: data.sessions ?? [],
            lastModified: data.lastModified ?? Date.now(),
          })
          set({ status: 'idle', lastSyncedAt: Date.now() })
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      },

      // Periodic background sync: pull in any newer data from another device
      // first, then push the (possibly merged) local state back to the cloud.
      syncWithCloud: async () => {
        set({ status: 'syncing', error: null })
        try {
          const remote = await drive.pullLibrary()
          if (remote) {
            const localLastModified = useLibraryStore.getState().lastModified
            if ((remote.lastModified ?? 0) > localLastModified) {
              useLibraryStore.setState({
                characters: remote.characters ?? {},
                sessions: remote.sessions ?? [],
                lastModified: remote.lastModified ?? Date.now(),
              })
            }
          }
          const { characters, sessions, lastModified } = useLibraryStore.getState()
          await drive.pushLibrary({ characters, sessions, lastModified })
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
