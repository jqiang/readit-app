import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CharacterStats, CharResult, Mastery, ReadingSession } from '../types'
import { applyAttempt, newCharacterStats, setMastery } from '../lib/mastery'

interface LibraryState {
  characters: Record<string, CharacterStats>
  sessions: ReadingSession[]
  /** Epoch ms of the last local mutation; 0 if never modified. Used to avoid
   * clobbering newer Drive backups with stale/empty local data. */
  lastModified: number
  /** Record the outcome of a full reading-practice session. */
  recordSession: (
    passageId: string,
    passageTitle: string,
    results: CharResult[],
  ) => void
  /** Record the outcome of a single flashcard review. */
  recordReview: (char: string, correct: boolean) => void
  /** Remove a character from the library entirely (e.g. it wasn't actually learned yet). */
  removeCharacter: (char: string) => void
  /** Manually set a character's mastery level (status) from the library. */
  setCharacterMastery: (char: string, mastery: Mastery) => void
  /** Manually register characters the child is already expected to know. Returns how many were newly added. */
  addKnownCharacters: (chars: string[]) => number
  resetAll: () => void
  seedDemoData: () => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      characters: {},
      sessions: [],
      lastModified: 0,

      recordSession: (passageId, passageTitle, results) => {
        const now = Date.now()
        const characters = { ...get().characters }
        const wrongChars: string[] = []
        const learnedChars: string[] = []
        const removedChars: string[] = []
        let correctChars = 0
        let totalChars = 0

        for (const { char, outcome } of results) {
          if (outcome === 'learn') {
            learnedChars.push(char)
            if (!characters[char]) {
              characters[char] = newCharacterStats(char, now)
            }
            continue
          }
          if (outcome === 'learnWrong') {
            learnedChars.push(char)
            wrongChars.push(char)
            const existing = characters[char] ?? newCharacterStats(char, now)
            characters[char] = applyAttempt(existing, false, now)
            continue
          }
          if (outcome === 'remove') {
            removedChars.push(char)
            delete characters[char]
            continue
          }
          totalChars++
          const correct = outcome === 'correct'
          const existing = characters[char] ?? newCharacterStats(char, now)
          characters[char] = applyAttempt(existing, correct, now)
          if (correct) correctChars++
          else wrongChars.push(char)
        }

        const session: ReadingSession = {
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          passageId,
          passageTitle,
          date: now,
          totalChars,
          correctChars,
          wrongChars,
          learnedChars,
          removedChars,
        }

        set({
          characters,
          sessions: [session, ...get().sessions].slice(0, 50),
          lastModified: now,
        })
      },

      recordReview: (char, correct) => {
        const now = Date.now()
        const characters = { ...get().characters }
        const existing = characters[char] ?? newCharacterStats(char, now)
        characters[char] = applyAttempt(existing, correct, now)
        set({ characters, lastModified: now })
      },

      removeCharacter: (char) => {
        const characters = { ...get().characters }
        delete characters[char]
        set({ characters, lastModified: Date.now() })
      },

      setCharacterMastery: (char, mastery) => {
        const existing = get().characters[char]
        if (!existing) return
        const now = Date.now()
        set({
          characters: { ...get().characters, [char]: setMastery(existing, mastery, now) },
          lastModified: now,
        })
      },

      addKnownCharacters: (chars) => {
        const now = Date.now()
        const characters = { ...get().characters }
        let added = 0
        for (const char of chars) {
          if (characters[char]) continue
          characters[char] = newCharacterStats(char, now)
          added++
        }
        if (added > 0) set({ characters, lastModified: now })
        return added
      },

      resetAll: () => set({ characters: {}, sessions: [], lastModified: Date.now() }),

      seedDemoData: () => {
        const now = Date.now()
        const day = 24 * 60 * 60 * 1000
        const demo: Array<[string, number, number, number]> = [
          // [char, correctCount, wrongCount, box]
          ['我', 8, 0, 6],
          ['家', 6, 1, 5],
          ['有', 7, 0, 6],
          ['小', 9, 0, 6],
          ['猫', 5, 1, 4],
          ['是', 6, 0, 5],
          ['它', 4, 1, 3],
          ['的', 9, 0, 6],
          ['白', 3, 2, 2],
          ['色', 2, 2, 1],
          ['喜', 3, 1, 3],
          ['欢', 2, 2, 1],
          ['睡', 1, 3, 1],
          ['觉', 1, 3, 1],
          ['玩', 4, 1, 4],
          ['球', 2, 2, 2],
          ['每', 3, 1, 3],
          ['天', 5, 0, 5],
          ['喂', 1, 2, 1],
          ['鱼', 4, 0, 4],
          ['下', 5, 1, 4],
          ['雨', 4, 1, 4],
          ['了', 7, 0, 6],
          ['伞', 1, 3, 1],
          ['彩', 1, 2, 1],
          ['虹', 1, 2, 1],
        ]

        const characters: Record<string, CharacterStats> = {}
        demo.forEach(([char, correctCount, wrongCount, box], i) => {
          characters[char] = {
            char,
            correctCount,
            wrongCount,
            box,
            lastSeen: now - i * 3 * 60 * 60 * 1000,
            nextReview: now - (box <= 2 ? day : -day),
          }
        })

        const sessions: ReadingSession[] = [
          {
            id: 'demo-1',
            passageId: 'my-cat',
            passageTitle: '我家的小猫',
            date: now - day,
            totalChars: 30,
            correctChars: 26,
            wrongChars: ['白', '色', '喜', '欢'],
            learnedChars: [],
            removedChars: [],
          },
          {
            id: 'demo-2',
            passageId: 'rainy-day',
            passageTitle: '下雨了',
            date: now - 2 * day,
            totalChars: 28,
            correctChars: 24,
            wrongChars: ['伞', '彩', '虹', '睡'],
            learnedChars: [],
            removedChars: [],
          },
        ]

        set({ characters, sessions, lastModified: now })
      },
    }),
    { name: 'readit-library' },
  ),
)
