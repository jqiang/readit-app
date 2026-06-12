export type AllowedUserResult =
  | { ok: true; email: string }
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 403; error: string }

/**
 * Check whether a Google access token belongs to the single allowlisted
 * account (`ALLOWED_EMAIL`), via the same `drive/v3/about` endpoint the
 * client already uses in `src/lib/googleDrive.ts` (works with the existing
 * `drive.*` scopes, no extra OAuth scopes needed).
 *
 * Callers must check `process.env.ALLOWED_EMAIL` themselves first and fail
 * closed (500) if it's unset — this never silently treats "unconfigured" as
 * "allowed".
 */
export async function checkAllowedUser(accessToken: string): Promise<AllowedUserResult> {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    return { ok: false, status: 401, error: '无效或已过期的 Google 登录' }
  }

  const data = await res.json()
  const email = (data.user?.emailAddress ?? '').toLowerCase()
  const allowed = (process.env.ALLOWED_EMAIL ?? '').toLowerCase()
  if (!email || email !== allowed) {
    return { ok: false, status: 403, error: '此 Google 账号无权访问此应用' }
  }
  return { ok: true, email }
}
