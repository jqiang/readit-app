// Pinyin-practice progress (`readit-pinyin`). This store is **local-only**:
// unlike `readit-library`, it has no Google Drive backup/sync path — see
// `lib/librarySync.ts`'s `mergeLibraries()`, which only ever carries
// `readit-library`'s `characters`/`sessions`. If a Drive-backed version is
// wanted later, that needs its own `PinyinBackup` type/merge function and
// appData file (see the plan), not an extension of this store.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConfusionStat, PinyinCharStat, PinyinMistake, PinyinMode } from '../types'
import { applyAnswer, bumpConfusion } from '../lib/pinyinPractice'

interface PinyinState {
  charStats: Record<string, PinyinCharStat>
  confusions: Record<string, ConfusionStat>
  bests: Partial<Record<PinyinMode, number>>
  /** Record the outcome of one character's pinyin answer. Never touches
   * `useLibraryStore` — pinyin practice has its own, separate mistake memory. */
  recordAnswer: (char: string, correct: boolean, mistakes: PinyinMistake[], now?: number) => void
  /** Record a mode's score if it beats the stored best. Returns true if it's a new best. */
  recordBest: (mode: PinyinMode, score: number) => boolean
  resetAll: () => void
}

export const usePinyinStore = create<PinyinState>()(
  persist(
    (set, get) => ({
      charStats: {},
      confusions: {},
      bests: {},

      recordAnswer: (char, correct, mistakes, now = Date.now()) => {
        const charStats = { ...get().charStats }
        charStats[char] = applyAnswer(charStats[char], correct, now)

        const confusions = { ...get().confusions }
        for (const { kind, key } of mistakes) {
          const confKey = `${kind}:${key}`
          confusions[confKey] = bumpConfusion(confusions[confKey], now)
        }

        set({ charStats, confusions })
      },

      recordBest: (mode, score) => {
        const best = get().bests[mode]
        if (best !== undefined && score <= best) return false
        set({ bests: { ...get().bests, [mode]: score } })
        return true
      },

      resetAll: () => set({ charStats: {}, confusions: {}, bests: {} }),
    }),
    {
      name: 'readit-pinyin',
      partialize: ({ charStats, confusions, bests }) => ({ charStats, confusions, bests }),
    },
  ),
)
