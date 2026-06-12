import { useEffect } from 'react'
import { useDriveStore } from '../store/useDriveStore'
import { handleOAuthRedirect } from '../lib/googleDrive'

/**
 * Runs once on app load. If the URL has `?code=...`/`?error=...` (we just
 * came back from Google's consent screen via `connect()`'s full-page
 * redirect), exchanges the code for tokens and updates `useDriveStore`.
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
          })
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
