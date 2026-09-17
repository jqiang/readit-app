import type { Answer } from '../../lib/pinyinPractice'
import { TONES } from '../../lib/pinyinPractice'
import type { ComposerPhase } from './useAnswerComposer'

interface AnswerSlotsProps {
  answer: Answer
  phase: ComposerPhase
  /** index 0 = initial (if any), then finals in order; the trailing tone
   * slot is never removable so it never fires this. */
  onRemove: (index: number) => void
  onBackspace: () => void
}

const TONE_MARK: Record<number, string> = Object.fromEntries(TONES.map((t) => [t.num, t.mark]))

interface Slot {
  key: string
  label: string
  removable: boolean
}

export default function AnswerSlots({ answer, phase, onRemove, onBackspace }: AnswerSlotsProps) {
  const slots: Slot[] = []
  if (answer.initial !== null) {
    slots.push({ key: 'initial', label: answer.initial, removable: true })
  }
  answer.finals.forEach((f, i) => {
    slots.push({ key: `final-${i}`, label: f, removable: true })
  })
  slots.push({
    key: 'tone',
    label: answer.tone !== null ? TONE_MARK[answer.tone] : '',
    removable: false,
  })

  const rowTint =
    phase === 'wrong'
      ? 'animate-shake border-rose-400'
      : phase === 'correct'
        ? 'border-emerald-300'
        : 'border-transparent'

  return (
    <div className={`flex items-center justify-center gap-2 rounded-xl border-2 p-2 transition-colors ${rowTint}`}>
      {slots.map((slot, index) => (
        <button
          key={slot.key}
          type="button"
          onClick={() => onRemove(index)}
          disabled={!slot.removable || phase !== 'input'}
          className="min-w-14 h-14 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-xl font-bold text-slate-700 disabled:cursor-default"
        >
          {slot.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onBackspace}
        disabled={phase !== 'input'}
        className="min-w-14 h-14 rounded-lg text-xl text-slate-400 hover:text-rose-500 disabled:opacity-40"
      >
        ⌫
      </button>
    </div>
  )
}
