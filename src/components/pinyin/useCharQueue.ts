import { useCallback, useRef, useState } from 'react'
import { usePinyinStore } from '../../store/usePinyinStore'
import { buildQueue, charWeight, pickNext } from '../../lib/pinyinPractice'

const MIN_BUFFER = 3
const INFINITE_INITIAL_SIZE = 5

export interface UseCharQueueOptions {
  /** Fixed queue length; the round ends when it empties (free mode). Omit
   * for an infinite, continuously topped-up queue (timed modes). */
  size?: number
  /** How many chars ahead a wrong answer gets re-queued. */
  requeueGap?: number
}

export interface CharQueueApi {
  current: string | null
  /** Chars left in the queue, current one included. */
  remaining: number
  /** Original queue size for a finite queue; null for an infinite one. */
  total: number | null
  isDone: boolean
  /** Advance past the current char; a wrong answer gets it re-queued `requeueGap` ahead. */
  advance: (correct: boolean) => void
  /** Rebuild the queue from a fresh store snapshot (used by a mode's restart()). */
  rebuild: () => void
}

function buildInitialQueue(pool: string[], size: number | undefined): string[] {
  const { charStats, confusions } = usePinyinStore.getState()
  const now = Date.now()
  const n = size ?? Math.min(pool.length, INFINITE_INITIAL_SIZE)
  return buildQueue(pool, n, charStats, confusions, now, Math.random)
}

/** A queue of characters to practice, weighted toward weak ones. Reads
 * usePinyinStore.getState() once when built (and again on rebuild()) so
 * weights stay stable for the rest of the round. */
export function useCharQueue(pool: string[], options: UseCharQueueOptions = {}): CharQueueApi {
  const { size, requeueGap = 3 } = options
  const snapshotRef = useRef(usePinyinStore.getState())
  const [queue, setQueue] = useState<string[]>(() => buildInitialQueue(pool, size))

  const rebuild = useCallback(() => {
    snapshotRef.current = usePinyinStore.getState()
    setQueue(buildInitialQueue(pool, size))
  }, [pool, size])

  const advance = useCallback(
    (correct: boolean) => {
      setQueue((prev) => {
        const [head, ...rest] = prev
        let next = rest
        if (!correct && head !== undefined) {
          const gap = Math.min(requeueGap, next.length)
          next = [...next.slice(0, gap), head, ...next.slice(gap)]
        }
        if (size === undefined && next.length < MIN_BUFFER && pool.length > 0) {
          const { charStats, confusions } = snapshotRef.current
          const now = Date.now()
          const weights = pool.map((c) => charWeight(c, charStats, confusions, now))
          const exclude = next[next.length - 1]
          next = [...next, pickNext(pool, weights, Math.random, exclude)]
        }
        return next
      })
    },
    [pool, requeueGap, size],
  )

  return {
    current: queue[0] ?? null,
    remaining: queue.length,
    total: size ?? null,
    isDone: size !== undefined && queue.length === 0,
    advance,
    rebuild,
  }
}
