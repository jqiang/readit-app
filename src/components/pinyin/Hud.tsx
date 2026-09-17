import type { RoundHud } from './types'
import { SPEECH_HINTS, useSpeechStatus } from './useSpeechStatus'

interface HudProps {
  hud: RoundHud
  /** Timed modes only: whether the round is currently paused, and a toggle
   * for it. Renders the ⏸ 暂停 / ▶️ 继续 button only when `onPause` is given. */
  paused?: boolean
  onPause?: () => void
  onExit?: () => void
  /** 太空射击 only: reads the current target character aloud. Rendered in
   * this row instead of on the (replaced) CharacterCard. */
  onSpeak?: () => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export default function Hud({ hud, paused, onPause, onExit, onSpeak }: HudProps) {
  const { score, streak, progress, timeLeftMs, timeFrac, energy, lives, best } = hud
  const lowEnergy = energy !== undefined && energy < 25
  const speechHint = SPEECH_HINTS[useSpeechStatus()]

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-slate-600">
      <div className="flex flex-wrap items-center gap-3">
        <span>⭐ {score}</span>
        {streak > 0 && <span>🔥 {streak}</span>}
        {best !== undefined && <span className="text-slate-400">最好 {best}</span>}
        {timeLeftMs !== undefined && <span>⏱ {formatTime(timeLeftMs)}</span>}
        {lives !== undefined && <span>{'❤️'.repeat(Math.max(0, lives))}</span>}
        {progress && (
          <span className="text-slate-400">
            {progress.current}/{progress.total}
          </span>
        )}
      </div>
      {timeFrac !== undefined && (
        <div className="w-full sm:w-40 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-[width]"
            style={{ width: `${clampPercent(timeFrac * 100)}%` }}
          />
        </div>
      )}
      {energy !== undefined && (
        <div className="w-full sm:w-40 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full transition-[width] ${lowEnergy ? 'bg-rose-400' : 'bg-indigo-500'}`}
            style={{ width: `${clampPercent(energy)}%` }}
          />
        </div>
      )}
      {(onSpeak || onPause || onExit) && (
        <div className="flex items-center gap-3">
          {onSpeak && (
            <button
              onClick={onSpeak}
              title={speechHint ?? undefined}
              className="min-h-11 text-xs text-slate-400 hover:text-indigo-600"
            >
              🔊 听一听
            </button>
          )}
          {onPause && (
            <button onClick={onPause} className="text-xs text-slate-400 hover:text-indigo-600">
              {paused ? '▶️ 继续' : '⏸ 暂停'}
            </button>
          )}
          {onExit && (
            <button onClick={onExit} className="text-xs text-slate-400 hover:text-rose-500">
              退出
            </button>
          )}
        </div>
      )}
    </div>
  )
}
