import { describe, expect, it } from 'vitest'
import {
  BASE_WEIGHT,
  HALF_LIFE_MS,
  MAX_WEIGHT,
  buildQueue,
  charComponents,
  charReadings,
  charWeight,
  checkAnswer,
  classifyMistakes,
  componentWeight,
  decayScore,
  applyAnswer,
  bumpConfusion,
  joinAnswer,
  normaliseU,
  pickNext,
  type Answer,
} from './pinyinPractice'
import type { ConfusionStat, PinyinCharStat } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/** A tiny deterministic linear-congruential generator for reproducible sampler tests. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function answer(over: Partial<Answer>): Answer {
  return { initial: null, finals: [], tone: null, ...over }
}

describe('joinAnswer', () => {
  it('joins initial and finals, treating a null initial as empty', () => {
    expect(joinAnswer(answer({ initial: 'g', finals: ['u', 'ang'] }))).toBe('guang')
    expect(joinAnswer(answer({ finals: ['ai'] }))).toBe('ai')
  })
})

describe('normaliseU', () => {
  it('maps ü to u only after j/q/x/y', () => {
    expect(normaliseU('jü')).toBe('ju')
    expect(normaliseU('xüe')).toBe('xue')
    expect(normaliseU('nü')).toBe('nü')
  })
})

describe('checkAnswer — accepted', () => {
  const accepted: Array<[string, Answer]> = [
    ['光', answer({ initial: 'g', finals: ['u', 'ang'], tone: 1 })],
    ['花', answer({ initial: 'h', finals: ['u', 'a'], tone: 1 })],
    ['一', answer({ initial: 'y', finals: ['i'], tone: 1 })],
    ['鱼', answer({ initial: 'y', finals: ['ü'], tone: 2 })],
    ['鱼', answer({ initial: 'y', finals: ['u'], tone: 2 })],
    ['句', answer({ initial: 'j', finals: ['ü'], tone: 4 })],
    ['句', answer({ initial: 'j', finals: ['u'], tone: 4 })],
    ['学', answer({ initial: 'x', finals: ['ü', 'e'], tone: 2 })],
    ['学', answer({ initial: 'x', finals: ['üe'], tone: 2 })],
    ['女', answer({ initial: 'n', finals: ['ü'], tone: 3 })],
    ['的', answer({ initial: 'd', finals: ['e'], tone: 0 })],
    ['的', answer({ initial: 'd', finals: ['i'], tone: 4 })],
    ['爱', answer({ initial: null, finals: ['ai'], tone: 4 })],
    ['略', answer({ initial: 'l', finals: ['üe'], tone: 4 })],
    ['知', answer({ initial: 'zh', finals: ['i'], tone: 1 })],
    ['六', answer({ initial: 'l', finals: ['iu'], tone: 4 })],
    ['云', answer({ initial: 'y', finals: ['ün'], tone: 2 })],
    ['云', answer({ initial: 'y', finals: ['un'], tone: 2 })],
  ]

  it.each(accepted)('accepts %s with %o', (char, a) => {
    expect(checkAnswer(char, a).correct).toBe(true)
  })
})

describe('checkAnswer — rejected', () => {
  it('rejects 女 spelled n+u (ü→u only applies after j/q/x/y)', () => {
    expect(checkAnswer('女', answer({ initial: 'n', finals: ['u'], tone: 3 })).correct).toBe(false)
  })

  it('rejects 爱 with a spurious y initial', () => {
    expect(checkAnswer('爱', answer({ initial: 'y', finals: ['ai'], tone: 4 })).correct).toBe(false)
  })

  it('rejects the right spelling with the wrong tone', () => {
    expect(checkAnswer('光', answer({ initial: 'g', finals: ['u', 'ang'], tone: 2 })).correct).toBe(
      false,
    )
  })

  it('closest reveals the plain reading, not a polyphonic alternative', () => {
    const { closest } = checkAnswer('的', answer({ initial: 'd', finals: ['e'], tone: 2 }))
    expect(closest.display).toBe('de')
  })
})

describe('classifyMistakes', () => {
  it('flags an initial confusion (z for zh)', () => {
    const expected = charReadings('知')[0]
    const mistakes = classifyMistakes(expected, answer({ initial: 'z', finals: ['i'], tone: 1 }))
    expect(mistakes).toEqual([{ kind: 'initial', key: 'zh→z' }])
  })

  it('flags a final confusion (in vs ing)', () => {
    const expected = charReadings('心')[0]
    const mistakes = classifyMistakes(expected, answer({ initial: 'x', finals: ['ing'], tone: 1 }))
    expect(mistakes).toEqual([{ kind: 'final', key: 'in→ing' }])
  })

  it('flags a missing medial (光 spelled g+ang)', () => {
    const expected = charReadings('光')[0]
    const mistakes = classifyMistakes(expected, answer({ initial: 'g', finals: ['ang'], tone: 1 }))
    expect(mistakes).toEqual([{ kind: 'medial', key: 'missing-u' }])
  })

  it('flags an extra medial (大 spelled d+i+a)', () => {
    const expected = charReadings('大')[0]
    const mistakes = classifyMistakes(
      expected,
      answer({ initial: 'd', finals: ['i', 'a'], tone: 4 }),
    )
    expect(mistakes).toEqual([{ kind: 'medial', key: 'extra-i' }])
  })

  it('flags a tone confusion (2 vs 3)', () => {
    const expected = charReadings('鱼')[0]
    const mistakes = classifyMistakes(expected, answer({ initial: 'y', finals: ['u'], tone: 3 }))
    expect(mistakes).toEqual([{ kind: 'tone', key: '2→3' }])
  })
})

describe('decayScore', () => {
  it('halves every HALF_LIFE_MS', () => {
    expect(decayScore(1, 0, HALF_LIFE_MS)).toBeCloseTo(0.5)
  })

  it('a 14-day-old mistake decays to a quarter', () => {
    expect(decayScore(1, 0, 14 * DAY_MS)).toBeCloseTo(0.25)
  })
})

describe('applyAnswer', () => {
  it('starts a fresh stat from an undefined previous one', () => {
    const stat = applyAnswer(undefined, false, 1000)
    expect(stat).toEqual({
      attempts: 1,
      wrong: 1,
      wrongScore: 1,
      updatedAt: 1000,
      lastSeen: 1000,
      lastWrong: 1000,
    })
  })

  it('decays the previous wrongScore before adding this attempt', () => {
    const prev: PinyinCharStat = {
      attempts: 1,
      wrong: 1,
      wrongScore: 1,
      updatedAt: 0,
      lastSeen: 0,
      lastWrong: 0,
    }
    const stat = applyAnswer(prev, false, HALF_LIFE_MS)
    expect(stat.attempts).toBe(2)
    expect(stat.wrong).toBe(2)
    expect(stat.wrongScore).toBeCloseTo(1.5) // 0.5 (decayed) + 1 (this miss)
  })

  it('a correct answer still decays the score but adds nothing, and keeps lastWrong', () => {
    const prev: PinyinCharStat = {
      attempts: 1,
      wrong: 1,
      wrongScore: 1,
      updatedAt: 0,
      lastSeen: 0,
      lastWrong: 0,
    }
    const stat = applyAnswer(prev, true, HALF_LIFE_MS)
    expect(stat.wrong).toBe(1)
    expect(stat.wrongScore).toBeCloseTo(0.5)
    expect(stat.lastWrong).toBe(0)
  })
})

describe('bumpConfusion', () => {
  it('starts at 1 and decays a previous score before adding', () => {
    expect(bumpConfusion(undefined, 1000)).toEqual({ score: 1, updatedAt: 1000 })
    const prev: ConfusionStat = { score: 1, updatedAt: 0 }
    const stat = bumpConfusion(prev, HALF_LIFE_MS)
    expect(stat.score).toBeCloseTo(1.5)
  })
})

describe('charComponents', () => {
  it('lists initial/medial/final/tone components, using ∅ for no initial', () => {
    expect(charComponents(charReadings('光')[0])).toEqual([
      'initial:g',
      'medial:u',
      'final:uang',
      'tone:1',
    ])
    expect(charComponents(charReadings('爱')[0])).toEqual(['initial:∅', 'final:ai', 'tone:4'])
  })
})

describe('componentWeight', () => {
  it('is symmetric — a final:in→ing confusion lifts both in and ing', () => {
    const now = 1000
    const confusions: Record<string, ConfusionStat> = {
      'final:in→ing': { score: 1, updatedAt: now },
    }
    expect(componentWeight(confusions, 'final:in', now)).toBeGreaterThan(0)
    expect(componentWeight(confusions, 'final:ing', now)).toBeGreaterThan(0)
    expect(componentWeight(confusions, 'final:ang', now)).toBe(0)
  })
})

describe('charWeight', () => {
  it('clamps at MAX_WEIGHT even with a huge wrongScore', () => {
    const now = 1000
    const charStats: Record<string, PinyinCharStat> = {
      光: { attempts: 100, wrong: 100, wrongScore: 1000, updatedAt: now, lastSeen: now },
    }
    expect(charWeight('光', charStats, {}, now)).toBe(MAX_WEIGHT)
  })

  it('an unseen character gets a small bump over BASE_WEIGHT', () => {
    expect(charWeight('光', {}, {}, 1000)).toBeCloseTo(BASE_WEIGHT + 0.5)
  })

  it('a final:in→ing confusion makes an "ing" character heavier than an unrelated one', () => {
    const now = 1000
    const confusions: Record<string, ConfusionStat> = {
      'final:in→ing': { score: 1, updatedAt: now },
    }
    const charStats: Record<string, PinyinCharStat> = {
      明: { attempts: 1, wrong: 0, wrongScore: 0, updatedAt: now, lastSeen: now },
      妈: { attempts: 1, wrong: 0, wrongScore: 0, updatedAt: now, lastSeen: now },
    }
    expect(charWeight('明', charStats, confusions, now)).toBeGreaterThan(
      charWeight('妈', charStats, confusions, now),
    )
  })
})

describe('pickNext', () => {
  it('picks the heaviest candidate with rng near 1', () => {
    const pool = ['a', 'b', 'c']
    const weights = [1, 1, 8]
    expect(pickNext(pool, weights, () => 0.99)).toBe('c')
  })

  it('never returns the excluded character', () => {
    const pool = ['a', 'b']
    const weights = [1, 1]
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(pickNext(pool, weights, () => r, 'a')).toBe('b')
    }
  })
})

describe('buildQueue', () => {
  const now = 1000

  it('returns n distinct characters when the pool is large enough', () => {
    const pool = ['一', '二', '三', '四', '五', '六', '七']
    const queue = buildQueue(pool, 5, {}, {}, now, seededRng(42))
    expect(queue).toHaveLength(5)
    expect(new Set(queue).size).toBe(5)
    for (const c of queue) expect(pool).toContain(c)
  })

  it('returns the whole (shuffled) pool when it is smaller than n', () => {
    const pool = ['一', '二', '三']
    const queue = buildQueue(pool, 5, {}, {}, now, seededRng(7))
    expect(new Set(queue)).toEqual(new Set(pool))
    expect(queue).toHaveLength(3)
  })
})
