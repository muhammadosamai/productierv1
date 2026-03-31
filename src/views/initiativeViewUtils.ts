import { formatDateWithYear, formatShortDate } from '@/lib/locale'

export function ratioPercent(count: number, total: number) {
  if (total <= 0) return 0
  return Math.round((count / total) * 100)
}

export function deliveryProgressColor(progress: number) {
  if (progress >= 80) return 'bg-green-500'
  if (progress >= 50) return 'bg-blue-500'
  if (progress >= 25) return 'bg-amber-500'
  return 'bg-gray-300'
}

export function priorityNumber(priority: string) {
  switch (priority) {
    case 'critical': return 1
    case 'high': return 2
    case 'medium': return 3
    case 'low': return 4
    default: return 4
  }
}

export function priorityCircleColor(priority: string) {
  switch (priority) {
    case 'critical': return 'bg-[#e2445c]'
    case 'high': return 'bg-[#fdab3d]'
    case 'medium': return 'bg-[#00c875]'
    case 'low': return 'bg-[#579bfc]'
    default: return 'bg-gray-400'
  }
}

export function formatDate(dateStr: string) {
  return formatShortDate(dateStr)
}

export function formatFullDate(dateStr: string) {
  return formatDateWithYear(dateStr)
}

export function daysAgo(dateStr: string): string {
  const created = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  return `${diffDays} days ago`
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const sStr = formatShortDate(start)
  const eStr = formatDateWithYear(end)
  return `${sStr} – ${eStr}`
}

export function formatTimelineRange(start: string | null, end: string | null): string {
  if (start && end) return formatPeriod(start, end)
  if (start) return `Starts ${formatDate(start)}`
  if (end) return `Ends ${formatDate(end)}`
  return 'No dates'
}
