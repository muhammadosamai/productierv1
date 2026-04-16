function hasHtmlTag(input: string): boolean {
  return /<[a-z][\s\S]*>/i.test(input)
}

export function richTextPreviewText(input = ''): string {
  const raw = input
  if (!raw.trim()) return ''
  if (!hasHtmlTag(raw)) return raw.replaceAll(/\s+/g, ' ').trim()
  return raw
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

export function previewWithEllipsis(input = '', max = 100): string {
  const text = richTextPreviewText(input)
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}
