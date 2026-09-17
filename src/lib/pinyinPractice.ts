import { convert, pinyin } from 'pinyin-pro'
import type { ConfusionStat, PinyinCharStat, PinyinMistake } from '../types'

// ---------------------------------------------------------------------------
// Tile tables (school-poster layout)
// ---------------------------------------------------------------------------

export const INITIALS = [
  'b', 'p', 'm', 'f',
  'd', 't', 'n', 'l',
  'g', 'k', 'h',
  'j', 'q', 'x',
  'zh', 'ch', 'sh', 'r',
  'z', 'c', 's',
  'y', 'w',
]

/** How many tiles from `INITIALS` sit in each school-poster row, in order. */
export const INITIAL_ROWS = [4, 4, 3, 3, 4, 3, 2]

export const FINAL_GROUPS = [
  { label: '单韵母', finals: ['a', 'o', 'e', 'i', 'u', 'ü'] },
  { label: '复韵母', finals: ['ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 'üe', 'er'] },
  { label: '前鼻韵母', finals: ['an', 'en', 'in', 'un', 'ün'] },
  { label: '后鼻韵母', finals: ['ang', 'eng', 'ing', 'ong'] },
]

export interface Tone {
  num: number
  mark: string
  label?: string
}

export const TONES: Tone[] = [
  { num: 1, mark: 'ˉ' },
  { num: 2, mark: 'ˊ' },
  { num: 3, mark: 'ˇ' },
  { num: 4, mark: 'ˋ' },
  { num: 0, mark: '·', label: '轻声' },
]

export interface Answer {
  initial: string | null
  finals: string[]
  tone: number | null
}

/** The empty/unanswered state, shared by `useAnswerComposer` (initial state,
 * reset after feedback) and `useSpaceMode` (scoring an invader that reached
 * the ground unanswered). */
export const EMPTY_ANSWER: Answer = { initial: null, finals: [], tone: null }

/** How long correct/wrong feedback stays on screen (and the active character
 * stays put) before a round advances to the next character. Shared by
 * `useAnswerComposer` (resets its own local input state) and each mode hook
 * (advances its char queue) so both happen in the same tick. */
export const FEEDBACK_MS = { correct: 600, wrong: 1500 } as const

// ---------------------------------------------------------------------------
// Readings (own cache, separate from lib/pinyin.ts's charPinyin map)
// ---------------------------------------------------------------------------

export interface Reading {
  display: string
  num: number
  initial: string
  head: string
  body: string
  tail: string
  toneless: string
}

const readingsCache = new Map<string, Reading[]>()

/** All readings of a single Chinese character, deduped by (toneless, tone). */
export function charReadings(char: string): Reading[] {
  const cached = readingsCache.get(char)
  if (cached) return cached

  const raw = pinyin(char, { type: 'all', multiple: true })
  const seen = new Set<string>()
  const readings: Reading[] = []
  for (const r of raw) {
    const toneless = r.initial + convert(r.finalHead + r.finalBody + r.finalTail, { format: 'toneNone' })
    const key = `${toneless}:${r.num}`
    if (seen.has(key)) continue
    seen.add(key)
    readings.push({
      display: r.pinyin,
      num: r.num,
      initial: r.initial,
      head: r.finalHead,
      body: r.finalBody,
      tail: r.finalTail,
      toneless,
    })
  }
  readingsCache.set(char, readings)
  return readings
}

/** ü → u after j/q/x/y, so j+ü and j+u (etc.) compare equal. */
export function normaliseU(s: string): string {
  return s.replace(/([jqxy])ü/g, '$1u')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function joinAnswer(a: Answer): string {
  return (a.initial ?? '') + a.finals.join('')
}

/** Toneless finals of a reading (initial excluded), e.g. 光 → 'uang'. */
function readingFinal(r: Reading): string {
  return convert(r.head + r.body + r.tail, { format: 'toneNone' })
}

export function checkAnswer(
  char: string,
  a: Answer,
): { correct: boolean; matched: Reading | null; closest: Reading } {
  const readings = charReadings(char)
  const joined = normaliseU(joinAnswer(a))

  let matched: Reading | null = null
  for (const r of readings) {
    if (normaliseU(r.toneless) === joined && a.tone === r.num) {
      matched = r
      break
    }
  }

  const gotFinals = normaliseU(a.finals.join(''))
  let closest = readings[0]
  let bestMismatches = Infinity
  for (const r of readings) {
    let mismatches = 0
    if ((a.initial ?? '') !== r.initial) mismatches++
    if (gotFinals !== normaliseU(readingFinal(r))) mismatches++
    if (a.tone !== r.num) mismatches++
    if (mismatches < bestMismatches) {
      bestMismatches = mismatches
      closest = r
    }
  }

  return { correct: matched !== null, matched, closest }
}

// ---------------------------------------------------------------------------
// Mistake classification
// ---------------------------------------------------------------------------

export function classifyMistakes(expected: Reading, a: Answer): PinyinMistake[] {
  const mistakes: PinyinMistake[] = []

  const gotInitial = a.initial ?? ''
  if (gotInitial !== expected.initial) {
    mistakes.push({ kind: 'initial', key: `${expected.initial || '∅'}→${gotInitial || '∅'}` })
  }

  const expF = normaliseU(readingFinal(expected))
  const gotF = normaliseU(a.finals.join(''))
  if (expF !== gotF) {
    if (expected.head && gotF === normaliseU(convert(expected.body + expected.tail, { format: 'toneNone' }))) {
      mistakes.push({ kind: 'medial', key: `missing-${expected.head}` })
    } else if (/^[iuü]/.test(gotF) && gotF.slice(1) === expF) {
      mistakes.push({ kind: 'medial', key: `extra-${gotF[0]}` })
    } else {
      mistakes.push({ kind: 'final', key: `${expF}→${gotF}` })
    }
  }

  if (a.tone !== expected.num) {
    mistakes.push({ kind: 'tone', key: `${expected.num}→${a.tone}` })
  }

  return mistakes
}

// ---------------------------------------------------------------------------
// Decay + weighted sampler
// ---------------------------------------------------------------------------

export const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

/** Exponentially decay `score` from time `from` to time `to`, half-life `HALF_LIFE_MS`. */
export function decayScore(score: number, from: number, to: number): number {
  return score * 0.5 ** ((to - from) / HALF_LIFE_MS)
}

export function applyAnswer(
  stat: PinyinCharStat | undefined,
  correct: boolean,
  now: number,
): PinyinCharStat {
  const decayed = stat ? decayScore(stat.wrongScore, stat.updatedAt, now) : 0
  return {
    attempts: (stat?.attempts ?? 0) + 1,
    wrong: (stat?.wrong ?? 0) + (correct ? 0 : 1),
    wrongScore: decayed + (correct ? 0 : 1),
    updatedAt: now,
    lastSeen: now,
    lastWrong: correct ? stat?.lastWrong : now,
  }
}

export function bumpConfusion(stat: ConfusionStat | undefined, now: number): ConfusionStat {
  const decayed = stat ? decayScore(stat.score, stat.updatedAt, now) : 0
  return { score: decayed + 1, updatedAt: now }
}

export const BASE_WEIGHT = 1
export const K_CHAR = 3
export const K_CONFUSION = 1.5
export const K_UNSEEN = 0.5
export const MAX_WEIGHT = 10

/** The (initial/medial/final/tone) components a reading is made of, keyed
 * the same way `classifyMistakes` keys confusions, so weights can look them
 * up symmetrically. */
export function charComponents(reading: Reading): string[] {
  const components = [`initial:${reading.initial || '∅'}`]
  if (reading.head) components.push(`medial:${reading.head}`)
  components.push(`final:${readingFinal(reading)}`)
  components.push(`tone:${reading.num}`)
  return components
}

/** Decayed confusion weight contributed by `comp` (e.g. `'final:ing'`),
 * matching any confusion of the same kind whose key names that value on
 * either side of `→` (or, for medial's `missing-x` / `extra-x` keys, names
 * it as the affected component). */
export function componentWeight(
  confusions: Record<string, ConfusionStat>,
  comp: string,
  now: number,
): number {
  const sep = comp.indexOf(':')
  const kind = comp.slice(0, sep)
  const value = comp.slice(sep + 1)

  let total = 0
  for (const [confKey, stat] of Object.entries(confusions)) {
    const confSep = confKey.indexOf(':')
    if (confKey.slice(0, confSep) !== kind) continue
    const key = confKey.slice(confSep + 1)
    const sides = key.includes('→') ? key.split('→') : [key.replace(/^(missing|extra)-/, '')]
    if (sides.includes(value)) {
      total += decayScore(stat.score, stat.updatedAt, now)
    }
  }
  return total
}

export function charWeight(
  char: string,
  charStats: Record<string, PinyinCharStat>,
  confusions: Record<string, ConfusionStat>,
  now: number,
): number {
  const stat = charStats[char]
  const wrongScore = stat ? decayScore(stat.wrongScore, stat.updatedAt, now) : 0

  const primary = charReadings(char)[0]
  const confusionSum = primary
    ? charComponents(primary).reduce((sum, comp) => sum + componentWeight(confusions, comp, now), 0)
    : 0

  const weight =
    BASE_WEIGHT + K_CHAR * wrongScore + K_CONFUSION * confusionSum + (stat ? 0 : K_UNSEEN)
  return Math.min(weight, MAX_WEIGHT)
}

/** Weighted-random pick from `pool` (parallel `weights`), never returning `exclude`. */
export function pickNext(
  pool: string[],
  weights: number[],
  rng: () => number,
  exclude?: string,
): string {
  const filtered: { char: string; weight: number }[] = []
  for (let i = 0; i < pool.length; i++) {
    if (pool[i] === exclude) continue
    filtered.push({ char: pool[i], weight: weights[i] })
  }
  const candidates =
    filtered.length > 0 ? filtered : pool.map((char, i) => ({ char, weight: weights[i] }))

  const total = candidates.reduce((sum, c) => sum + c.weight, 0)
  let r = rng() * total
  for (const c of candidates) {
    r -= c.weight
    if (r <= 0) return c.char
  }
  return candidates[candidates.length - 1].char
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Build a queue of `n` distinct characters, weighted toward weak ones. If
 * the pool has fewer than `n` characters, the whole (shuffled) pool is used. */
export function buildQueue(
  pool: string[],
  n: number,
  charStats: Record<string, PinyinCharStat>,
  confusions: Record<string, ConfusionStat>,
  now: number,
  rng: () => number,
): string[] {
  if (pool.length <= n) return shuffle(pool, rng)

  const remaining = [...pool]
  const queue: string[] = []
  for (let i = 0; i < n; i++) {
    const weights = remaining.map((c) => charWeight(c, charStats, confusions, now))
    const picked = pickNext(remaining, weights, rng)
    queue.push(picked)
    remaining.splice(remaining.indexOf(picked), 1)
  }
  return queue
}
