import { pinyin } from 'pinyin-pro'

const cache = new Map<string, string>()

/** Pinyin (with tone marks) for a single Chinese character, memoized. */
export function charPinyin(char: string): string {
  const cached = cache.get(char)
  if (cached !== undefined) return cached
  const result = pinyin(char, { toneType: 'symbol', type: 'string' })
  cache.set(char, result)
  return result
}

/** Whether a character is a CJK ideograph we track/quiz on. */
export function isChineseChar(char: string): boolean {
  return /[一-鿿]/.test(char)
}
