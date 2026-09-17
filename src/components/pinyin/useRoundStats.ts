import { useCallback, useState } from 'react'
import { usePinyinStore } from '../../store/usePinyinStore'
import type { MissedChar, RoundResult } from './types'

export interface RoundStatsApi {
  score: number
  streak: number
  correct: number
  wrong: number
  missed: MissedChar[]
  /** Score one answer. This is the single call site of recordAnswer, so
   * pinyin practice results always end up in usePinyinStore and never touch
   * useLibraryStore. */
  record: (result: RoundResult) => void
  reset: () => void
}

interface StatsState {
  score: number
  streak: number
  correct: number
  wrong: number
  missed: MissedChar[]
}

const INITIAL_STATE: StatsState = { score: 0, streak: 0, correct: 0, wrong: 0, missed: [] }

export function useRoundStats(): RoundStatsApi {
  const recordAnswer = usePinyinStore((s) => s.recordAnswer)
  const [state, setState] = useState<StatsState>(INITIAL_STATE)

  const record = useCallback(
    (result: RoundResult) => {
      recordAnswer(result.char, result.correct, result.mistakes)
      setState((prev) => {
        if (result.correct) {
          return {
            ...prev,
            score: prev.score + 1,
            streak: prev.streak + 1,
            correct: prev.correct + 1,
          }
        }
        const missedChar = { char: result.char, pinyin: result.closest.display }
        const already = prev.missed.some((m) => m.char === result.char)
        const missed = already
          ? prev.missed.map((m) => (m.char === result.char ? missedChar : m))
          : [...prev.missed, missedChar]
        return { ...prev, streak: 0, wrong: prev.wrong + 1, missed }
      })
    },
    [recordAnswer],
  )

  const reset = useCallback(() => setState(INITIAL_STATE), [])

  return { ...state, record, reset }
}
