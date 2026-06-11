import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibraryStore } from '../store/useLibraryStore'
import { charPinyin } from '../lib/pinyin'

const QUEUE_SIZE = 10

function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

export default function ReviewMode() {
  const characters = useLibraryStore((s) => s.characters)
  const recordReview = useLibraryStore((s) => s.recordReview)
  const removeCharacter = useLibraryStore((s) => s.removeCharacter)

  const [queue, setQueue] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState({ correct: 0, wrong: 0, removed: 0 })

  const dueCount = useMemo(() => {
    const now = Date.now()
    return Object.values(characters).filter((c) => c.nextReview <= now).length
  }, [characters])

  function startReview() {
    const now = Date.now()
    const all = Object.values(characters)
    const due = all.filter((c) => c.nextReview <= now)
    const pool = due.length > 0 ? due : all
    const sorted = [...pool].sort(
      (a, b) => a.box - b.box || a.nextReview - b.nextReview,
    )
    setQueue(sorted.slice(0, QUEUE_SIZE).map((c) => c.char))
    setIndex(0)
    setRevealed(false)
    setTally({ correct: 0, wrong: 0, removed: 0 })
  }

  function answer(correct: boolean) {
    if (!queue) return
    recordReview(queue[index], correct)
    setTally((t) =>
      correct ? { ...t, correct: t.correct + 1 } : { ...t, wrong: t.wrong + 1 },
    )
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  function removeAndAdvance() {
    if (!queue) return
    removeCharacter(queue[index])
    setTally((t) => ({ ...t, removed: t.removed + 1 }))
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  if (Object.keys(characters).length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🎯</div>
        <h2 className="text-lg font-bold text-slate-700 mb-2">还没有可复习的字</h2>
        <p className="text-slate-500 mb-6">先去朗读练习，认读一些汉字吧。</p>
        <Link
          to="/read"
          className="inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          开始朗读练习
        </Link>
      </div>
    )
  }

  if (!queue) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="text-5xl mb-2">🎯</div>
        <h2 className="text-lg font-bold text-slate-700">巩固复习</h2>
        <p className="text-slate-500">
          {dueCount > 0
            ? `今天有 ${dueCount} 个字需要复习。`
            : '今天的复习都完成啦，可以提前练习一下。'}
        </p>
        <button
          onClick={startReview}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          开始复习
        </button>
      </div>
    )
  }

  if (index >= queue.length) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="text-5xl mb-2">🎉</div>
        <h2 className="text-lg font-bold text-slate-700">本轮复习完成！</h2>
        <p className="text-slate-500">
          认识 {tally.correct} 个 · 不熟悉 {tally.wrong} 个
          {tally.removed > 0 && ` · 移出生字本 ${tally.removed} 个`}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={startReview}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            再来一轮
          </button>
          <Link
            to="/library"
            className="px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-600 font-medium hover:border-slate-300 transition"
          >
            查看生字本
          </Link>
        </div>
      </div>
    )
  }

  const char = queue[index]
  const stats = characters[char]

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          第 {index + 1} / {queue.length} 个
        </span>
        <span>
          认识 {tally.correct} · 不熟悉 {tally.wrong}
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
        <div className="text-7xl font-bold text-slate-800">{char}</div>
        <div className="h-7">
          {revealed ? (
            <span className="text-xl text-indigo-500">{charPinyin(char)}</span>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              className="text-sm text-slate-400 underline"
            >
              显示拼音
            </button>
          )}
        </div>
        <button
          onClick={() => speak(char)}
          className="text-sm text-slate-500 hover:text-indigo-600"
        >
          🔊 朗读
        </button>
        {stats && (
          <p className="text-xs text-slate-400">
            历史正确 {stats.correctCount} 次 · 错误 {stats.wrongCount} 次
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => answer(false)}
          className="py-3 rounded-xl bg-rose-50 text-rose-600 font-semibold border border-rose-100 hover:bg-rose-100 transition"
        >
          ✗ 不熟悉
        </button>
        <button
          onClick={() => answer(true)}
          className="py-3 rounded-xl bg-emerald-50 text-emerald-600 font-semibold border border-emerald-100 hover:bg-emerald-100 transition"
        >
          ✓ 认识
        </button>
      </div>
      <button
        onClick={removeAndAdvance}
        className="w-full py-2 rounded-xl text-sm text-slate-400 border border-dashed border-slate-200 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition"
      >
        🗑 还没学过，移出生字本
      </button>
    </div>
  )
}
