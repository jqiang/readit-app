import { useState } from 'react'
import type { ComposerPhase } from './useAnswerComposer'
import type { Reading } from '../../lib/pinyinPractice'
import { speak } from '../../lib/speech'
import { SPEECH_HINTS, useSpeechStatus } from './useSpeechStatus'
import Confetti from './Confetti'

interface CharacterCardProps {
  char: string
  phase: ComposerPhase
  revealed: Reading | null
}

const PHASE_STYLES: Record<ComposerPhase, string> = {
  input: 'bg-white border-slate-200',
  correct: 'bg-emerald-50 border-emerald-300',
  wrong: 'bg-rose-50 border-rose-300',
}

export default function CharacterCard({ char, phase, revealed }: CharacterCardProps) {
  const [confettiKey, setConfettiKey] = useState(0)
  const [prevPhase, setPrevPhase] = useState(phase)
  const speech = useSpeechStatus()
  const hint = SPEECH_HINTS[speech]

  // Bump the confetti key whenever phase transitions to 'correct', so
  // Confetti remounts and replays. Done during render (not an effect) to
  // avoid the set-state-in-effect anti-pattern.
  if (phase !== prevPhase) {
    setPrevPhase(phase)
    if (phase === 'correct') setConfettiKey((k) => k + 1)
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border px-4 py-3 transition-colors ${PHASE_STYLES[phase]}`}
    >
      {phase === 'correct' && <Confetti key={confettiKey} />}
      <div className="flex items-center justify-center gap-6">
        <div className="text-6xl sm:text-7xl font-bold text-slate-800 leading-none">{char}</div>
        <div className="flex flex-col items-start gap-1">
          <div className="h-8 flex items-center">
            {phase === 'wrong' && revealed && (
              <span className="text-2xl text-rose-600">{revealed.display}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => speak(char)}
            title={hint ?? undefined}
            className="min-h-11 px-3 rounded-lg text-sm text-slate-500 hover:text-indigo-600 hover:bg-slate-50"
          >
            🔊 听一听
          </button>
        </div>
      </div>
      {hint && <p className="mt-1 text-center text-[11px] text-amber-600">{hint}</p>}
    </div>
  )
}
