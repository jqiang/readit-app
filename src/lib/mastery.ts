import type { CharacterStats, Mastery } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Days until next review, indexed by Leitner box (1-6). */
const BOX_INTERVAL_DAYS: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 4,
  5: 7,
  6: 14,
}

export const MAX_BOX = 6

export function newCharacterStats(char: string, now: number): CharacterStats {
  return {
    char,
    correctCount: 0,
    wrongCount: 0,
    box: 1,
    lastSeen: now,
    nextReview: now,
  }
}

/** Apply the result of a single read/review attempt and return updated stats. */
export function applyAttempt(
  stats: CharacterStats,
  correct: boolean,
  now: number,
): CharacterStats {
  const box = correct ? Math.min(stats.box + 1, MAX_BOX) : 1
  return {
    ...stats,
    correctCount: stats.correctCount + (correct ? 1 : 0),
    wrongCount: stats.wrongCount + (correct ? 0 : 1),
    box,
    lastSeen: now,
    nextReview: now + BOX_INTERVAL_DAYS[box] * DAY_MS,
  }
}

export function getMastery(stats: CharacterStats): Mastery {
  if (stats.box <= 2) return 'learning'
  if (stats.box <= 4) return 'familiar'
  return 'mastered'
}

export const MASTERY_LABELS: Record<Mastery, string> = {
  new: '未学过',
  learning: '学习中',
  familiar: '较熟悉',
  mastered: '已掌握',
}

export const MASTERY_COLORS: Record<Mastery, string> = {
  new: 'bg-slate-200 text-slate-600',
  learning: 'bg-rose-100 text-rose-700',
  familiar: 'bg-amber-100 text-amber-700',
  mastered: 'bg-emerald-100 text-emerald-700',
}
