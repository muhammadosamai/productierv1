const DEFAULT_LOCALE = 'en-US'

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

export function formatShortDate(value: string | Date, locale = DEFAULT_LOCALE): string {
  const dateValue = toDate(value)
  return dateValue.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export function formatDateWithYear(value: string | Date, locale = DEFAULT_LOCALE): string {
  const dateValue = toDate(value)
  return dateValue.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value: string | Date, locale = DEFAULT_LOCALE): string {
  const dateValue = toDate(value)
  return dateValue.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
