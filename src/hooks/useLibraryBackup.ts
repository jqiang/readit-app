import { useEffect } from 'react'
import { useDriveStore } from '../store/useDriveStore'

const SYNC_INTERVAL_MS = 60_000

/** While connected to Drive, periodically pull any newer data from the cloud
 * backup (e.g. synced from another device) and then push the local library
 * back up — keeping local storage and the cloud backup in sync. */
export function useLibraryBackup() {
  const connected = useDriveStore((s) => s.connected)

  useEffect(() => {
    if (!connected) return
    const sync = () => void useDriveStore.getState().syncWithCloud()
    sync()
    const interval = setInterval(sync, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [connected])
}
