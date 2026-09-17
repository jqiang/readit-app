import { useCallback, useEffect, useRef } from 'react'
import { useCharQueue } from './useCharQueue'
import { useRoundStats } from './useRoundStats'
import { FEEDBACK_MS } from '../../lib/pinyinPractice'
import type { RoundApi, RoundResult } from './types'

/** 自由练习: a fixed queue of this many distinct chars; the round ends when
 * every one of them has been answered correctly at least once. */
export const FREE_QUEUE_SIZE = 10

export function useFreeMode(pool: string[]): RoundApi {
  const size = Math.min(FREE_QUEUE_SIZE, pool.length)
  const queue = useCharQueue(pool, { size })
  const stats = useRoundStats()
  const advanceTimerRef = useRef<number | undefined>(undefined)

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== undefined) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = undefined
    }
  }, [])

  // Cancel a pending advance on unmount (e.g. the mode is switched away
  // from mid-feedback), so it can't fire against a stale queue.
  useEffect(() => clearAdvanceTimer, [clearAdvanceTimer])

  const onResult = useCallback(
    (result: RoundResult) => {
      // Recorded immediately: mistake memory shouldn't wait on the UI.
      stats.record(result)
      // The visible character only advances once the correct/wrong feedback
      // has had its moment on screen — on the same delay useAnswerComposer
      // uses to reset itself, so both land in the same tick and the queue
      // never swaps the character out from under the feedback UI.
      clearAdvanceTimer()
      advanceTimerRef.current = window.setTimeout(
        () => queue.advance(result.correct),
        result.correct ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong,
      )
    },
    [stats, queue, clearAdvanceTimer],
  )

  const restart = useCallback(() => {
    clearAdvanceTimer()
    stats.reset()
    queue.rebuild()
  }, [stats, queue, clearAdvanceTimer])

  return {
    status: queue.current === null ? 'over' : 'playing',
    char: queue.current,
    hud: {
      score: stats.score,
      streak: stats.streak,
      progress: queue.total !== null ? { current: stats.correct, total: queue.total } : undefined,
    },
    onResult,
    summary: {
      correct: stats.correct,
      wrong: stats.wrong,
      missed: stats.missed,
      score: stats.score,
      // Free mode has no best score of its own (only sprint/survival/space do).
      isNewBest: false,
    },
    restart,
  }
}
