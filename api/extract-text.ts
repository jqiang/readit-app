import { checkAllowedUser } from './_lib/googleAuth'

export const config = { runtime: 'edge' }

const EXTRACTION_PROMPT = `你将看到一张儿童中文课文的图片或 PDF 文档。请提取其中课文正文部分的文字，要求：
1. 只输出汉字课文正文，不要输出拼音、英文翻译、页眉页脚、页码、习题、插图说明等非正文内容。
2. 按原文的分行和段落顺序输出，不要合并或调整段落。
3. 不要添加任何解释、标题、Markdown 标记或其他多余内容，直接输出提取到的文字。
4. 如果完全没有可识别的课文文字，只输出：（未识别到课文内容）`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!process.env.ALLOWED_EMAIL) {
    return json({ error: '服务器未配置 ALLOWED_EMAIL' }, 500)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: '服务器未配置 ANTHROPIC_API_KEY' }, 500)
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const accessToken = authHeader.match(/^Bearer (.+)$/i)?.[1]
  if (!accessToken) return json({ error: '缺少 Google 登录凭证' }, 401)

  const auth = await checkAllowedUser(accessToken)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  let body: { data?: string; mediaType?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: '请求格式错误' }, 400)
  }
  const { data, mediaType } = body
  if (!data || !mediaType) return json({ error: '缺少 data 或 mediaType' }, 400)

  const fileBlock =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data } }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: EXTRACTION_PROMPT }],
        },
      ],
    }),
  })

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.json().catch(() => null)
    console.error('Anthropic API error', anthropicRes.status, errBody)
    if (anthropicRes.status === 401) {
      return json({ error: '服务器 Claude API 密钥配置错误' }, 500)
    }
    if (anthropicRes.status === 429) {
      return json({ error: 'Claude API 请求过于频繁，请稍后再试' }, 429)
    }
    return json(
      { error: `Claude API 出错：${errBody?.error?.message ?? anthropicRes.status}` },
      502,
    )
  }

  const message = await anthropicRes.json()
  const textBlock = (message.content ?? []).find(
    (block: { type: string }) => block.type === 'text',
  )
  return json({ text: (textBlock?.text ?? '').trim() })
}
