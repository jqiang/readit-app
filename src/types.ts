export type Mastery = 'new' | 'learning' | 'familiar' | 'mastered'

export interface CharacterStats {
  char: string
  correctCount: number
  wrongCount: number
  /** Leitner box, 1 (newest/weakest) through 6 (mastered) */
  box: number
  lastSeen: number
  nextReview: number
  /** True when the user marked this character as "not yet learned" / moved it
   * out of the active library. The character is kept (never deleted) so cloud
   * sync can never lose data — it's just hidden from the UI and review. */
  removed?: boolean
}

export type CharOutcome = 'correct' | 'wrong' | 'learn' | 'learnWrong' | 'remove'

export interface CharResult {
  char: string
  outcome: CharOutcome
}

export interface ReadingSession {
  id: string
  passageId: string
  passageTitle: string
  date: number
  /** Characters expected to be known (correct + wrong); excludes learned/removed vocabulary. */
  totalChars: number
  correctChars: number
  wrongChars: string[]
  /** Previously-unfamiliar characters the child read correctly and that were added to the library. */
  learnedChars: string[]
  /** Characters removed from the library because the child didn't actually know them. */
  removedChars: string[]
}
