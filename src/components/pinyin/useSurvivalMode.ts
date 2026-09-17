import { useCallback, useEffect, useRef, useState } from 'react'
import { useCharQueue } from './useCharQueue'
import { useRoundStats } from './useRoundStats'
import { useTicker } from './useTicker'
import { usePinyinStore } from '../../store/usePinyinStore'
import { FEEDBACK_MS } from '../../lib/pinyinPractice'
import type { RoundApi, RoundResult, RoundStatus } from './types'

/** ❤️ 生存模式: an energy bar that drains over time, drained faster the more
 * correct answers pile up in the round (not reset by a wrong answer),
 * replenished by correct answers and cut by wrong ones. Round ends when
 * energy hits 0. */
export const ENERGY_MAX = 100
/** Energy drained per second at the very start of a round (100 → 0 in 50 s; a
 * correct answer then buys ~20 s, shrinking to ~8 s once the drain hits its cap). */
export const DRAIN_START = 2
/** Extra energy/sec added to the drain rate for every correct answer so far. */
export const DRAIN_RAMP = 0.05
/** Ceiling on the drain rate, however many correct answers have piled up. */
export const DRAIN_CAP = 5
export const CORRECT_ENERGY_GAIN = 40
export const WRONG_ENERGY_LOSS = 15

export function useSurvivalMode(pool: string[]): RoundApi {
  const queue = useCharQueue(pool)
  const stats = useRoundStats()
  const recordBest = usePinyinStore((s) => s.recordBest)
  const best = usePinyinStore((s) => s.bests.survival)

  const [energy, setEnergy] = useState(ENERGY_MAX)
  const [paused, setPaused] = useState(false)
  const [isNewBest, setIsNewBest] = useState(false)
  const finishedRef = useRef(false)
  const advanceTimerRef = useRef<number | undefined>(undefined)

  const status: RoundStatus = energy <= 0 ? 'over' : 'playing'

  useTicker(status === 'playing' && !paused, (dt) => {
    const drainPerSec = Math.min(DRAIN_START + DRAIN_RAMP * stats.correct, DRAIN_CAP)
    setEnergy((e) => Math.max(0, e - (drainPerSec * dt) / 1000))
  })

  // Record the best score exactly once, the moment energy hits 0.
  useEffect(() => {
    if (status !== 'over' || finishedRef.current) return
    finishedRef.current = true
    setIsNewBest(recordBest('survival', stats.score))
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
      // Recorded synchronously, so a last-second answer still counts before
      // status can flip to 'over'.
      stats.record(result)
      setEnergy((e) =>
        result.correct
          ? Math.min(ENERGY_MAX, e + CORRECT_ENERGY_GAIN)
          : Math.max(0, e - WRONG_ENERGY_LOSS),
      )
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
    setEnergy(ENERGY_MAX)
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
      energy,
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
