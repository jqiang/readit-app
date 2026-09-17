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

export type PinyinMode = 'free' | 'sprint' | 'survival' | 'space'

export interface PinyinCharStat {
  attempts: number
  wrong: number
  /** Decayed running score of how often/recently this character was missed. */
  wrongScore: number
  updatedAt: number
  lastSeen: number
  lastWrong?: number
}

export interface ConfusionStat {
  score: number
  updatedAt: number
}

export type PinyinMistake = { kind: 'initial' | 'medial' | 'final' | 'tone'; key: string }

export type CoinReason = 'pinyin' | 'review' | 'reading' | 'adjust'

export interface CoinEntry {
  id: string
  /** Signed: positive earned, negative redeemed, never 0. */
  amount: number
  reason: CoinReason
  date: number
  /** Local YYYY-MM-DD, frozen at creation — the daily-bucket identity. Stored
   * rather than derived so the guard cannot shift if the device timezone
   * changes, and because the deterministic reading id is built from it. */
  day: string
  /** reading: book id · pinyin: mode */
  refId?: string
  /** Parent's note on a manual adjustment. */
  note?: string
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
