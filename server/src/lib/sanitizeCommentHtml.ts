import sanitizeHtml from 'sanitize-html'

function hasHtmlTag(input: string): boolean {
  return /<[a-z][\s\S]*>/i.test(input)
}

function isMeaningfulHtml(input: string): boolean {
  const text = input
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
  return text.length > 0
}

export function sanitizeCommentHtml(input = ''): string {
  const raw = input
  if (!raw.trim()) return ''
  if (!hasHtmlTag(raw)) return raw

  const cleaned = sanitizeHtml(raw, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'b',
      'i',
      'ul',
      'ol',
      'li',
      'a',
      'span',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'class'],
      span: ['class', 'data-type', 'data-id', 'data-label'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  })

  return isMeaningfulHtml(cleaned) ? cleaned : ''
}
