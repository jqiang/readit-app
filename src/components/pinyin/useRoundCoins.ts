import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../../store/useLibraryStore'
import type { PinyinMode } from '../../types'
import type { RoundStatus } from './types'

/**
 * Awards the pinyin round-completion reward exactly once per finished round:
 * fires when `status` flips to `'over'`, and releases its guard when
 * `status` returns to `'playing'` — what `restart()` produces, since every
 * mode hook resets its own state without remounting — so the next round can
 * earn again. Shared by `RoundView` and `SpaceRoundView` in
 * `PinyinPractice.tsx`, the two call sites that between them cover all four
 * modes. Leaving a round early (status never reaches `'over'`) pays nothing.
 */
export function useRoundCoins(mode: PinyinMode, status: RoundStatus): number {
  const awardCoins = useLibraryStore((s) => s.awardCoins)
  const awardedRef = useRef(false)
  const [coinsEarned, setCoinsEarned] = useState(0)

  useEffect(() => {
    if (status !== 'over') {
      // Released so the next round (restart() resets state without
      // remounting) can earn again. No setState here: `coinsEarned` is only
      // ever read from the 'over' branch below, so a stale value sitting
      // unread while `status === 'playing'` is harmless.
      awardedRef.current = false
      return
    }
    if (awardedRef.current) return
    awardedRef.current = true
    setCoinsEarned(awardCoins('pinyin', mode))
  }, [status, mode, awardCoins])

  return coinsEarned
}
