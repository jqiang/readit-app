import type { CharOutcome, CharResult } from '../types'
import { isChineseChar } from './pinyin'

export type CharMark = 'unmarked' | 'wrong' | 'remove' | 'learned' | 'skip'

/** Initial marks for a passage: every Chinese character starts unmarked. */
export function initMarks(target: string): CharMark[] {
  return Array.from(target).map((c) => (isChineseChar(c) ? 'unmarked' : 'skip'))
}

/**
 * Cycle a character's mark. The available marks depend on whether the
 * character is already in the library (`isKnown`):
 * - Known:   unmarked (correct) -> wrong (misread) -> remove (shouldn't be known) -> unmarked
 * - Unknown: unmarked (not yet learned) -> learned (knows it, read correctly) ->
 *            wrong (knows it, but misread this time) -> unmarked
 */
export function cycleMark(mark: CharMark, isKnown: boolean): CharMark {
  if (mark === 'skip') return mark
  if (isKnown) {
    if (mark === 'unmarked') return 'wrong'
    if (mark === 'wrong') return 'remove'
    return 'unmarked'
  }
  if (mark === 'unmarked') return 'learned'
  if (mark === 'learned') return 'wrong'
  return 'unmarked'
}

/**
 * Per-character results, ready to feed into the library store.
 * - Known characters: unmarked counts as correct, 'wrong' as wrong, 'remove'
 *   removes the character from the library.
 * - Unknown characters: 'learned' adds to the library as a correct first
 *   read; 'wrong' also adds to the library but as a misread first attempt.
 *   unmarked stays out of the library entirely.
 */
export function getCharResults(
  marks: CharMark[],
  target: string,
  isKnown: (char: string) => boolean,
): CharResult[] {
  const targetChars = Array.from(target)
  const results: CharResult[] = []
  marks.forEach((mark, i) => {
    if (mark === 'skip') return
    const char = targetChars[i]
    if (isKnown(char)) {
      const outcome: CharOutcome =
        mark === 'wrong' ? 'wrong' : mark === 'remove' ? 'remove' : 'correct'
      results.push({ char, outcome })
    } else if (mark === 'learned') {
      results.push({ char, outcome: 'learn' })
    } else if (mark === 'wrong') {
      results.push({ char, outcome: 'learnWrong' })
    }
  })
  return results
}
