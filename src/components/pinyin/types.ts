// Shared "round" contract implemented by each mode hook (useFreeMode now;
// useSprintMode / useSurvivalMode / useSpaceMode in later phases). The
// PinyinPractice page only ever talks to this shape, so a new mode is just a
// new hook that returns one.
import type { PinyinMistake } from '../../types'
import type { Reading } from '../../lib/pinyinPractice'

/** The outcome of a single character's answer, as produced by useAnswerComposer. */
export interface RoundResult {
  char: string
  correct: boolean
  mistakes: PinyinMistake[]
  closest: Reading
}

export interface MissedChar {
  char: string
  /** What the wrong-feedback revealed (checkAnswer's `closest.display`). */
  pinyin: string
}

export interface RoundHud {
  score: number
  streak: number
  /** e.g. "3/10" for a fixed-length round. */
  progress?: { current: number; total: number }
  timeLeftMs?: number
  /** 0–1 fraction of the round's duration left, driving the countdown bar.
   * Only meaningful alongside `timeLeftMs`. */
  timeFrac?: number
  energy?: number
  lives?: number
  best?: number
}

export interface RoundSummaryData {
  correct: number
  wrong: number
  missed: MissedChar[]
  score: number
  isNewBest: boolean
}

export type RoundStatus = 'playing' | 'over'

export interface RoundApi {
  status: RoundStatus
  char: string | null
  hud: RoundHud
  onResult: (result: RoundResult) => void
  summary: RoundSummaryData
  restart: () => void
  /** Timed modes only (sprint/survival): whether the round's clock is
   * currently paused, and a toggle for it. Undefined for untimed modes
   * (free), which have nothing to pause. */
  paused?: boolean
  togglePause?: () => void
}
