import type { RoundSummaryData } from './types'

interface RoundSummaryProps {
  summary: RoundSummaryData
  onRestart: () => void
  onChangeMode: () => void
  /** Coins credited for finishing this round, 0 if none (e.g. not yet
   * awarded). Omit the line entirely when there's nothing to show. */
  coinsEarned?: number
}

export default function RoundSummary({
  summary,
  onRestart,
  onChangeMode,
  coinsEarned,
}: RoundSummaryProps) {
  const { correct, wrong, missed, score, isNewBest } = summary

  return (
    <div className="max-w-md mx-auto text-center py-10 space-y-4">
      <div className="text-5xl">🎉</div>
      <h2 className="text-lg font-bold text-slate-700">本轮完成！得分 {score}</h2>
      <p className="text-slate-500">
        答对 {correct} · 答错 {wrong}
      </p>
      {isNewBest && <p className="text-amber-500 font-semibold">🏆 新纪录！</p>}
      {!!coinsEarned && <p className="text-amber-600 font-semibold">🪙 +{coinsEarned} 金币</p>}
      {missed.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {missed.map((m) => (
            <span
              key={m.char}
              className="px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-sm border border-rose-100"
            >
              {m.char} <span className="text-rose-400">{m.pinyin}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex justify-center gap-3">
        <button
          onClick={onRestart}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          再来一轮
        </button>
        <button
          onClick={onChangeMode}
          className="px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-600 font-medium hover:border-slate-300 transition"
        >
          换个玩法
        </button>
      </div>
    </div>
  )
}
