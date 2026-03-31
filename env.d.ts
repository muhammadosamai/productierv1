/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_NEW_ONBOARDING_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
