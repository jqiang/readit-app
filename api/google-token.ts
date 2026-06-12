import { checkAllowedUser } from './_lib/googleAuth'

export const config = { runtime: 'edge' }

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function revokeToken(token: string): Promise<void> {
  await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(
    () => {},
  )
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientSecret) return json({ error: '服务器未配置 GOOGLE_CLIENT_SECRET' }, 500)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: '请求格式错误' }, 400)
  }

  if (body.grant === 'authorization_code') {
    const { code, redirectUri, clientId } = body as Record<string, string>
    if (!code || !redirectUri || !clientId) return json({ error: '缺少参数' }, 400)

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) {
      console.error('Google token exchange failed', tokenRes.status, await tokenRes.text())
      return json({ error: 'Google 授权失败，请重试' }, 502)
    }
    const tokenData = await tokenRes.json()

    if (!process.env.ALLOWED_EMAIL) return json({ error: '服务器未配置 ALLOWED_EMAIL' }, 500)
    const auth = await checkAllowedUser(tokenData.access_token)
    if (!auth.ok) {
      await revokeToken(tokenData.access_token)
      return json({ error: auth.error }, auth.status)
    }

    return json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
    })
  }

  if (body.grant === 'refresh_token') {
    const { refreshToken, clientId } = body as Record<string, string>
    if (!refreshToken || !clientId) return json({ error: '缺少参数' }, 400)

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    })
    if (!tokenRes.ok) {
      console.error('Google token refresh failed', tokenRes.status, await tokenRes.text())
      return json({ error: '刷新登录状态失败，请重新连接 Google Drive' }, 401)
    }
    const tokenData = await tokenRes.json()
    return json({ access_token: tokenData.access_token, expires_in: tokenData.expires_in })
  }

  if (body.grant === 'revoke') {
    const { token } = body as Record<string, string>
    if (token) await revokeToken(token)
    return json({ ok: true })
  }

  return json({ error: '不支持的 grant 类型' }, 400)
}
