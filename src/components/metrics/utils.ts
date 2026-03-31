import { enumValueLabel } from '@/composables/useDomainOptions'

// Shared utility functions for metrics dashboard

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    // Story statuses
    backlog: '#c4c4c4', drafted: '#a25ddc', initialized: '#579bfc',
    completed: '#10B981',
    // Task statuses
    created: '#D1D5DB', assigned: '#a25ddc',
    in_progress: '#fdab3d', active: '#fdab3d',
    in_review: '#579bfc', done: '#10B981',
    blocked: '#EF4444', overdue: '#EF4444',
    paused: '#F59E0B', planning: '#fdab3d',
    archived: '#6B7280',
  }
  return colors[status] || '#9CA3AF'
}

export function statusBg(status: string): string {
  const colors: Record<string, string> = {
    // Story statuses
    backlog: 'bg-gray-50 text-gray-600', drafted: 'bg-purple-50 text-purple-700',
    initialized: 'bg-blue-50 text-blue-700', completed: 'bg-emerald-50 text-emerald-700',
    // Task statuses
    created: 'bg-gray-50 text-gray-600', assigned: 'bg-purple-50 text-purple-700',
    in_progress: 'bg-amber-50 text-amber-700', active: 'bg-amber-50 text-amber-700',
    in_review: 'bg-blue-50 text-blue-700', done: 'bg-emerald-50 text-emerald-700',
    blocked: 'bg-red-50 text-red-700', overdue: 'bg-red-50 text-red-700',
    paused: 'bg-amber-50 text-amber-700', planning: 'bg-amber-50 text-amber-700',
    archived: 'bg-gray-50 text-gray-500',
  }
  return colors[status] || 'bg-gray-50 text-gray-600'
}

export function priorityColor(priority: string): string {
  const colors: Record<string, string> = {
    critical: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#22C55E',
  }
  return colors[priority] || '#9CA3AF'
}

export function statusLabel(s: string): string {
  return enumValueLabel(s)
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function formatDays(n: number): string {
  if (n < 1) return '< 1 day'
  if (n === 1) return '1 day'
  return `${Math.round(n * 10) / 10} days`
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function percentChange(current: number, previous: number): { value: number; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { value: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat' }
  const change = Math.round(((current - previous) / previous) * 100)
  return { value: Math.abs(change), direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' }
}

// Common chart colors palette
export const CHART_COLORS = {
  primary: '#4857FE',
  primaryLight: 'rgba(72,87,254,0.1)',
  success: '#10B981',
  successLight: 'rgba(16,185,129,0.1)',
  danger: '#EF4444',
  dangerLight: 'rgba(239,68,68,0.1)',
  warning: '#F59E0B',
  warningLight: 'rgba(245,158,11,0.1)',
  purple: '#8B5CF6',
  purpleLight: 'rgba(139,92,246,0.1)',
  sky: '#0EA5E9',
  skyLight: 'rgba(14,165,233,0.1)',
  gray: '#9CA3AF',
  grayLight: 'rgba(156,163,175,0.1)',
}

export const STATUS_CHART_COLORS: Record<string, string> = {
  created: '#D1D5DB',
  assigned: '#0EA5E9',
  in_progress: '#3B82F6',
  in_review: '#8B5CF6',
  done: '#10B981',
  blocked: '#EF4444',
  overdue: '#EF4444',
  archived: '#6B7280',
}

export const PERCENTILE_COLORS = {
  p50: '#4857FE',
  p85: '#F59E0B',
  p95: '#EF4444',
}
