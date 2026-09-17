import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoundStats } from './useRoundStats'
import { useTicker } from './useTicker'
import { usePinyinStore } from '../../store/usePinyinStore'
import { EMPTY_ANSWER, FEEDBACK_MS, checkAnswer, charWeight, pickNext } from '../../lib/pinyinPractice'
import { speak } from '../../lib/speech'
import type { RoundApi, RoundResult, RoundStatus } from './types'

/** 🚀 太空射击: characters fall from the top of the arena as "invaders"; the
 * player types the pinyin of the one closest to the bottom (the "target")
 * before it reaches the ground. */

export const SPACE_LIVES = 3
export const SPACE_MAX_INVADERS = 4
export const SPACE_LANES = 5
/** Fall speed, in screen-heights per second, at score 0. */
export const SPACE_FALL_BASE = 0.03
/** Extra fall speed (per second) added for every point scored. */
export const SPACE_FALL_PER_SCORE = 0.004
export const SPACE_SPAWN_BASE_MS = 6000
/** How much faster (ms) spawns get for every point scored. */
export const SPACE_SPAWN_DECAY_PER_SCORE = 250
export const SPACE_SPAWN_MIN_MS = 2500
/** How far a wrong answer pushes its target down (0..1 scale). */
export const SPACE_WRONG_PUSH = 0.1
export const SPACE_EXPLODE_MS = 400

export interface Invader {
  id: number
  char: string
  /** 0 (top) .. 1 (ground) */
  y: number
  /** 0..SPACE_LANES-1 */
  lane: number
  /** Set once the player has answered this invader correctly; it freezes in
   * place for SPACE_EXPLODE_MS while its explosion animation plays, then is
   * removed. */
  exploding?: boolean
}

export interface SpaceRoundApi extends RoundApi {
  invaders: Invader[]
}

function pickTarget(invaders: Invader[]): Invader | null {
  let target: Invader | null = null
  for (const inv of invaders) {
    if (inv.exploding) continue
    if (target === null || inv.y > target.y) target = inv
  }
  return target
}

