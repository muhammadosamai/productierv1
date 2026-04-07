/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. https://api.example.com — no trailing slash. Prefix for `/uploads/*` in production. */
  readonly VITE_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
