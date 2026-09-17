import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibraryStore } from '../store/useLibraryStore'
import { usePinyinStore } from '../store/usePinyinStore'
import { getMastery, isActive } from '../lib/mastery'
import type { PinyinMode } from '../types'
import ModeSelect from '../components/pinyin/ModeSelect'
import Hud from '../components/pinyin/Hud'
import CharacterCard from '../components/pinyin/CharacterCard'
import SpaceArena from '../components/pinyin/SpaceArena'
import AnswerSlots from '../components/pinyin/AnswerSlots'
import PinyinKeyboard from '../components/pinyin/PinyinKeyboard'
import RoundSummary from '../components/pinyin/RoundSummary'
import { useAnswerComposer } from '../components/pinyin/useAnswerComposer'
import { useRoundCoins } from '../components/pinyin/useRoundCoins'
import { useFreeMode } from '../components/pinyin/useFreeMode'
import { useSprintMode } from '../components/pinyin/useSprintMode'
import { useSurvivalMode } from '../components/pinyin/useSurvivalMode'
import { useSpaceMode } from '../components/pinyin/useSpaceMode'
import { speak } from '../lib/speech'
import type { RoundApi } from '../components/pinyin/types'
import type { SpaceRoundApi } from '../components/pinyin/useSpaceMode'

/** Below this many mastered chars, familiar ones are added to the pool too. */
const MIN_POOL = 5

export default function PinyinPractice() {
  const characters = useLibraryStore((s) => s.characters)
  const bests = usePinyinStore((s) => s.bests)

  const { pool, usedFamiliarFallback } = useMemo(() => {
    const active = Object.values(characters).filter(isActive)
    const mastered = active.filter((c) => getMastery(c) === 'mastered').map((c) => c.char)
    if (mastered.length >= MIN_POOL) {
      return { pool: mastered, usedFamiliarFallback: false }
    }
    const familiar = active.filter((c) => getMastery(c) === 'familiar').map((c) => c.char)
    return { pool: [...new Set([...mastered, ...familiar])], usedFamiliarFallback: familiar.length > 0 }
  }, [characters])

  const [mode, setMode] = useState<PinyinMode | null>(null)

  if (pool.length < MIN_POOL) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🔤</div>
        <h2 className="text-lg font-bold text-slate-700 mb-2">还没有可以练习拼音的字</h2>
        <p className="text-slate-500 mb-6">先在巩固复习中把一些字练熟，再来玩拼音练习。</p>
        <Link
          to="/review"
          className="inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          去巩固复习
        </Link>
      </div>
    )
  }

  if (mode === null) {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        <h2 className="text-lg font-bold text-slate-700 text-center">拼音练习</h2>
        {usedFamiliarFallback && (
          <p className="text-center text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg py-2">
            已掌握的字不足 {MIN_POOL} 个，已加入一些较熟悉的字一起练习
          </p>
        )}
        <ModeSelect poolSize={pool.length} bests={bests} onSelect={setMode} />
      </div>
    )
  }

  return <PinyinRound key={mode} pool={pool} mode={mode} onChangeMode={() => setMode(null)} />
}

interface ModeRoundProps {
  pool: string[]
  mode: PinyinMode
  onChangeMode: () => void
}

// A small wrapper component per mode, each calling exactly one mode hook.
// This keeps hooks unconditional (React's rule) while making sure a mode's
// ticker only ever runs while that mode is actually mounted: switching modes
// unmounts the old wrapper (PinyinPractice renders ModeSelect, or a fresh
// `key={mode}`d PinyinRound, in between), it never keeps ticking in the
// background the way calling every mode hook unconditionally would.
function FreeRound({ pool, mode, onChangeMode }: ModeRoundProps) {
  return <RoundView round={useFreeMode(pool)} mode={mode} onChangeMode={onChangeMode} />
}

function SprintRound({ pool, mode, onChangeMode }: ModeRoundProps) {
  return <RoundView round={useSprintMode(pool)} mode={mode} onChangeMode={onChangeMode} />
}

