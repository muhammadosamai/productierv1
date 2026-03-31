import DOMPurify, { type Config } from 'dompurify'

const SANITIZE_OPTIONS: Config = {
  USE_PROFILES: { html: true },
}

export function sanitizeHtml(value: string): string {
  if (!value) return ''
  return String(DOMPurify.sanitize(value, SANITIZE_OPTIONS))
}
