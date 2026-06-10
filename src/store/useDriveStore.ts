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
  connect: () => Promise<void>
  disconnect: () => void
  pushToCloud: () => Promise<void>
  pullFromCloud: () => Promise<void>
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

      connect: async () => {
        set({ status: 'connecting', error: null })
        try {
          const { email, name } = await drive.connect()
          set({ connected: true, email, name, status: 'idle' })
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      },

      disconnect: () => {
        drive.disconnect()
        set({ connected: false, email: null, name: null, status: 'idle', error: null })
      },

      pushToCloud: async () => {
        set({ status: 'syncing', error: null })
        try {
          const { characters, sessions } = useLibraryStore.getState()
          await drive.pushLibrary({ characters, sessions })
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
          useLibraryStore.setState({
            characters: data.characters ?? {},
            sessions: data.sessions ?? [],
          })
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
