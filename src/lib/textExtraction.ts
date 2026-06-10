import Anthropic from '@anthropic-ai/sdk'

const EXTRACTION_PROMPT = `你将看到一张儿童中文课文的图片或 PDF 文档。请提取其中课文正文部分的文字，要求：
1. 只输出汉字课文正文，不要输出拼音、英文翻译、页眉页脚、页码、习题、插图说明等非正文内容。
2. 按原文的分行和段落顺序输出，不要合并或调整段落。
3. 不要添加任何解释、标题、Markdown 标记或其他多余内容，直接输出提取到的文字。
4. 如果完全没有可识别的课文文字，只输出：（未识别到课文内容）`

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(file.name)
}

/** Whether the Claude API key is configured (`VITE_ANTHROPIC_API_KEY` in `.env.local`). */
export function isClaudeConfigured(): boolean {
  return Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY)
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

/**
 * Extract the passage text from an image or PDF using the Claude API.
 * Throws if `VITE_ANTHROPIC_API_KEY` is not configured.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('未配置 VITE_ANTHROPIC_API_KEY，请按页面提示配置 Claude API 密钥')
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const data = await fileToBase64(file)

  const fileBlock = isPdfFile(file)
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: imageMediaType(file), data } } as const)

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: EXTRACTION_PROMPT }],
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
