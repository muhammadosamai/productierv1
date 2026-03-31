const SCHEMA_MISMATCH_ERROR_CODES = new Set([
  '42P01', // undefined_table
  '42703', // undefined_column
  '42704', // undefined_object
])

function extractErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const maybeCode = (error as { code?: unknown }).code
  return typeof maybeCode === 'string' ? maybeCode.toUpperCase() : ''
}

function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const maybeMessage = (error as { message?: unknown }).message
  return typeof maybeMessage === 'string' ? maybeMessage.toLowerCase() : ''
}

export function isSchemaMismatchError(error: unknown): boolean {
  if (!error) return false

  const code = extractErrorCode(error)
  if (SCHEMA_MISMATCH_ERROR_CODES.has(code)) return true

  const message = extractErrorMessage(error)
  if (
    message.includes('does not exist')
    && (
      message.includes('relation')
      || message.includes('column')
      || message.includes('table')
      || message.includes('index')
      || message.includes('trigger')
      || message.includes('type')
    )
  ) {
    return true
  }

  if (error && typeof error === 'object' && 'cause' in error) {
    const cause = (error as { cause?: unknown }).cause
    if (cause && cause !== error) return isSchemaMismatchError(cause)
  }

  return false
}

export function isMissingColumnError(error: unknown, columnToken: string): boolean {
  if (!columnToken.trim()) return false
  const code = extractErrorCode(error)
  const message = extractErrorMessage(error)
  return code === '42703' && message.includes(columnToken.toLowerCase())
}

export function schemaMismatchMessage(featureLabel = 'Database schema'): string {
  return `${featureLabel} is out of date. Run \`bun run db:migrate:safe\` before retrying.`
}
