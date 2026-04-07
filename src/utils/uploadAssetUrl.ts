/**
 * DB stores paths like `/uploads/avatars/...`. Browsers load them via `/api/uploads/...` so a reverse
 * proxy that only forwards `/api/*` still reaches the Bun static handler (no `/uploads` rule needed).
 *
 * Optional `VITE_API_ORIGIN` (no trailing slash): prefix when the SPA is served from another host.
 *
 * Dev: Vite proxies `/api` to the API, so `/api/uploads/...` works without extra config.
 */
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')

function uploadsPathToBrowserUrl(pathAfterUploadsPrefix: string): string {
  const p = pathAfterUploadsPrefix.startsWith('/') ? pathAfterUploadsPrefix : `/${pathAfterUploadsPrefix}`
  return `/api/uploads${p}`
}

export function resolveUploadAssetUrl(path: string | null | undefined): string | null {
  if (path == null || path === '') return null
  const p = String(path).trim()
  if (/^https?:\/\//i.test(p)) return p
  if (p.startsWith('blob:') || p.startsWith('data:')) return p
  // Already using API-prefixed URL (e.g. after a future server change)
  if (p.startsWith('/api/uploads/')) {
    return API_ORIGIN ? `${API_ORIGIN}${p}` : p
  }
  if (p.startsWith('/uploads/')) {
    const rest = p.slice('/uploads'.length)
    const browserPath = uploadsPathToBrowserUrl(rest)
    return API_ORIGIN ? `${API_ORIGIN}${browserPath}` : browserPath
  }
  return p
}

/** Attachment `filePath` from the API (usually `/uploads/...`) for `<img src>` and download links. */
export function attachmentPublicUrl(path: string | null | undefined): string {
  if (path == null || path === '') return ''
  return resolveUploadAssetUrl(path) ?? path
}

/**
 * Rewrite `/uploads/...` in HTML (e.g. TipTap `img src`, `a href`, CSS `url()`) so assets load via `/api/uploads/...`
 * when the host only proxies `/api/*`.
 */
export function rewriteUploadUrlsInHtml(html: string): string {
  if (!html || !html.includes('/uploads/')) return html
  const repl = (path: string) => resolveUploadAssetUrl(path) || path
  let out = html
  out = out.replace(/(\ssrc=["'])(\/uploads\/[^"']+)(["'])/gi, (_, a: string, path: string, b: string) => `${a}${repl(path)}${b}`)
  out = out.replace(/(\shref=["'])(\/uploads\/[^"']+)(["'])/gi, (_, a: string, path: string, b: string) => `${a}${repl(path)}${b}`)
  out = out.replace(/(url\(\s*["']?)(\/uploads\/[^)"'\s]+)(["']?\s*\))/gi, (_, a: string, path: string, b: string) => `${a}${repl(path)}${b}`)
  return out
}

/** Convert browser `/api/uploads/...` (and optional `VITE_API_ORIGIN` prefix) back to stored `/uploads/...` paths. */
export function normalizeUploadUrlsForStorage(html: string): string {
  if (!html) return html
  let out = html
  if (API_ORIGIN) {
    out = out.replaceAll(`${API_ORIGIN}/api/uploads/`, '/uploads/')
  }
  out = out.replaceAll('/api/uploads/', '/uploads/')
  return out
}
