import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibraryStore } from '../store/useLibraryStore'
import { useDriveStore } from '../store/useDriveStore'
import { useBookLibraryStore } from '../store/useBookLibraryStore'
import { isConfigured as isDriveConfigured } from '../lib/googleDrive'
import { initMarks, cycleMark, getCharResults, type CharMark } from '../lib/marking'
import { charPinyin } from '../lib/pinyin'

const MARK_STYLES: Record<CharMark, string> = {
  unmarked: 'text-slate-700',
  wrong: 'bg-rose-100 text-rose-600 underline decoration-wavy decoration-rose-400',
  remove: 'bg-violet-100 text-violet-700 underline decoration-dotted decoration-violet-400',
  learned: 'bg-emerald-100 text-emerald-700',
  skip: 'text-slate-300',
}

const PAGE_SIZE = 10

const SORT_OPTIONS: Array<{ key: 'title' | 'updated'; label: string }> = [
  { key: 'title', label: '按标题' },
  { key: 'updated', label: '按更新时间' },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

interface SessionResult {
  correct: number
  total: number
  wrongChars: string[]
  learnedChars: string[]
  removedChars: string[]
}

type PassageLoadState =
  | { id: string; status: 'done'; text: string }
  | { id: string; status: 'error'; error: string }

export default function ReadingPractice() {
  const recordSession = useLibraryStore((s) => s.recordSession)
  const characters = useLibraryStore((s) => s.characters)
  const driveConnected = useDriveStore((s) => s.connected)
  const driveReady = isDriveConfigured() && driveConnected

  const books = useBookLibraryStore((s) => s.books)
  const status = useBookLibraryStore((s) => s.status)
  const error = useBookLibraryStore((s) => s.error)
  const refresh = useBookLibraryStore((s) => s.refresh)
  const getText = useBookLibraryStore((s) => s.getText)

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'title' | 'updated'>('title')
  const [page, setPage] = useState(1)
  const [pageResetKey, setPageResetKey] = useState({ search: '', sortBy: 'title' as typeof sortBy })
  const [bookId, setBookId] = useState<string | null>(null)
  const [passageState, setPassageState] = useState<PassageLoadState | null>(null)

  const [marks, setMarks] = useState<CharMark[]>([])
  const [result, setResult] = useState<SessionResult | null>(null)

  const sortedBooks = useMemo(() => {
    if (sortBy === 'updated') {
      return [...books].sort(
        (a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime(),
      )
    }
    return books
  }, [books, sortBy])

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedBooks
    return sortedBooks.filter((b) => b.title.toLowerCase().includes(q))
  }, [sortedBooks, search])

  // Reset to page 1 whenever the search or sort changes (adjusting state
  // during render, per https://react.dev/learn/you-might-not-need-an-effect).
  if (pageResetKey.search !== search || pageResetKey.sortBy !== sortBy) {
    setPageResetKey({ search, sortBy })
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageBooks = filteredBooks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  // Fall back to the first book until the user picks one, without
  // disrupting the active selection just because the search box filters
  // the visible list.
  const selectedBookId =
    bookId && books.some((b) => b.id === bookId) ? bookId : (sortedBooks[0]?.id ?? null)
  const book = books.find((b) => b.id === selectedBookId)
  const textLoading = selectedBookId !== null && passageState?.id !== selectedBookId
  const passageText =
    passageState?.id === selectedBookId && passageState.status === 'done'
      ? passageState.text
      : null
  const textError =
    passageState?.id === selectedBookId && passageState.status === 'error'
      ? passageState.error
      : null
  const targetChars = useMemo(
    () => (passageText ? Array.from(passageText) : []),
    [passageText],
  )
  const titleChars = useMemo(() => (book ? Array.from(book.title) : []), [book])
  // The full markable text = title + '\n' separator + body. Title chars occupy
  // indices [0, titleChars.length); body chars start after the separator.
  const bodyOffset = titleChars.length + 1
  const fullText =
    book && passageText !== null ? `${book.title}\n${passageText}` : null

  useEffect(() => {
    if (driveReady) void refresh()
  }, [driveReady, refresh])

  useEffect(() => {
    if (!selectedBookId) return
    let cancelled = false
    getText(selectedBookId)
      .then((text) => {
        if (cancelled) return
        const title =
          useBookLibraryStore.getState().books.find((b) => b.id === selectedBookId)
            ?.title ?? ''
        setPassageState({ id: selectedBookId, status: 'done', text })
        // The title is markable too, sharing one marks array with the body
        // (separated by a non-Chinese '\n' that initMarks leaves as 'skip').
        setMarks(initMarks(`${title}\n${text}`))
        setResult(null)
      })
      .catch((err) => {
        if (cancelled) return
        setPassageState({
          id: selectedBookId,
          status: 'error',
          error: err instanceof Error ? err.message : '加载课文失败',
        })
      })
    return () => {
      cancelled = true
    }
  }, [selectedBookId, getText])

  // A char moved out of the library is treated as not-in-library: it shows
  // pinyin and re-enters the library if marked as learned.
  function isInLibrary(ch: string) {
    const c = characters[ch]
    return !!c && !c.removed
  }

  function handleCharClick(absIndex: number, ch: string) {
    if (result || passageText === null) return
    const isKnown = isInLibrary(ch)
    setMarks((prev) => {
      if (prev[absIndex] === 'skip') return prev
      const next = [...prev]
      next[absIndex] = cycleMark(next[absIndex], isKnown)
      return next
    })
  }

  function finish() {
    if (!book || fullText === null) return
    const results = getCharResults(marks, fullText, isInLibrary)
    recordSession(book.id, book.title, results)
    setResult({
      correct: results.filter((r) => r.outcome === 'correct').length,
      total: results.filter((r) => r.outcome === 'correct' || r.outcome === 'wrong')
        .length,
      wrongChars: results
        .filter((r) => r.outcome === 'wrong' || r.outcome === 'learnWrong')
        .map((r) => r.char),
      learnedChars: results
        .filter((r) => r.outcome === 'learn' || r.outcome === 'learnWrong')
        .map((r) => r.char),
      removedChars: results.filter((r) => r.outcome === 'remove').map((r) => r.char),
    })
  }

  function resetPassage() {
    if (fullText === null) return
    setMarks(initMarks(fullText))
    setResult(null)
  }

  function renderChar(ch: string, absIndex: number, key: string) {
    const mark = marks[absIndex] ?? 'skip'
    const inLibrary = isInLibrary(ch)
    const showPinyin =
      mark !== 'skip' && (inLibrary ? mark === 'remove' : mark !== 'learned')
    return (
      <ruby
        key={key}
        onClick={() => handleCharClick(absIndex, ch)}
        className={`rounded px-0.5 transition-colors ${MARK_STYLES[mark]} ${
          mark !== 'skip' && !result ? 'cursor-pointer' : ''
        }`}
      >
        {ch}
        {showPinyin && (
          <rt className="text-xs font-normal text-violet-400 select-none">
            {charPinyin(ch)}
          </rt>
        )}
      </ruby>
    )
  }

  return (
    <div className="space-y-5">
      {!driveReady ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
          还没有连接 Google Drive。请先到{' '}
          <Link to="/settings" className="text-indigo-600 underline">
            设置
          </Link>{' '}
          连接 Google Drive，然后在「ReadIt 课文」文件夹里放入 .txt 课文文件。
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5">
          <aside className="lg:w-72 flex-shrink-0 space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索课文标题…"
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
                <button
                  onClick={() => void refresh()}
                  disabled={status === 'loading'}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:border-indigo-300 transition disabled:opacity-50"
                >
                  🔄
                </button>
              </div>
              <div className="flex gap-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortBy(opt.key)}
                    className={`flex-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                      sortBy === opt.key
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {status === 'error' && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-xl p-3">
                {error}（如果是权限问题，请到「设置」中重新连接 Google Drive）
              </div>
            )}

            {status === 'loading' && books.length === 0 ? (
              <div className="text-sm text-slate-400 p-3">正在加载课文列表…</div>
            ) : books.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
                「ReadIt 课文」文件夹里还没有课文。可以去{' '}
                <Link to="/import" className="text-indigo-600 underline">
                  导入课文
                </Link>
                ，或者直接在 Google Drive 的该文件夹里放入 .txt 文件，然后点刷新。
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-400 px-1">
                  共 {filteredBooks.length} 篇课文
                </div>
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {pageBooks.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBookId(b.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition ${
                        b.id === selectedBookId
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="truncate">{b.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {formatDate(b.modifiedTime)}
                      </div>
                    </button>
                  ))}
                  {pageBooks.length === 0 && (
                    <div className="px-3 py-2 text-sm text-slate-400">没有匹配的课文</div>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-sm">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 transition disabled:opacity-40 disabled:hover:border-slate-200"
                    >
                      上一页
                    </button>
                    <span className="text-xs text-slate-400">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 transition disabled:opacity-40 disabled:hover:border-slate-200"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </aside>

          <div className="flex-1 min-w-0 space-y-5">
            {textLoading && <div className="text-sm text-slate-400">正在加载课文内容…</div>}
            {textError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-xl p-3">
                {textError}
              </div>
            )}

            {book && passageText !== null && (
              <>
                <section className="bg-white rounded-xl border border-slate-200 p-3 text-sm text-slate-500 leading-relaxed space-y-1">
                  <p>
                    家长边听孩子朗读边点字标记。生字本里
                    <strong className="text-slate-700">已有</strong>
                    的字（不显示拼音）：不点 = 默认读对；点一下变成{' '}
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">红色</span>
                    ＝应该会但读错了；再点一下变成{' '}
                    <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                      紫色
                    </span>
                    ＝其实他还不会，从生字本中移除；再点一下恢复默认。
                  </p>
                  <p>
                    生字本里
                    <strong className="text-slate-700">还没有</strong>
                    的字（上方显示拼音）：不点 = 暂不收录；点一下变成{' '}
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      绿色
                    </span>
                    ＝他已经认识了，加入生字本；再点一下变成{' '}
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">红色</span>
                    ＝他认识，但这次读错了，也加入生字本；再点一下恢复默认。
                  </p>
                </section>

                <section className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3
                    className="text-2xl font-bold text-slate-800 mb-4 tracking-wide"
                    style={{ lineHeight: 2.4 }}
                  >
                    {titleChars.map((ch, i) => renderChar(ch, i, `t-${i}`))}
                  </h3>
                  <div className="text-3xl tracking-wide" style={{ lineHeight: 3 }}>
                    {targetChars.map((ch, i) => renderChar(ch, bodyOffset + i, `b-${i}`))}
                  </div>
                </section>

                <section className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={finish}
                    disabled={result !== null}
                    className="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✅ 完成并记录
                  </button>
                  <button
                    onClick={resetPassage}
                    className="px-4 py-2 rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition"
                  >
                    🔄 重新开始
                  </button>
                </section>

                {result && (
                  <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                    <h3 className="text-lg font-bold text-slate-800">本次结果</h3>
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-bold text-indigo-600">
                        {result.total > 0
                          ? Math.round((result.correct / result.total) * 100)
                          : 100}
                        %
                      </div>
                      <div className="text-sm text-slate-500">
                        读对 {result.correct} / {result.total} 字
                        {result.learnedChars.length > 0 &&
                          `，新学会 ${result.learnedChars.length} 个字`}
                        {result.removedChars.length > 0 &&
                          `，移出 ${result.removedChars.length} 个字`}
                      </div>
                    </div>
                    {result.wrongChars.length > 0 && (
                      <div>
                        <p className="text-sm text-slate-500 mb-2">需要加强的字：</p>
                        <div className="flex flex-wrap gap-2">
                          {result.wrongChars.map((ch, i) => (
                            <div
                              key={i}
                              className="px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg text-center"
                            >
                              <div className="text-xl">{ch}</div>
                              <div className="text-xs text-rose-400">{charPinyin(ch)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.learnedChars.length > 0 && (
                      <div>
                        <p className="text-sm text-slate-500 mb-2">新学会的字：</p>
                        <div className="flex flex-wrap gap-2">
                          {result.learnedChars.map((ch, i) => (
                            <div
                              key={i}
                              className="px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg text-center"
                            >
                              <div className="text-xl">{ch}</div>
                              <div className="text-xs text-emerald-500">{charPinyin(ch)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.removedChars.length > 0 && (
                      <div>
                        <p className="text-sm text-slate-500 mb-2">已从生字本移除的字：</p>
                        <div className="flex flex-wrap gap-2">
                          {result.removedChars.map((ch, i) => (
                            <div
                              key={i}
                              className="px-3 py-2 bg-violet-50 border border-violet-100 rounded-lg text-center"
                            >
                              <div className="text-xl">{ch}</div>
                              <div className="text-xs text-violet-400">{charPinyin(ch)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-slate-400">
                      已更新生字本，可在「巩固复习」中加强练习。
                    </p>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
