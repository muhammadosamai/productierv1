import type { NotificationItem } from '@/types/notification'
import { formatShortDate } from '@/lib/locale'

export function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    assignment: 'Assignment',
    workflow: 'Workflow',
    risk: 'Risk',
    quality: 'Quality',
    release: 'Release',
    admin: 'Admin',
    integration: 'Integration',
    digest: 'Digest',
  }
  return labels[category] || category
}

export function urgencyLabel(urgency: string): string {
  const labels: Record<string, string> = {
    action_required: 'Action required',
    watch: 'Watch',
    informational: 'Info',
  }
  return labels[urgency] || urgency
}

export function severityClass(severity: string): string {
  if (severity === 'critical') return 'bg-red-100 text-red-700'
  if (severity === 'high') return 'bg-amber-100 text-amber-700'
  if (severity === 'medium') return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-600'
}

export function urgencyClass(urgency: string): string {
  if (urgency === 'action_required') return 'bg-red-100 text-red-700'
  if (urgency === 'watch') return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

export function emphasisBorderClass(notification: NotificationItem): string {
  if (notification.urgency === 'action_required' || notification.severity === 'critical') return 'border-l-red-400'
  if (notification.severity === 'high') return 'border-l-amber-300'
  return 'border-l-transparent'
}

export function isSameLocalDay(value: string, reference = new Date()): boolean {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate()
}

export function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'now'
  const deltaMs = Date.now() - date.getTime()
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000))

  if (deltaMinutes < 1) return 'just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`
  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  const deltaDays = Math.floor(deltaHours / 24)
  if (deltaDays < 7) return `${deltaDays}d ago`
  return formatShortDate(date)
}
