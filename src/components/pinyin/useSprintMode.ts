import { useCallback, useEffect, useRef, useState } from 'react'
import { useCharQueue } from './useCharQueue'
import { useRoundStats } from './useRoundStats'
import { useTicker } from './useTicker'
import { usePinyinStore } from '../../store/usePinyinStore'
import { FEEDBACK_MS } from '../../lib/pinyinPractice'
import type { RoundApi, RoundResult, RoundStatus } from './types'

/** ⏱ 两分钟冲刺: an infinite, weighted queue against a two-minute countdown. */
export const SPRINT_DURATION_MS = 120_000

export function useSprintMode(pool: string[]): RoundApi {
  const queue = useCharQueue(pool)
  const stats = useRoundStats()
  const recordBest = usePinyinStore((s) => s.recordBest)
  const best = usePinyinStore((s) => s.bests.sprint)

  const [timeLeftMs, setTimeLeftMs] = useState(SPRINT_DURATION_MS)
  const [paused, setPaused] = useState(false)
  const [isNewBest, setIsNewBest] = useState(false)
  const finishedRef = useRef(false)
  const advanceTimerRef = useRef<number | undefined>(undefined)

  const status: RoundStatus = timeLeftMs <= 0 ? 'over' : 'playing'

  useTicker(status === 'playing' && !paused, (dt) => {
    setTimeLeftMs((t) => Math.max(0, t - dt))
  })

  // Record the best score exactly once, the moment the clock runs out.
  useEffect(() => {
    if (status !== 'over' || finishedRef.current) return
    finishedRef.current = true
    setIsNewBest(recordBest('sprint', stats.score))
  }, [status, recordBest, stats.score])

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== undefined) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = undefined
    }
  }, [])

  useEffect(() => clearAdvanceTimer, [clearAdvanceTimer])

  const onResult = useCallback(
    (result: RoundResult) => {
      // Recorded synchronously, so an answer that lands right as the clock
      // hits zero still counts before status flips to 'over'.
      stats.record(result)
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
    setTimeLeftMs(SPRINT_DURATION_MS)
    setPaused(false)
    setIsNewBest(false)
    finishedRef.current = false
  }, [stats, queue, clearAdvanceTimer])

  const togglePause = useCallback(() => setPaused((p) => !p), [])

  return {
    status,
    char: status === 'over' ? null : queue.current,
    hud: {
      score: stats.score,
      streak: stats.streak,
      timeLeftMs,
      timeFrac: timeLeftMs / SPRINT_DURATION_MS,
      best,
    },
    onResult,
    summary: {
      correct: stats.correct,
      wrong: stats.wrong,
      missed: stats.missed,
      score: stats.score,
      isNewBest,
    },
    restart,
    paused,
    togglePause,
  }
}
