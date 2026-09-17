import { useSyncExternalStore } from 'react'
import { speechStatus, subscribeSpeechStatus } from '../../lib/speech'
import type { SpeechStatus } from '../../lib/speech'

/** Live speech availability, re-rendering once the browser's voices load. */
export function useSpeechStatus(): SpeechStatus {
  return useSyncExternalStore(subscribeSpeechStatus, speechStatus, () => 'loading' as SpeechStatus)
}

export const SPEECH_HINTS: Record<SpeechStatus, string | null> = {
  ok: null,
  loading: null,
  unsupported: '这个浏览器不支持朗读',
  'no-zh-voice': '这个浏览器没有安装中文语音，无法朗读（iPad / 手机上可以）',
}
