import { FINAL_GROUPS, INITIALS, INITIAL_ROWS, TONES } from '../../lib/pinyinPractice'
import type { TapPiece } from './useAnswerComposer'

interface PinyinKeyboardProps {
  /** Locks the whole keyboard, e.g. while correct/wrong feedback is showing. */
  disabled: boolean
  /** Tone tiles stay disabled until at least one final has been tapped. */
  canTone: boolean
  onTap: (piece: TapPiece) => void
}

// 44px tiles: the iOS minimum touch target, small enough that the three
// columns (声母 / 韵母 / 声调) fit side by side on an iPad without scrolling.
const TILE_BASE =
  'h-11 min-w-11 px-1 rounded-lg text-base font-bold touch-manipulation select-none active:scale-95 transition disabled:opacity-40'

function initialRows(): string[][] {
  const rows: string[][] = []
  let cursor = 0
  for (const count of INITIAL_ROWS) {
    rows.push(INITIALS.slice(cursor, cursor + count))
    cursor += count
  }
  return rows
}

function Label({ children }: { children: string }) {
  return <h3 className="text-[11px] font-semibold text-slate-400 leading-none">{children}</h3>
}

export default function PinyinKeyboard({ disabled, canTone, onTap }: PinyinKeyboardProps) {
  return (
    // Stacked on phones, three columns from `md` up: 声母 | 韵母 | 声调.
    <div className="grid gap-4 md:grid-cols-[auto_auto_auto] md:justify-center md:items-start">
      <section className="space-y-1.5">
        <Label>声母</Label>
        {/* One school row per line (b p m f / d t n l / g k h / ...). */}
        <div className="space-y-1.5">
          {initialRows().map((row, i) => (
            <div key={i} className="flex gap-1.5">
              {row.map((initial) => (
                <button
                  key={initial}
                  type="button"
                  disabled={disabled}
                  onClick={() => onTap({ kind: 'initial', value: initial })}
                  className={`${TILE_BASE} bg-sky-100 text-sky-800 border border-sky-200`}
                >
                  {initial}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-1.5 md:border-x md:border-slate-200 md:px-4">
        <Label>韵母</Label>
        {/* Each group wraps at 6 tiles wide so the column stays narrow. */}
        <div className="space-y-2">
          {FINAL_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="text-[10px] text-slate-400 leading-none">{group.label}</div>
              <div className="grid grid-cols-6 gap-1.5 w-fit">
                {group.finals.map((final) => (
                  <button
                    key={final}
                    type="button"
                    disabled={disabled}
                    onClick={() => onTap({ kind: 'final', value: final })}
                    className={`${TILE_BASE} bg-orange-100 text-orange-800 border border-orange-200`}
                  >
                    {final}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-1.5">
        <Label>声调</Label>
        <div className="flex md:flex-col gap-1.5">
          {TONES.map((tone) => (
            <button
              key={tone.num}
              type="button"
              disabled={disabled || !canTone}
              onClick={() => onTap({ kind: 'tone', value: tone.num })}
              className={`${TILE_BASE} min-w-14 bg-violet-100 text-violet-800 border border-violet-200`}
            >
              <span className="block leading-none text-lg">{tone.mark}</span>
              <span className="block text-[10px] font-normal leading-none mt-0.5">
                {tone.label ?? ['a', 'ā', 'á', 'ǎ', 'à'][tone.num]}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
