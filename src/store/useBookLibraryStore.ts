import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { downloadPassageText, listPassageFiles } from '../lib/googleDrive'

export interface BookSummary {
  id: string
  name: string
  title: string
  modifiedTime: string
  mimeType: string
}

interface CachedBook {
  modifiedTime: string
  text: string
}

interface BookLibraryState {
  books: BookSummary[]
  cache: Record<string, CachedBook>
  status: 'idle' | 'loading' | 'error'
  error: string | null
  /** Re-list the "ReadIt 课文" Drive folder. */
  refresh: () => Promise<void>
  /** Get a book's text, downloading and caching it on first access. */
  getText: (id: string) => Promise<string>
}

export const useBookLibraryStore = create<BookLibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      cache: {},
      status: 'idle',
      error: null,

      refresh: async () => {
        set({ status: 'loading', error: null })
        try {
          const files = await listPassageFiles()
          const books: BookSummary[] = files.map((f) => ({
            id: f.id,
            name: f.name,
            title: f.name.replace(/\.txt$/i, ''),
            modifiedTime: f.modifiedTime,
            mimeType: f.mimeType,
          }))
          const ids = new Set(books.map((b) => b.id))
          const cache = Object.fromEntries(
            Object.entries(get().cache).filter(([id]) => ids.has(id)),
          )
          set({ books, cache, status: 'idle' })
        } catch (err) {
          set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        }
      },

      getText: async (id) => {
        const book = get().books.find((b) => b.id === id)
        if (!book) throw new Error('课文不存在')
        const cached = get().cache[id]
        if (cached && cached.modifiedTime === book.modifiedTime) return cached.text

        const text = await downloadPassageText(book.id, book.mimeType)
        set({ cache: { ...get().cache, [id]: { modifiedTime: book.modifiedTime, text } } })
        return text
      },
    }),
    {
      name: 'readit-book-cache',
      partialize: (state) => ({ cache: state.cache }),
    },
  ),
)
