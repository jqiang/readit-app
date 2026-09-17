/**
 * Browser speech synthesis helpers (`zh-CN`), shared by ReviewMode and /pinyin.
 *
 * Robustness notes (all real-world failure modes of `speechSynthesis`):
 * - Voices load asynchronously in Chrome/Safari; we pick a Chinese voice
 *   explicitly once `voiceschanged` fires instead of relying on `lang` alone.
 * - Chrome garbage-collects an utterance that is not referenced anywhere and
 *   silently drops it, so the current utterance is kept in a module variable.
 * - `cancel()` immediately followed by `speak()` swallows the new utterance on
 *   some engines, so the speak is deferred by a tick when something was playing.
 * - Chrome can get stuck in a paused state after backgrounding; `resume()` first.
 * - Some browsers (e.g. Chrome on Linux) ship no voices at all — `speechStatus()`
 *   lets the UI explain that instead of failing silently.
 */

export type SpeechStatus = 'unsupported' | 'loading' | 'no-zh-voice' | 'ok'

let zhVoice: SpeechSynthesisVoice | null = null
let voicesKnown = false
let current: SpeechSynthesisUtterance | null = null
const listeners = new Set<() => void>()

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  return window.speechSynthesis
}

function pickVoice() {
  const s = synth()
  if (!s) return
  const voices = s.getVoices()
  if (voices.length === 0) return
  voicesKnown = true
  zhVoice =
    voices.find((v) => /^zh[-_]?(CN|Hans)?$/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang)) ??
    voices.find((v) => /^cmn/i.test(v.lang)) ??
    null
  listeners.forEach((fn) => fn())
}

const initial = synth()
if (initial) {
  pickVoice()
  initial.addEventListener?.('voiceschanged', pickVoice)
  // Safari never fires `voiceschanged` when voices are ready at load; poll briefly.
  if (!voicesKnown) {
    let tries = 0
    const timer = window.setInterval(() => {
      pickVoice()
      if (voicesKnown || ++tries > 20) window.clearInterval(timer)
    }, 250)
  }
}

/** Current availability of Chinese speech in this browser. */
export function speechStatus(): SpeechStatus {
  if (!synth()) return 'unsupported'
  if (!voicesKnown) return 'loading'
  return zhVoice ? 'ok' : 'no-zh-voice'
}

/** Subscribe to speech status changes (voices loading); returns an unsubscribe. */
export function subscribeSpeechStatus(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Speak `text` aloud. Returns the status at the time of the call. */
export function speak(text: string): SpeechStatus {
  const s = synth()
  if (!s) return 'unsupported'
  if (!voicesKnown) pickVoice()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = zhVoice?.lang ?? 'zh-CN'
  if (zhVoice) utterance.voice = zhVoice
  utterance.rate = 0.9
  current = utterance
  utterance.onend = utterance.onerror = () => {
    if (current === utterance) current = null
  }

  const wasBusy = s.speaking || s.pending
  if (wasBusy) s.cancel()
  const go = () => {
    s.resume()
    s.speak(utterance)
  }
  if (wasBusy) window.setTimeout(go, 0)
  else go()
  return speechStatus()
}
