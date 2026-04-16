function hasHtmlTag(input: string): boolean {
  return /<[a-z][\s\S]*>/i.test(input)
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderStoredRichText(input: string | null | undefined): string {
  const raw = input ?? ''
  if (!raw.trim()) return ''
  if (hasHtmlTag(raw)) return raw
  return escapeHtml(raw).replace(/\n/g, '<br />')
}

export function richTextPreviewText(input: string | null | undefined): string {
  const raw = input ?? ''
  if (!raw.trim()) return ''
  if (!hasHtmlTag(raw)) return raw.replace(/\s+/g, ' ').trim()

  if (typeof globalThis.window !== 'undefined' && typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = raw
    return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