function SurvivalRound({ pool, mode, onChangeMode }: ModeRoundProps) {
  return <RoundView round={useSurvivalMode(pool)} mode={mode} onChangeMode={onChangeMode} />
}

function SpaceRound({ pool, mode, onChangeMode }: ModeRoundProps) {
  return <SpaceRoundView round={useSpaceMode(pool)} mode={mode} onChangeMode={onChangeMode} />
}

function PinyinRound({
  pool,
  mode,
  onChangeMode,
}: {
  pool: string[]
  mode: PinyinMode
  onChangeMode: () => void
}) {
  switch (mode) {
    case 'sprint':
      return <SprintRound pool={pool} mode={mode} onChangeMode={onChangeMode} />
    case 'survival':
      return <SurvivalRound pool={pool} mode={mode} onChangeMode={onChangeMode} />
    case 'space':
      return <SpaceRound pool={pool} mode={mode} onChangeMode={onChangeMode} />
    case 'free':
    default:
      return <FreeRound pool={pool} mode={mode} onChangeMode={onChangeMode} />
  }
}

function RoundView({
  round,
  mode,
  onChangeMode,
}: {
  round: RoundApi
  mode: PinyinMode
  onChangeMode: () => void
}) {
  const composer = useAnswerComposer({ char: round.char, onResult: round.onResult })
  const coinsEarned = useRoundCoins(mode, round.status)

  if (round.status === 'over') {
    return (
      <RoundSummary
        summary={round.summary}
        onRestart={round.restart}
        onChangeMode={onChangeMode}
        coinsEarned={coinsEarned}
      />
    )
  }

  if (!round.char) return null

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <Hud hud={round.hud} paused={round.paused} onPause={round.togglePause} onExit={onChangeMode} />
      <div className="relative space-y-3">
        <CharacterCard char={round.char} phase={composer.phase} revealed={composer.revealed} />
        <AnswerSlots
          answer={composer.answer}
          phase={composer.phase}
          onRemove={composer.removeAt}
          onBackspace={composer.backspace}
        />
        <PinyinKeyboard disabled={composer.phase !== 'input'} canTone={composer.canTone} onTap={composer.tap} />
        {round.paused && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/85 backdrop-blur-sm">
            <p className="text-xl font-bold text-slate-600">已暂停</p>
            <button
              type="button"
              onClick={round.togglePause}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
            >
              继续
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// 太空射击 gets its own round view rather than a branch inside RoundView:
// CharacterCard is replaced by SpaceArena (which needs the live invaders
// list, not just the current char), and the 🔊 button moves into the Hud
// row since there's no card to put it on. The char can briefly be null
// between waves (all invaders resolved, next one not spawned yet) without
// the round being over, so — unlike RoundView — this never bails out to a
// blank screen while `status === 'playing'`.
function SpaceRoundView({
  round,
  mode,
  onChangeMode,
}: {
  round: SpaceRoundApi
  mode: PinyinMode
  onChangeMode: () => void
}) {
  const composer = useAnswerComposer({ char: round.char, onResult: round.onResult })
  const coinsEarned = useRoundCoins(mode, round.status)

  if (round.status === 'over') {
    return (
      <RoundSummary
        summary={round.summary}
        onRestart={round.restart}
        onChangeMode={onChangeMode}
        coinsEarned={coinsEarned}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <Hud
        hud={round.hud}
        paused={round.paused}
        onPause={round.togglePause}
        onExit={onChangeMode}
        onSpeak={round.char ? () => speak(round.char!) : undefined}
      />
      <div className="relative space-y-3">
        <SpaceArena invaders={round.invaders} targetChar={round.char} />
        <AnswerSlots
          answer={composer.answer}
          phase={composer.phase}
          onRemove={composer.removeAt}
          onBackspace={composer.backspace}
        />
        <PinyinKeyboard
          disabled={composer.phase !== 'input' || !round.char}
          canTone={composer.canTone}
          onTap={composer.tap}
        />
        {round.paused && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/85 backdrop-blur-sm">
            <p className="text-xl font-bold text-slate-600">已暂停</p>
            <button
              type="button"
              onClick={round.togglePause}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
            >
              继续
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
