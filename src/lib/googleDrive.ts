import { mergeLibraries, type LibraryBackup } from './librarySync'

export type { LibraryBackup } from './librarySync'

const SCOPES =
  'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly'
const FILE_NAME = 'readit-library.json'
const PASSAGE_FOLDER_NAME = 'ReadIt 课文'

export interface PickerDocsView {
  setIncludeFolders(include: boolean): PickerDocsView
  setMimeTypes(mimeTypes: string): PickerDocsView
}

export interface PickerResponse {
  action: string
  docs?: Array<{ id: string; name: string; mimeType: string }>
}

export interface GooglePicker {
  setVisible(visible: boolean): void
}

export interface PickerBuilder {
  addView(view: PickerDocsView | string): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(appId: string): PickerBuilder
  setOrigin(origin: string): PickerBuilder
  setCallback(callback: (data: PickerResponse) => void): PickerBuilder
  build(): GooglePicker
}

declare global {
  interface Window {
    gapi?: {
      load(api: string, callback: () => void): void
    }
    google?: {
      picker: {
        PickerBuilder: new () => PickerBuilder
        DocsView: new (viewId?: string) => PickerDocsView
        ViewId: { DOCS: string }
        Action: { PICKED: string; CANCEL: string }
      }
    }
  }
}

export interface DriveUser {
  email: string
  name: string
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

const TOKEN_STORAGE_KEY = 'readit-drive-token'
const OAUTH_STATE_KEY = 'readit-oauth-state'
const OAUTH_RETURN_HASH_KEY = 'readit-oauth-return-hash'

interface StoredToken {
  accessToken: string
  expiresAt: number
  refreshToken?: string
}

function loadStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredToken>
    if (typeof parsed.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') return null
    return parsed as StoredToken
  } catch {
    return null
  }
}

function storeToken(accessToken: string, expiresAt: number, refreshToken: string | null): void {
  try {
    const data: StoredToken = { accessToken, expiresAt }
    if (refreshToken) data.refreshToken = refreshToken
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage unavailable (e.g. private browsing) — token just won't survive a reload
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // ignore
  }
}

let accessToken: string | null = null
let tokenExpiresAt = 0
let refreshToken: string | null = null

export function isConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
}

/** The redirect URI Google sends the user back to after sign-in. Must match
 * an "Authorized redirect URI" registered on the OAuth client exactly,
 * including the trailing slash. */
function getRedirectUri(): string {
  return `${window.location.origin}/`
}

function buildAuthUrl(state: string): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('未配置 VITE_GOOGLE_CLIENT_ID')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/**
 * Start (or restart) the Google OAuth flow via a full-page redirect to
 * Google's consent screen. Does not return — the page navigates away.
 */
export function connect(): void {
  const state = crypto.randomUUID()
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  sessionStorage.setItem(OAUTH_RETURN_HASH_KEY, window.location.hash)
  window.location.href = buildAuthUrl(state)
}

/**
 * Process the `?code=...` / `?error=...` query params left by Google after
 * `connect()` redirects back here: exchanges the code for tokens via
 * `/api/google-token`, restores the pre-redirect hash route, and returns the
 * connected user. Returns `null` if there was no redirect to handle.
 */
export async function handleOAuthRedirect(): Promise<DriveUser | null> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')
  const returnedState = params.get('state')
  if (!code && !error) return null

  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  const returnHash = sessionStorage.getItem(OAUTH_RETURN_HASH_KEY) ?? ''
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_RETURN_HASH_KEY)

  // Clean ?code/?state/?error from the URL and restore the route the user was on.
  // `replaceState` doesn't fire `popstate`, so `HashRouter` (whose history
  // listens for `popstate`, not `hashchange`) won't notice the new hash on its
  // own — dispatch one so it re-renders the restored route.
  window.history.replaceState({ ...window.history.state }, '', window.location.pathname + returnHash)
  window.dispatchEvent(new PopStateEvent('popstate'))

  if (error) throw new Error(`Google 授权失败：${error}`)
  if (returnedState !== expectedState) throw new Error('登录状态校验失败，请重试')

  const res = await fetch('/api/google-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant: 'authorization_code',
      code,
      redirectUri: getRedirectUri(),
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Google 登录失败 (${res.status})`)
  }
  const data: GoogleTokenResponse = await res.json()
  accessToken = data.access_token
  tokenExpiresAt = Date.now() + data.expires_in * 1000
  refreshToken = data.refresh_token ?? null
  storeToken(accessToken, tokenExpiresAt, refreshToken)
  return getDriveUser(accessToken)
}

/**
 * Get a valid access token, refreshing via `/api/google-token` if needed.
 * `interactive=false` throws if there's no usable refresh token (used by
 * background sync); `interactive=true` falls back to a full-page redirect to
 * Google's consent screen via `connect()`.
 */
async function requestToken(interactive: boolean): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken

  const stored = loadStoredToken()
  if (stored) {
    accessToken = stored.accessToken
    tokenExpiresAt = stored.expiresAt
    refreshToken = stored.refreshToken ?? null
    if (Date.now() < tokenExpiresAt - 60_000) return accessToken
  }

  if (refreshToken) {
    try {
      const res = await fetch('/api/google-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant: 'refresh_token',
          refreshToken,
          clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        }),
      })
      if (res.ok) {
        const data: GoogleTokenResponse = await res.json()
        accessToken = data.access_token
        tokenExpiresAt = Date.now() + data.expires_in * 1000
        storeToken(accessToken, tokenExpiresAt, refreshToken)
        return accessToken
      }
      // Refresh token rejected (expired/revoked) — stop retrying it.
      refreshToken = null
      clearStoredToken()
    } catch {
      // Network error — leave the refresh token in place for next time.
    }
  }

  if (interactive) {
    connect()
    throw new Error('正在跳转到 Google 登录…')
  }
  throw new Error('需要重新连接 Google Drive')
}

/** Best-effort revoke of whatever token we have, then clear local state. */
export function disconnect(): void {
  const tokenToRevoke = refreshToken ?? accessToken
  if (tokenToRevoke) {
    void fetch('/api/google-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant: 'revoke', token: tokenToRevoke }),
    })
  }
  accessToken = null
  refreshToken = null
  tokenExpiresAt = 0
  clearStoredToken()
}

async function getDriveUser(token: string): Promise<DriveUser> {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`获取账号信息失败 (${res.status})`)
  const data = await res.json()
  return { email: data.user?.emailAddress ?? '', name: data.user?.displayName ?? '' }
}

/** Get a valid access token for the Drive Picker, prompting for consent if needed. */
export async function ensureAccessToken(): Promise<string> {
  return requestToken(true)
}

/** Download a file's raw content from Drive by file ID. */
export async function downloadFile(fileId: string): Promise<Blob> {
  const token = await requestToken(false)
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`下载文件失败 (${res.status})`)
  return res.blob()
}

const GOOGLE_APPS_MIME_PREFIX = 'application/vnd.google-apps.'

/**
 * Download a passage's text content. Files added by dragging into the Drive
 * web UI may get auto-converted to native Google Docs (mimeType
 * `application/vnd.google-apps.document`) while keeping their `.txt` name —
 * those can't be fetched with `alt=media` (403) and must use `/export`
 * instead.
 */
export async function downloadPassageText(fileId: string, mimeType: string): Promise<string> {
  const token = await requestToken(false)
  const url = mimeType.startsWith(GOOGLE_APPS_MIME_PREFIX)
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`下载文件失败 (${res.status})`)
  return res.text()
}

async function findBackupFile(token: string): Promise<{ id: string } | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${FILE_NAME}'`,
    fields: 'files(id)',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`查找云端备份失败 (${res.status})`)
  const data = await res.json()
  return data.files?.[0] ?? null
}

