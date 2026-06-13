import { Link } from 'react-router-dom'
import { useLibraryStore } from '../store/useLibraryStore'
import { getMastery, isActive, MASTERY_LABELS } from '../lib/mastery'
import type { Mastery } from '../types'

export default function Dashboard() {
  const characters = useLibraryStore((s) => s.characters)
  const sessions = useLibraryStore((s) => s.sessions)
  const seedDemoData = useLibraryStore((s) => s.seedDemoData)
  const resetAll = useLibraryStore((s) => s.resetAll)

  const charList = Object.values(characters).filter(isActive)
  const total = charList.length
  const now = Date.now()
  const dueCount = charList.filter((c) => c.nextReview <= now).length

  const counts: Record<Mastery, number> = {
    new: 0,
    learning: 0,
    familiar: 0,
    mastered: 0,
  }
  charList.forEach((c) => counts[getMastery(c)]++)

  const lastSession = sessions[0]
  const lastAccuracy =
    lastSession && lastSession.totalChars > 0
      ? Math.round((lastSession.correctChars / lastSession.totalChars) * 100)
      : null

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-800">嗨，Leo！🦁📖</h1>
        <p className="text-slate-500 mt-1">
          准备好今天的阅读时间了吗？我们一起读故事、认汉字，每天都有新进步～
        </p>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="累计认读汉字" value={total} icon="📚" />
        <StatCard
          label="已掌握"
          value={counts.mastered}
          icon="🌟"
          accent="text-emerald-600"
        />
        <StatCard
          label="待复习"
          value={dueCount}
          icon="🎯"
          accent="text-rose-600"
        />
        <StatCard
          label="最近正确率"
          value={lastAccuracy !== null ? `${lastAccuracy}%` : '—'}
          icon="📈"
        />
      </section>

      {total > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-500 mb-3">掌握程度分布</h2>
          <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
            {(['mastered', 'familiar', 'learning'] as Mastery[]).map(
              (m) =>
                counts[m] > 0 && (
                  <div
                    key={m}
                    className={
                      m === 'mastered'
                        ? 'bg-emerald-400'
                        : m === 'familiar'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                    }
                    style={{ width: `${(counts[m] / total) * 100}%` }}
                    title={`${MASTERY_LABELS[m]}: ${counts[m]}`}
                  />
                ),
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />
              已掌握 {counts.mastered}
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
              较熟悉 {counts.familiar}
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-rose-400 mr-1" />
              学习中 {counts.learning}
            </span>
          </div>
        </section>
      )}

      <section className="grid sm:grid-cols-2 gap-3">
        <Link
          to="/read"
          className="bg-indigo-600 text-white rounded-2xl p-5 hover:bg-indigo-700 transition"
        >
          <div className="text-2xl mb-1">📖</div>
          <div className="font-bold">开始朗读练习</div>
          <div className="text-sm text-indigo-100 mt-1">点字标记，自动收录生字本</div>
        </Link>
        <Link
          to="/review"
          className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 transition"
        >
          <div className="text-2xl mb-1">🎯</div>
          <div className="font-bold text-slate-800">
            巩固复习
            {dueCount > 0 && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 align-middle">
                {dueCount} 个待复习
              </span>
            )}
          </div>
          <div className="text-sm text-slate-400 mt-1">针对薄弱字词强化练习</div>
        </Link>
      </section>

      {sessions.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-500 mb-3">最近练习记录</h2>
          <ul className="divide-y divide-slate-100">
            {sessions.slice(0, 5).map((s) => {
              const accuracy =
                s.totalChars > 0
                  ? Math.round((s.correctChars / s.totalChars) * 100)
                  : 0
              return (
                <li
                  key={s.id}
                  className="py-2 flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="font-medium text-slate-700">
                      {s.passageTitle}
                    </span>
                    <span className="text-slate-400 ml-2">
                      {new Date(s.date).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <span
                    className={`font-semibold ${
                      accuracy >= 90
                        ? 'text-emerald-600'
                        : accuracy >= 70
                          ? 'text-amber-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {accuracy}%
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="text-center pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-400 mb-2">原型演示数据</p>
        <div className="flex justify-center gap-2">
          <button
            onClick={seedDemoData}
            className="px-3 py-1.5 text-sm rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 transition"
          >
            加载演示数据
          </button>
          <button
            onClick={() => {
              if (confirm('确定要清空所有学习记录吗？')) resetAll()
            }}
            className="px-3 py-1.5 text-sm rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-rose-300 transition"
          >
            清空数据
          </button>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number | string
  icon: string
  accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xl mb-1">{icon}</div>
      <div className={`text-2xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}
