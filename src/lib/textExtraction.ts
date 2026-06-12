import { ensureAccessToken } from './googleDrive'

const EXTRACTION_PROMPT = `你将看到一张儿童中文课文的图片或 PDF 文档。请提取其中课文正文部分的文字，要求：
1. 只输出汉字课文正文，不要输出拼音、英文翻译、页眉页脚、页码、习题、插图说明等非正文内容。
2. 按原文的分行和段落顺序输出，不要合并或调整段落。
3. 不要添加任何解释、标题、Markdown 标记或其他多余内容，直接输出提取到的文字。
4. 如果完全没有可识别的课文文字，只输出：（未识别到课文内容）`

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
type FileMediaType = 'application/pdf' | ImageMediaType

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(file.name)
}

/**
 * Whether to hide the dev-only "configure VITE_ANTHROPIC_API_KEY" banner.
 * In dev, direct browser calls need `VITE_ANTHROPIC_API_KEY`; without it,
 * extraction still works via `/api/extract-text` (e.g. under `npx vercel
 * dev` with the server-only vars set) but not under plain `npm run dev`,
 * which doesn't serve `/api`. In production this always returns `true` —
 * extraction always goes through the proxy there.
 */
export function isClaudeConfigured(): boolean {
  return import.meta.env.DEV ? Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY) : true
}

function imageMediaType(file: File): ImageMediaType {
  if (
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    file.type === 'image/gif' ||
    file.type === 'image/webp'
  ) {
    return file.type
  }
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function fileBlockFor(mediaType: FileMediaType, data: string) {
  return mediaType === 'application/pdf'
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: mediaType, data } } as const)
}

/** Dev-only direct browser call to the Claude API via `VITE_ANTHROPIC_API_KEY`. */
async function extractViaAnthropicSdk(mediaType: FileMediaType, data: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  })

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [fileBlockFor(mediaType, data), { type: 'text', text: EXTRACTION_PROMPT }],
        },
      ],
    })
    const message = await stream.finalMessage()
    const textBlock = message.content.find((block) => block.type === 'text')
    return textBlock?.text.trim() ?? ''
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error('Claude API 密钥无效，请检查 VITE_ANTHROPIC_API_KEY', { cause: err })
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error('Claude API 请求过于频繁，请稍后再试', { cause: err })
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Claude API 出错：${err.message}`, { cause: err })
    }
    throw err
  }
}

/** Production path: proxy through `/api/extract-text`, gated by Google sign-in. */
async function extractViaApi(mediaType: FileMediaType, data: string): Promise<string> {
  const token = await ensureAccessToken()
  const res = await fetch('/api/extract-text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data, mediaType }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `提取文字失败 (${res.status})`)
  }
  const result = await res.json()
  return result.text ?? ''
}

/** Extract the passage text from an image or PDF using the Claude API. */
export async function extractTextFromFile(file: File): Promise<string> {
  const data = await fileToBase64(file)
  const mediaType: FileMediaType = isPdfFile(file) ? 'application/pdf' : imageMediaType(file)

  if (import.meta.env.DEV && import.meta.env.VITE_ANTHROPIC_API_KEY) {
    return extractViaAnthropicSdk(mediaType, data)
  }
  return extractViaApi(mediaType, data)
}
