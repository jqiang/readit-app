import { useEffect, useRef, useState } from 'react'
import type { Invader } from './useSpaceMode'
import { SPACE_LANES } from './useSpaceMode'

const LASER_MS = 150

interface SpaceArenaProps {
  invaders: Invader[]
  /** The character the player is currently typing towards; highlighted with
   * a ring and a 👇 marker. */
  targetChar: string | null
}

interface LaserSpot {
  lane: number
  y: number
}

function lanePercent(lane: number): number {
  return ((lane + 0.5) / SPACE_LANES) * 100
}

export default function SpaceArena({ invaders, targetChar }: SpaceArenaProps) {
  const prevExplodingRef = useRef<Set<number>>(new Set())
  const [laser, setLaser] = useState<LaserSpot | null>(null)

  // Fire a brief laser bolt the moment an invader starts exploding (i.e. the
  // player just answered it correctly).
  useEffect(() => {
    const exploding = invaders.filter((inv) => inv.exploding)
    const newlyExploding = exploding.find((inv) => !prevExplodingRef.current.has(inv.id))
    prevExplodingRef.current = new Set(exploding.map((inv) => inv.id))
    if (!newlyExploding) return

    setLaser({ lane: newlyExploding.lane, y: newlyExploding.y })
    const timer = window.setTimeout(() => setLaser(null), LASER_MS)
    return () => window.clearTimeout(timer)
  }, [invaders])

  return (
    <div className="relative h-56 sm:h-64 rounded-2xl bg-slate-900 overflow-hidden">
      {laser && (
        <div
          className="absolute bottom-9 w-1 rounded-full bg-amber-300/90"
          style={{
            left: `${lanePercent(laser.lane)}%`,
            height: `${Math.max(0, (1 - laser.y) * 100 - 15)}%`,
            transform: 'translateX(-50%)',
          }}
        />
      )}

      {invaders.map((inv) => {
        const isTarget = inv.char === targetChar && !inv.exploding
        return (
          <div
            key={inv.id}
            className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 transition-[top] duration-75 ease-linear"
            style={{ left: `${lanePercent(inv.lane)}%`, top: `${Math.min(100, inv.y * 100)}%` }}
          >
            {isTarget && <span className="text-base leading-none mb-0.5">👇</span>}
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold text-white transition ${
                inv.exploding ? 'bg-amber-500 animate-invader-explode' : 'bg-indigo-500'
              } ${isTarget ? 'ring-4 ring-amber-400' : ''}`}
            >
              {inv.exploding ? '💥' : inv.char}
            </span>
          </div>
        )
      })}

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-3xl">🚀</div>
    </div>
  )
}