async function uploadBackupFile(
  token: string,
  content: string,
  fileId: string | null,
): Promise<void> {
  const metadata = fileId ? { name: FILE_NAME } : { name: FILE_NAME, parents: ['appDataFolder'] }
  const boundary = 'readit-sync-boundary'
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`

  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`同步到云端失败 (${res.status})`)
}

async function downloadBackupContent(token: string, fileId: string): Promise<LibraryBackup> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`下载云端备份失败 (${res.status})`)
  return res.json()
}

/**
 * Additively sync the local library to the hidden Drive app-data folder:
 * downloads the existing backup, merges it with `data` (union of characters +
 * sessions, with tombstones for explicit removals), and uploads the merged
 * result. A push can never silently drop characters from the cloud — only an
 * explicit tombstone removes one. Returns the merged backup so the caller can
 * converge local state to it.
 */
export async function pushLibrary(data: LibraryBackup): Promise<LibraryBackup> {
  const token = await requestToken(false)
  const existing = await findBackupFile(token)
  const merged = existing
    ? mergeLibraries(await downloadBackupContent(token, existing.id), data)
    : data
  await uploadBackupFile(token, JSON.stringify(merged), existing?.id ?? null)
  return merged
}

/** Pull the library backup from Drive, or null if no backup exists yet. */
export async function pullLibrary(): Promise<LibraryBackup | null> {
  const token = await requestToken(false)
  const existing = await findBackupFile(token)
  if (!existing) return null
  return downloadBackupContent(token, existing.id)
}

async function findPassageFolder(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    q: `mimeType='application/vnd.google-apps.folder' and name='${PASSAGE_FOLDER_NAME}' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`查找 Drive 文件夹失败 (${res.status})`)
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

async function createPassageFolder(token: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PASSAGE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  if (!res.ok) throw new Error(`创建 Drive 文件夹失败 (${res.status})`)
  const data = await res.json()
  return data.id
}

async function ensurePassageFolder(token: string): Promise<string> {
  const existing = await findPassageFolder(token)
  if (existing) return existing
  return createPassageFolder(token)
}

async function uploadPassageTextFile(
  token: string,
  folderId: string,
  fileName: string,
  content: string,
): Promise<void> {
  const metadata = { name: fileName, parents: [folderId], mimeType: 'text/plain' }
  const boundary = 'readit-passage-boundary'
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  if (!res.ok) throw new Error(`保存课文到 Drive 失败 (${res.status})`)
}

/**
 * Save an imported passage as a `.txt` file in a "ReadIt 课文" folder in the
 * user's Drive (created on first use). Best-effort: callers should treat
 * failures as non-fatal, since the passage is already saved locally.
 */
export async function savePassageToDrive(title: string, text: string): Promise<void> {
  const token = await requestToken(false)
  const folderId = await ensurePassageFolder(token)
  await uploadPassageTextFile(token, folderId, `${title}.txt`, text)
}

export interface DrivePassageFile {
  id: string
  name: string
  modifiedTime: string
  mimeType: string
}

/**
 * List the `.txt` files in the "ReadIt 课文" Drive folder, including ones
 * added manually (not just files this app uploaded). Returns an empty list
 * if the folder doesn't exist yet — does not create it.
 */
export async function listPassageFiles(): Promise<DrivePassageFile[]> {
  const token = await requestToken(false)
  const folderId = await findPassageFolder(token)
  if (!folderId) return []

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, modifiedTime, mimeType)',
    orderBy: 'name_natural',
    pageSize: '1000',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`获取课文列表失败 (${res.status})`)
  const data = await res.json()
  const files = (data.files ?? []) as DrivePassageFile[]
  return files.filter((f) => f.name.toLowerCase().endsWith('.txt'))
}
