import { useCallback, useEffect, useRef, useState } from 'react'
import type { Answer, Reading } from '../../lib/pinyinPractice'
import { EMPTY_ANSWER, FEEDBACK_MS, checkAnswer, classifyMistakes } from '../../lib/pinyinPractice'
import { speak } from '../../lib/speech'
import type { PinyinMistake } from '../../types'
import type { RoundResult } from './types'

const MAX_FINALS = 3

export type ComposerPhase = 'input' | 'correct' | 'wrong'

export type TapPiece =
  | { kind: 'initial'; value: string }
  | { kind: 'final'; value: string }
  | { kind: 'tone'; value: number }

export interface UseAnswerComposerOptions {
  char: string | null
  onResult: (result: RoundResult) => void
}

export interface AnswerComposerApi {
  answer: Answer
  phase: ComposerPhase
  /** The closest reading, shown as feedback once a wrong answer is submitted. */
  revealed: Reading | null
  /** Tone tiles are disabled until at least one final has been tapped, so a
   * tone tap (which auto-submits) can never fire on an empty answer. */
  canTone: boolean
  tap: (piece: TapPiece) => void
  /** Remove the slot at `index`, where slot 0 is the initial (if any) and the
   * rest are finals in order; the trailing tone slot is never removable. */
  removeAt: (index: number) => void
  backspace: () => void
}

export function useAnswerComposer({ char, onResult }: UseAnswerComposerOptions): AnswerComposerApi {
  const [answer, setAnswer] = useState<Answer>(EMPTY_ANSWER)
  const [phase, setPhase] = useState<ComposerPhase>('input')
  const [revealed, setRevealed] = useState<Reading | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const [prevChar, setPrevChar] = useState(char)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  // Reset whenever the active character changes (new char in the queue).
  // Adjusting state during render (instead of in an effect) avoids an extra
  // render and the set-state-in-effect anti-pattern — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (char !== prevChar) {
    setPrevChar(char)
    setAnswer(EMPTY_ANSWER)
    setPhase('input')
    setRevealed(null)
  }

  // Refs aren't render state, so the pending feedback timer (if any) is
  // cleared in an effect instead: on every char change (before the next
  // char's effect runs) and on unmount.
  useEffect(() => () => clearTimer(), [char, clearTimer])

  const submit = useCallback(
    (finalAnswer: Answer) => {
      if (!char) return
      const { correct, matched, closest } = checkAnswer(char, finalAnswer)
      const mistakes: PinyinMistake[] = matched ? [] : classifyMistakes(closest, finalAnswer)
      speak(char)
      setPhase(correct ? 'correct' : 'wrong')
      setRevealed(closest)
      onResult({ char, correct, mistakes, closest })
      clearTimer()
      timerRef.current = window.setTimeout(
        () => {
          setAnswer(EMPTY_ANSWER)
          setPhase('input')
          setRevealed(null)
        },
        correct ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong,
      )
    },
    [char, onResult, clearTimer],
  )

  const tap = useCallback(
    (piece: TapPiece) => {
      if (phase !== 'input') return
      if (piece.kind === 'initial') {
        setAnswer((a) => ({ ...a, initial: piece.value }))
        return
      }
      if (piece.kind === 'final') {
        setAnswer((a) =>
          a.finals.length >= MAX_FINALS ? a : { ...a, finals: [...a.finals, piece.value] },
        )
        return
      }
      // Tone tiles auto-submit; canTone already guarantees >=1 final.
      const next: Answer = { ...answer, tone: piece.value }
      setAnswer(next)
      submit(next)
    },
    [phase, answer, submit],
  )

  const removeAt = useCallback((index: number) => {
    setAnswer((a) => {
      if (a.initial !== null && index === 0) return { ...a, initial: null }
      const finalIndex = a.initial !== null ? index - 1 : index
      return { ...a, finals: a.finals.filter((_, i) => i !== finalIndex) }
    })
  }, [])

  const backspace = useCallback(() => {
    setAnswer((a) => {
      if (a.finals.length > 0) return { ...a, finals: a.finals.slice(0, -1) }
      if (a.initial !== null) return { ...a, initial: null }
      return a
    })
  }, [])

  return {
    answer,
    phase,
    revealed,
    canTone: answer.finals.length > 0,
    tap,
    removeAt,
    backspace,
  }
}