export function useSpaceMode(pool: string[]): SpaceRoundApi {
  const stats = useRoundStats()
  const recordBest = usePinyinStore((s) => s.recordBest)
  const best = usePinyinStore((s) => s.bests.space)

  const [invaders, setInvaders] = useState<Invader[]>([])
  const [lives, setLives] = useState(SPACE_LIVES)
  const [paused, setPaused] = useState(false)
  const [isNewBest, setIsNewBest] = useState(false)
  const finishedRef = useRef(false)
  const idRef = useRef(0)
  const spawnAccumRef = useRef(0)
  const explodeTimersRef = useRef<Set<number>>(new Set())
  // Held as the composer's `char` for the same FEEDBACK_MS window
  // useAnswerComposer itself uses before resetting, so a correct answer's
  // target (marked `exploding` and dropped from pickTarget immediately, for
  // the explosion animation) doesn't swap the composer's `char` prop out
  // from under its own 'correct'/'wrong' feedback mid-render — the same
  // hazard useFreeMode/useSurvivalMode's deferred queue.advance() avoids for
  // their own `char`. Null once the window elapses, at which point the live
  // target (if any) takes over again below.
  const feedbackTimerRef = useRef<number | undefined>(undefined)
  const [frozenChar, setFrozenChar] = useState<string | null>(null)

  const status: RoundStatus = lives <= 0 ? 'over' : 'playing'

  const spawnInvader = useCallback(() => {
    setInvaders((prev) => {
      if (prev.length >= SPACE_MAX_INVADERS) return prev
      // Never spawn a char already on screen (exploding ones included, since
      // they still occupy the board until their timer removes them).
      const onScreen = new Set(prev.map((inv) => inv.char))
      let avail = pool.filter((c) => !onScreen.has(c))
      if (avail.length === 0) avail = pool
      const { charStats, confusions } = usePinyinStore.getState()
      const now = Date.now()
      const weights = avail.map((c) => charWeight(c, charStats, confusions, now))
      const char = pickNext(avail, weights, Math.random)

      const usedLanes = new Set(prev.map((inv) => inv.lane))
      const freeLanes: number[] = []
      for (let lane = 0; lane < SPACE_LANES; lane++) {
        if (!usedLanes.has(lane)) freeLanes.push(lane)
      }
      const laneChoices =
        freeLanes.length > 0 ? freeLanes : Array.from({ length: SPACE_LANES }, (_, i) => i)
      const lane = laneChoices[Math.floor(Math.random() * laneChoices.length)]

      return [...prev, { id: idRef.current++, char, y: 0, lane }]
    })
  }, [pool])

  // Spawn the first invader as soon as a round starts.
  useEffect(() => {
    spawnInvader()
  }, [spawnInvader])

  // Clear any pending explosion-removal timers on unmount.
  useEffect(() => {
    const timers = explodeTimersRef.current
    return () => {
      for (const t of timers) window.clearTimeout(t)
      timers.clear()
    }
  }, [])

  // Clear the pending feedback-hold timer on unmount.
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  useTicker(status === 'playing' && !paused, (dt) => {
    const fallSpeed = SPACE_FALL_BASE + SPACE_FALL_PER_SCORE * stats.score
    const dySec = dt / 1000

    if (invaders.length > 0) {
      const survivors: Invader[] = []
      const missed: Invader[] = []
      for (const inv of invaders) {
        if (inv.exploding) {
          survivors.push(inv)
          continue
        }
        const y = inv.y + fallSpeed * dySec
        if (y >= 1) missed.push(inv)
        else survivors.push({ ...inv, y })
      }
      setInvaders(survivors)

      if (missed.length > 0) {
        setLives((l) => Math.max(0, l - missed.length))
        for (const inv of missed) {
          const { closest } = checkAnswer(inv.char, EMPTY_ANSWER)
          stats.record({ char: inv.char, correct: false, mistakes: [], closest })
          speak(inv.char)
        }
      }
    }

    spawnAccumRef.current += dt
    const spawnEvery = Math.max(
      SPACE_SPAWN_MIN_MS,
      SPACE_SPAWN_BASE_MS - SPACE_SPAWN_DECAY_PER_SCORE * stats.score,
    )
    if (spawnAccumRef.current >= spawnEvery) {
      spawnAccumRef.current = 0
      spawnInvader()
    }
  })

  // Record the best score exactly once, the moment the last life is lost.
  useEffect(() => {
    if (status !== 'over' || finishedRef.current) return
    finishedRef.current = true
    setIsNewBest(recordBest('space', stats.score))
  }, [status, recordBest, stats.score])

  const onResult = useCallback(
    (result: RoundResult) => {
      stats.record(result)

      setFrozenChar(result.char)
      if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = window.setTimeout(
        () => {
          feedbackTimerRef.current = undefined
          setFrozenChar(null)
        },
        result.correct ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong,
      )

      if (result.correct) {
        setInvaders((prev) =>
          prev.map((inv) => (inv.char === result.char ? { ...inv, exploding: true } : inv)),
        )
        const timerId = window.setTimeout(() => {
          setInvaders((prev) => prev.filter((inv) => inv.char !== result.char))
          explodeTimersRef.current.delete(timerId)
        }, SPACE_EXPLODE_MS)
        explodeTimersRef.current.add(timerId)
      } else {
        setInvaders((prev) =>
          prev.map((inv) =>
            inv.char === result.char ? { ...inv, y: inv.y + SPACE_WRONG_PUSH } : inv,
          ),
        )
      }
    },
    [stats],
  )

  const restart = useCallback(() => {
    for (const t of explodeTimersRef.current) window.clearTimeout(t)
    explodeTimersRef.current.clear()
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = undefined
    setFrozenChar(null)
    spawnAccumRef.current = 0
    stats.reset()
    setLives(SPACE_LIVES)
    setPaused(false)
    setIsNewBest(false)
    finishedRef.current = false
    setInvaders([])
    spawnInvader()
  }, [stats, spawnInvader])

  const togglePause = useCallback(() => setPaused((p) => !p), [])

  const target = pickTarget(invaders)
  const displayChar = frozenChar ?? target?.char ?? null

  return {
    status,
    char: displayChar,
    hud: {
      score: stats.score,
      streak: stats.streak,
      lives,
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
    invaders,
  }
}
