import type { PinyinMode } from '../../types'

interface ModeInfo {
  mode: PinyinMode
  emoji: string
  title: string
  description: string
  enabled: boolean
}

// All four modes are implemented (Phases 2-4).
const MODES: ModeInfo[] = [
  { mode: 'free', emoji: '🧘', title: '自由练习', description: '不限时，慢慢拼', enabled: true },
  { mode: 'sprint', emoji: '⏱', title: '两分钟冲刺', description: '限时挑战，越快越好', enabled: true },
  { mode: 'survival', emoji: '❤️', title: '生存模式', description: '答错扣血，坚持到最后', enabled: true },
  { mode: 'space', emoji: '🚀', title: '太空射击', description: '拼音打字，保卫基地', enabled: true },
]

interface ModeSelectProps {
  poolSize: number
  bests: Partial<Record<PinyinMode, number>>
  onSelect: (mode: PinyinMode) => void
}

export default function ModeSelect({ poolSize, bests, onSelect }: ModeSelectProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MODES.map((m) => {
          const best = bests[m.mode]
          return (
            <button
              key={m.mode}
              type="button"
              disabled={!m.enabled}
              onClick={() => onSelect(m.mode)}
              className={`text-left p-4 rounded-2xl border transition ${
                m.enabled
                  ? 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                  : 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{m.emoji}</span>
                {!m.enabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
                    即将推出
                  </span>
                )}
              </div>
              <div className="mt-2 font-semibold text-slate-800">{m.title}</div>
              <div className="text-xs text-slate-400 mt-1">{m.description}</div>
              {m.enabled && best !== undefined && (
                <div className="text-xs text-amber-500 mt-2">最好成绩 ⭐ {best}</div>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-center text-xs text-slate-400">共 {poolSize} 个已掌握的字可以练习</p>
    </div>
  )
}
