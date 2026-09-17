import { useState, type CSSProperties } from 'react'

const EMOJIS = ['🎉', '⭐', '✨', '🎊']
const PIECE_COUNT = 12

interface ConfettiPiece {
  id: number
  emoji: string
  dx: number
  dy: number
  delayMs: number
}

function makePieces(): ConfettiPiece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    id: i,
    emoji: EMOJIS[i % EMOJIS.length],
    dx: Math.round((Math.random() - 0.5) * 160),
    dy: Math.round(-90 - Math.random() * 70),
    delayMs: Math.round(Math.random() * 120),
  }))
}

/** 12 emoji bursting out from the center; give it a fresh `key` from the
 * parent (e.g. a counter bumped on every correct answer) to replay it. */
export default function Confetti() {
  const [pieces] = useState(makePieces)

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 text-2xl animate-confetti-fall"
          style={
            {
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              animationDelay: `${p.delayMs}ms`,
            } as CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
    </div>
  )
}
