import { useEffect } from 'react'
import { useDriveStore } from '../store/useDriveStore'
import { handleOAuthRedirect } from '../lib/googleDrive'

/**
 * Runs once on app load. If the URL has `?code=...`/`?error=...` (we just
 * came back from Google's consent screen via `connect()`'s full-page
 * redirect), exchanges the code for tokens and updates `useDriveStore`.
 *
 * Every reconnect in this app goes through this same full-page redirect —
 * including reconnecting after `needsReconnect` was set — so this is the one
 * place a freshly-established/re-established connection is detected. On
 * success we immediately kick off `syncWithCloud()` (which pulls before it
 * pushes) instead of waiting for `useLibraryBackup`'s periodic tick, so a
 * reconnect never leaves local storage sitting on stale data: the very next
 * thing that happens is picking up whatever changed in the cloud while this
 * device was disconnected.
 */
export function useGoogleOAuthRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('code') && !params.has('error')) return

    useDriveStore.setState({ status: 'connecting', error: null })
    void (async () => {
      try {
        const user = await handleOAuthRedirect()
        if (user) {
          useDriveStore.setState({
            connected: true,
            email: user.email,
            name: user.name,
            status: 'idle',
            error: null,
            needsReconnect: false,
          })
          void useDriveStore.getState().syncWithCloud()
        } else {
          useDriveStore.setState({ status: 'idle' })
        }
      } catch (err) {
        useDriveStore.setState({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()
  }, [])
}
