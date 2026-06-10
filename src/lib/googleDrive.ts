import type { CharacterStats, ReadingSession } from '../types'

const SCOPES =
  'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly'
const FILE_NAME = 'readit-library.json'
const PASSAGE_FOLDER_NAME = 'ReadIt 课文'

interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

interface TokenClient {
  callback: (response: TokenResponse) => void
  requestAccessToken(overrideConfig?: { prompt?: string }): void
}

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
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
          }): TokenClient
          revoke(token: string, callback: () => void): void
        }
      }
      picker: {
        PickerBuilder: new () => PickerBuilder
        DocsView: new (viewId?: string) => PickerDocsView
        ViewId: { DOCS: string }
        Action: { PICKED: string; CANCEL: string }
      }
    }
  }
}

export interface LibraryBackup {
  characters: Record<string, CharacterStats>
  sessions: ReadingSession[]
}

export interface DriveUser {
  email: string
  name: string
}

const TOKEN_STORAGE_KEY = 'readit-drive-token'

interface StoredToken {
  accessToken: string
  expiresAt: number
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

function storeToken(token: string, expiresAt: number): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ accessToken: token, expiresAt }))
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

let tokenClient: TokenClient | null = null
let accessToken: string | null = null
let tokenExpiresAt = 0
let gsiLoadPromise: Promise<void> | null = null

export function isConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
}

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gsiLoadPromise) return gsiLoadPromise
  gsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('无法加载 Google 登录脚本，请检查网络连接'))
    document.head.appendChild(script)
  })
  return gsiLoadPromise
}

async function ensureTokenClient(): Promise<TokenClient> {
  await loadGsi()
  if (!tokenClient) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) throw new Error('未配置 VITE_GOOGLE_CLIENT_ID')
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: () => {},
    })
  }
  return tokenClient
}

/**
 * Get a valid access token, requesting one from Google if needed.
 * Reuses a cached token from `localStorage` across page reloads while it's
 * still valid. `interactive=false` falls back to a silent (no-UI) refresh;
 * `interactive=true` shows the Google account/consent prompt.
 */
async function requestToken(interactive: boolean): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken

  const stored = loadStoredToken()
  if (stored && Date.now() < stored.expiresAt - 60_000) {
    accessToken = stored.accessToken
    tokenExpiresAt = stored.expiresAt
    return accessToken
  }

  const client = await ensureTokenClient()

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(
      () => {
        if (settled) return
        settled = true
        reject(new Error('需要重新连接 Google Drive'))
      },
      interactive ? 60_000 : 3_000,
    )

    client.callback = (resp) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (resp.error || !resp.access_token) {
        reject(new Error(resp.error_description || resp.error || '授权失败'))
        return
      }
      accessToken = resp.access_token
      tokenExpiresAt = Date.now() + Number(resp.expires_in) * 1000
      storeToken(accessToken, tokenExpiresAt)
      resolve(accessToken)
    }
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })
}

export function disconnect(): void {
  if (accessToken) {
    window.google?.accounts.oauth2.revoke(accessToken, () => {})
  }
  accessToken = null
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

/** Connect (or reconnect) to Google Drive, prompting for consent if needed. */
export async function connect(): Promise<DriveUser> {
  const token = await requestToken(true)
  return getDriveUser(token)
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

/** Push the local library (characters + sessions) to the hidden Drive app-data folder. */
export async function pushLibrary(data: LibraryBackup): Promise<void> {
  const token = await requestToken(false)
  const existing = await findBackupFile(token)
  await uploadBackupFile(token, JSON.stringify(data), existing?.id ?? null)
}

/** Pull the library backup from Drive, or null if no backup exists yet. */
export async function pullLibrary(): Promise<LibraryBackup | null> {
  const token = await requestToken(false)
  const existing = await findBackupFile(token)
  if (!existing) return null
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`下载云端备份失败 (${res.status})`)
  return res.json()
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
