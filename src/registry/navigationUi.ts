import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import {
  BookOpen,
  Boxes,
  BugPlay,
  Gauge,
  House,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListChecks,
  MessageSquareWarning,
  Package,
  Settings,
  Sparkles,
  Target,
  Users,
  CalendarDays,
} from 'lucide-vue-next'

export type ProductSectionId = 'top' | 'management' | 'quality'

export interface SidebarNavLikeItem {
  id: string
  label: string
  expandable?: boolean
}

const FALLBACK_ICON = LayoutDashboard

export const MAIN_NAV_ICON_BY_TOKEN: Record<string, Component> = {
  home: House,
  products: Boxes,
  users: Users,
  integrations: Link2,
  settings: Settings,
}

export const PRODUCT_NAV_ICON_BY_TOKEN: Record<string, Component> = {
  overview: LayoutDashboard,
  wiki: BookOpen,
  team: Users,
  initiatives: Target,
  stories: Sparkles,
  tasks: ListChecks,
  deliveries: Package,
  releases: CalendarDays,
  'test-cycles': BugPlay,
  issues: Gauge,
  feedbacks: MessageSquareWarning,
  'feature-requests': Lightbulb,
}

export function iconForMainToken(token: string): Component {
  return MAIN_NAV_ICON_BY_TOKEN[token] || FALLBACK_ICON
}

export function iconForProductToken(token: string): Component {
  return PRODUCT_NAV_ICON_BY_TOKEN[token] || FALLBACK_ICON
}

export function buildChildRoute(parentId: string, childId: string): RouteLocationRaw | null {
  if (!childId) return null

  switch (parentId) {
    case 'initiatives':
      return `/initiatives/${childId}`
    case 'deliveries':
      return `/deliveries/${childId}`
    case 'releases':
      return `/releases/${childId}`
    case 'test-cycles':
      return `/test-cycles/${childId}`
    case 'stories':
      return { path: '/stories', query: { story: childId } }
    case 'tasks':
      return { path: '/tasks', query: { task: childId } }
    case 'issues':
      return { path: '/issues', query: { issue: childId } }
    case 'team':
      return { path: '/team', query: { team: childId } }
    default:
      return null
  }
}

export function normalizeExpandedState(
  savedState: Record<string, boolean>,
  navItems: SidebarNavLikeItem[],
): Record<string, boolean> {
  const normalized: Record<string, boolean> = {}
  for (const item of navItems) {
    if (!item.expandable) continue
    if (typeof savedState[item.id] === 'boolean') {
      normalized[item.id] = savedState[item.id]!
      continue
    }
    if (typeof savedState[item.label] === 'boolean') {
      // Legacy compatibility: older builds stored expansion by labels.
      normalized[item.id] = savedState[item.label]!
      continue
    }
    normalized[item.id] = true
  }
  return normalized
}

export function toggleSectionByIds(
  expandedState: Record<string, boolean>,
  sectionItems: SidebarNavLikeItem[],
): Record<string, boolean> {
  const expandableIds = sectionItems.filter((item) => item.expandable).map((item) => item.id)
  if (expandableIds.length === 0) return expandedState

  const allCollapsed = expandableIds.every((id) => !expandedState[id])
  const next = { ...expandedState }
  for (const id of expandableIds) {
    next[id] = allCollapsed
  }
  return next
}
