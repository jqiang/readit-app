import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibraryStore } from '../store/useLibraryStore'
import { getMastery, MASTERY_COLORS, MASTERY_LABELS } from '../lib/mastery'
import { charPinyin, isChineseChar } from '../lib/pinyin'
import type { Mastery } from '../types'

const FILTERS: Array<{ key: Mastery | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'learning', label: '学习中' },
  { key: 'familiar', label: '较熟悉' },
  { key: 'mastered', label: '已掌握' },
]

export default function CharacterLibrary() {
  const characters = useLibraryStore((s) => s.characters)
  const addKnownCharacters = useLibraryStore((s) => s.addKnownCharacters)
  const [filter, setFilter] = useState<Mastery | 'all'>('all')
  const [search, setSearch] = useState('')
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const total = Object.keys(characters).length

  const counts = useMemo(() => {
    const c: Record<Mastery, number> = {
      new: 0,
      learning: 0,
      familiar: 0,
      mastered: 0,
    }
    Object.values(characters).forEach((stats) => {
      c[getMastery(stats)]++
    })
    return c
  }, [characters])

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.values(characters)
      .map((stats) => ({ stats, mastery: getMastery(stats) }))
      .filter(({ mastery }) => filter === 'all' || mastery === filter)
      .filter(
        ({ stats }) =>
          !q ||
          stats.char.includes(q) ||
          charPinyin(stats.char).toLowerCase().includes(q),
      )
      .sort((a, b) => b.stats.lastSeen - a.stats.lastSeen)
  }, [characters, filter, search])

  function handleAdd() {
    const chars = Array.from(new Set(Array.from(input).filter(isChineseChar)))
    if (chars.length === 0) {
      setFeedback('请输入汉字')
      return
    }
    const added = addKnownCharacters(chars)
    const skipped = chars.length - added
    setFeedback(
      added > 0
        ? `已添加 ${added} 个字${skipped > 0 ? `，${skipped} 个已在生字本中` : ''}`
        : '这些字都已经在生字本中了',
    )
    setInput('')
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">手动添加孩子已经认识的字</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="输入汉字或词语，例如：我们一起去公园"
            className="flex-1 min-w-[200px] px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            添加
          </button>
        </div>
        {feedback && <p className="text-xs text-slate-400">{feedback}</p>}
        <p className="text-xs text-slate-400">
          添加后会标记为「学习中」，朗读练习中不会再自动显示拼音。
        </p>
      </section>

      {total === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📚</div>
          <h2 className="text-lg font-bold text-slate-700 mb-2">生字本还是空的</h2>
          <p className="text-slate-500 mb-6">
            在上面手动添加孩子已经认识的字，或者去朗读练习中读一篇课文，认读过的字会自动收录到这里。
          </p>
          <Link
            to="/read"
            className="inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            开始朗读练习
          </Link>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="累计认读" value={total} />
            <StatCard label="学习中" value={counts.learning} accent="text-rose-600" />
            <StatCard label="较熟悉" value={counts.familiar} accent="text-amber-600" />
            <StatCard label="已掌握" value={counts.mastered} accent="text-emerald-600" />
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filter === f.key
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索汉字或拼音"
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-48 bg-white"
            />
          </section>

          {entries.length === 0 ? (
            <p className="text-center text-slate-400 py-10">没有符合条件的汉字</p>
          ) : (
            <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {entries.map(({ stats, mastery }) => {
                const totalAttempts = stats.correctCount + stats.wrongCount
                const accuracy =
                  totalAttempts > 0
                    ? Math.round((stats.correctCount / totalAttempts) * 100)
                    : 0
                return (
                  <div
                    key={stats.char}
                    className="bg-white rounded-xl border border-slate-200 p-4 text-center"
                  >
                    <div className="text-4xl mb-1">{stats.char}</div>
                    <div className="text-sm text-slate-400 mb-2">
                      {charPinyin(stats.char)}
                    </div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${MASTERY_COLORS[mastery]}`}
                    >
                      {MASTERY_LABELS[mastery]}
                    </span>
                    <div className="mt-2 text-xs text-slate-400">
                      正确 {stats.correctCount} · 错误 {stats.wrongCount}（{accuracy}%）
                    </div>
                  </div>
                )
              })}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
      <div className={`text-2xl font-bold ${accent ?? 'text-slate-800'}`}>
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}
