import { ensureAccessToken } from './googleDrive'

const PICKER_MIME_TYPES = 'application/pdf,image/png,image/jpeg,image/webp'

export interface PickedFile {
  id: string
  name: string
  mimeType: string
}

let gapiLoadPromise: Promise<void> | null = null

function loadGapi(): Promise<void> {
  if (window.gapi?.load) return Promise.resolve()
  if (gapiLoadPromise) return gapiLoadPromise
  gapiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('无法加载 Google Picker 脚本，请检查网络连接'))
    document.head.appendChild(script)
  })
  return gapiLoadPromise
}

function loadPicker(): Promise<void> {
  return new Promise((resolve, reject) => {
    window.gapi!.load('picker', () => {
      if (window.google?.picker) resolve()
      else reject(new Error('加载 Google Picker 失败'))
    })
  })
}

/** Open the Google Drive file picker, scoped to PDFs and images. Returns null if the user cancels. */
export async function pickDriveFile(): Promise<PickedFile | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
  if (!apiKey) throw new Error('未配置 VITE_GOOGLE_API_KEY')
  const appId = import.meta.env.VITE_GOOGLE_PROJECT_NUMBER

  const [token] = await Promise.all([ensureAccessToken(), loadGapi()])
  if (!window.google?.picker) await loadPicker()

  const picker = window.google!.picker

  return new Promise<PickedFile | null>((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setMimeTypes(PICKER_MIME_TYPES)

      let builder = new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setOrigin(window.location.origin)
      if (appId) builder = builder.setAppId(appId)

      // The Picker UI runs in an iframe and never invokes setCallback if it
      // fails to load (e.g. invalid API key/origin) — fail loudly instead of
      // hanging in the "extracting" stage forever.
      const timer = setTimeout(
        () => reject(new Error('打开 Google Picker 超时，请检查 API Key 配置后重试')),
        5 * 60_000,
      )

      builder = builder.setCallback((data) => {
        console.debug('[googleDrivePicker] callback', data)
        if (data.action === picker.Action.PICKED) {
          clearTimeout(timer)
          const doc = data.docs?.[0]
          if (doc) {
            resolve({ id: doc.id, name: doc.name, mimeType: doc.mimeType })
            return
          }
        }
        if (data.action === picker.Action.CANCEL) {
          clearTimeout(timer)
          resolve(null)
        }
      })

      builder.build().setVisible(true)
    } catch (err) {
      console.error('[googleDrivePicker] failed to open picker', err)
      reject(err instanceof Error ? err : new Error('打开 Google Picker 失败'))
    }
  })
}
