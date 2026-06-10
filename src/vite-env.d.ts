/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  readonly VITE_GOOGLE_PROJECT_NUMBER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
