import { useEffect, useRef } from 'react'

const TICK_MS = 50

/**
 * Ticks `onTick(dtMs)` roughly every 50ms while `running` is true. `onTick`
 * is stashed in a ref (updated on every render) so callers don't need to
 * memoize it — a fresh closure each render is fine.
 *
 * Pauses while the tab is hidden (`document.hidden`, tracked via the
 * `visibilitychange` event) and, on becoming visible again, does not hand
 * the hidden duration to `onTick` as a catch-up delta: the elapsed-time
 * clock is resynced to "now" both on the visibility event and on every
 * interval fire while hidden, so the first tick after resuming reports a
 * normal ~50ms delta, not the whole time the tab was backgrounded.
 */
export function useTicker(running: boolean, onTick: (dtMs: number) => void): void {
  const onTickRef = useRef(onTick)
  useEffect(() => {
    onTickRef.current = onTick
  })

  useEffect(() => {
    if (!running) return

    let lastTs = performance.now()

    const resync = () => {
      lastTs = performance.now()
    }
    document.addEventListener('visibilitychange', resync)

    const id = window.setInterval(() => {
      if (document.hidden) {
        resync()
        return
      }
      const now = performance.now()
      const dt = now - lastTs
      lastTs = now
      onTickRef.current(dt)
    }, TICK_MS)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [running])
}
