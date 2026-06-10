import { useEffect } from 'react'
import { useDriveStore } from '../store/useDriveStore'

const BACKUP_INTERVAL_MS = 60_000

/** While connected to Drive, periodically push the local library to the
 * cloud backup — a safety net in case local browser storage is lost. */
export function useLibraryBackup() {
  const connected = useDriveStore((s) => s.connected)

  useEffect(() => {
    if (!connected) return
    const push = () => void useDriveStore.getState().pushToCloud()
    push()
    const interval = setInterval(push, BACKUP_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [connected])
}
