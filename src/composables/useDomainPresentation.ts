import { computed } from 'vue'
import type { Component } from 'vue'
import {
  Bug,
  Code2,
  Eye,
  FileText,
  FlaskConical,
  FolderOpen,
  Lightbulb,
  Palette,
  Rocket,
  Server,
  Sparkles,
  TestTube2,
  Wrench,
} from 'lucide-vue-next'
import { enumValueLabel, useDomainOptions } from '@/composables/useDomainOptions'

type OrderMap = Record<string, number>

const DEFAULT_BADGE = 'bg-gray-100 text-gray-600 border border-gray-200'
const DEFAULT_SOFT_BADGE = 'bg-gray-50 text-gray-500'
const DEFAULT_DOT = 'bg-gray-400'
const DEFAULT_TEXT = 'text-gray-500'

const TASK_STATUS_BADGE: Record<string, string> = {
  created: 'bg-gray-400 text-white',
  assigned: 'bg-[#a25ddc] text-white',
  in_progress: 'bg-[#fdab3d] text-white',
  in_review: 'bg-[#579bfc] text-white',
  done: 'bg-[#00c875] text-white',
  overdue: 'bg-red-500 text-white',
  blocked: 'bg-[#e2445c] text-white',
  archived: 'bg-gray-400 text-white',
}

const TASK_STATUS_DOT: Record<string, string> = {
  created: 'bg-gray-400',
  assigned: 'bg-[#a25ddc]',
  in_progress: 'bg-[#fdab3d]',
  in_review: 'bg-[#579bfc]',
  done: 'bg-[#00c875]',
  overdue: 'bg-red-500',
  blocked: 'bg-[#e2445c]',
  archived: 'bg-gray-400',
}

const TASK_STATUS_TEXT: Record<string, string> = {
  created: 'text-gray-500',
  assigned: 'text-purple-700',
  in_progress: 'text-orange-700',
  in_review: 'text-blue-700',
  done: 'text-green-700',
  overdue: 'text-red-700',
  blocked: 'text-rose-700',
  archived: 'text-gray-500',
}

const STORY_STATUS_BADGE: Record<string, string> = {
  backlog: 'bg-[#c4c4c4] text-white',
  drafted: 'bg-[#a25ddc] text-white',
  initialized: 'bg-[#579bfc] text-white',
  in_progress: 'bg-[#fdab3d] text-white',
  completed: 'bg-[#00c875] text-white',
  archived: 'bg-gray-400 text-white',
}

const STORY_STATUS_DOT: Record<string, string> = {
  backlog: 'bg-[#c4c4c4]',
  drafted: 'bg-[#a25ddc]',
  initialized: 'bg-[#579bfc]',
  in_progress: 'bg-[#fdab3d]',
  completed: 'bg-[#00c875]',
  archived: 'bg-gray-400',
}

const STORY_STATUS_TEXT: Record<string, string> = {
  backlog: 'text-gray-600',
  drafted: 'text-purple-700',
  initialized: 'text-blue-700',
  in_progress: 'text-orange-700',
  completed: 'text-green-700',
  archived: 'text-gray-500',
}

const DELIVERY_STATUS_BADGE: Record<string, string> = {
  initialized: 'bg-[#ff69b4]/15 text-[#ff69b4]',
  in_progress: 'bg-[#fdab3d]/15 text-[#d48806]',
  overdue: 'bg-[#e2445c]/15 text-[#e2445c]',
  blocked: 'bg-[#a25ddc]/15 text-[#a25ddc]',
  completed: 'bg-[#00c875]/15 text-[#00a65a]',
  archived: 'bg-gray-100 text-gray-400',
}

const DELIVERY_STATUS_DOT: Record<string, string> = {
  initialized: 'bg-[#ff69b4]',
  in_progress: 'bg-[#fdab3d]',
  overdue: 'bg-[#e2445c]',
  blocked: 'bg-[#a25ddc]',
  completed: 'bg-[#00c875]',
  archived: 'bg-gray-300',
}

const DELIVERY_STATUS_TEXT: Record<string, string> = {
  initialized: 'text-[#ff69b4]',
  in_progress: 'text-[#fdab3d]',
  overdue: 'text-[#e2445c]',
  blocked: 'text-[#a25ddc]',
  completed: 'text-[#00c875]',
  archived: 'text-gray-400',
}

const RELEASE_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  planned: 'bg-purple-50 text-purple-600',
  in_progress: 'bg-orange-50 text-orange-600',
  completed: 'bg-green-50 text-green-600',
  failed: 'bg-red-50 text-red-600',
}

const RELEASE_STATUS_DOT: Record<string, string> = {
  draft: 'bg-gray-400',
  planned: 'bg-purple-500',
  in_progress: 'bg-orange-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
}

const RELEASE_TYPE_BADGE: Record<string, string> = {
  feature: 'bg-blue-50 text-blue-600',
  hotfix: 'bg-red-50 text-red-600',
  patch: 'bg-yellow-50 text-yellow-600',
}

const STORY_PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high: 'bg-orange-100 text-orange-700 border border-orange-200',
  medium: 'bg-green-100 text-green-700 border border-green-200',
  low: 'bg-blue-100 text-blue-700 border border-blue-200',
}

const STORY_PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-green-500',
  low: 'bg-blue-500',
}

const TASK_PRIORITY_BADGE = STORY_PRIORITY_BADGE
const TASK_PRIORITY_DOT = STORY_PRIORITY_DOT

const STORY_TYPE_BADGE: Record<string, string> = {
  feature: 'bg-blue-50/80 text-blue-600',
  bug: 'bg-red-50/80 text-red-600',
  improvement: 'bg-purple-50/80 text-purple-600',
  technical_debt: 'bg-orange-50/80 text-orange-600',
  research: 'bg-yellow-50/80 text-yellow-600',
  infrastructure: 'bg-gray-100/80 text-gray-600',
  testing: 'bg-green-50/80 text-green-600',
  documentation: 'bg-gray-50/80 text-gray-500',
}

const STORY_TYPE_ICON_COLOR: Record<string, string> = {
  feature: 'text-blue-500',
  bug: 'text-red-500',
  improvement: 'text-purple-500',
  technical_debt: 'text-orange-500',
  research: 'text-yellow-500',
  infrastructure: 'text-gray-500',
  testing: 'text-green-500',
  documentation: 'text-gray-400',
}

const STORY_TYPE_ICON: Record<string, Component> = {
  feature: Sparkles,
  bug: Bug,
  improvement: Lightbulb,
  technical_debt: Wrench,
  research: FlaskConical,
  infrastructure: Server,
  testing: TestTube2,
  documentation: FileText,
}

const TASK_TYPE_BADGE: Record<string, string> = {
  design: 'bg-purple-50/80 text-purple-600',
  development: 'bg-blue-50/80 text-blue-600',
  testing: 'bg-green-50/80 text-green-600',
  review: 'bg-cyan-50/80 text-cyan-600',
  research: 'bg-yellow-50/80 text-yellow-600',
  fix: 'bg-red-50/80 text-red-600',
  documentation: 'bg-gray-50/80 text-gray-500',
  deployment: 'bg-orange-50/80 text-orange-600',
}

const TASK_TYPE_ICON: Record<string, Component> = {
  design: Palette,
  development: Code2,
  testing: TestTube2,
  review: Eye,
  research: FlaskConical,
  fix: Wrench,
  documentation: FileText,
  deployment: Rocket,
}

function buildOrder(values: readonly string[]): OrderMap {
  const order: OrderMap = {}
  values.forEach((value, index) => {
    order[value] = index
  })
  return order
}

function orderValue(order: OrderMap, value: string | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER
  return order[value] ?? Number.MAX_SAFE_INTEGER
}

function withFallback(map: Record<string, string>, value: string | null | undefined, fallback: string) {
  if (!value) return fallback
  return map[value] || fallback
}

export function useDomainPresentation() {
  const {
    storyStatusValues,
    storyPriorityValues,
    storyTypeValues,
    taskStatusValues,
    taskPriorityValues,
    taskTypeValues,
    deliveryStatusValues,
    releaseStatusValues,
    releaseTypeValues,
  } = useDomainOptions()

  const storyStatusOrder = computed(() => buildOrder(storyStatusValues.value))
  const storyPriorityOrder = computed(() => buildOrder(storyPriorityValues.value))
  const storyTypeOrder = computed(() => buildOrder(storyTypeValues.value))
  const taskStatusOrder = computed(() => buildOrder(taskStatusValues.value))
  const taskPriorityOrder = computed(() => buildOrder(taskPriorityValues.value))
  const taskTypeOrder = computed(() => buildOrder(taskTypeValues.value))
  const deliveryStatusOrder = computed(() => buildOrder(deliveryStatusValues.value))
  const releaseStatusOrder = computed(() => buildOrder(releaseStatusValues.value))
  const releaseTypeOrder = computed(() => buildOrder(releaseTypeValues.value))

  return {
    enumLabel: enumValueLabel,
    orderValue,
    storyStatusOrder,
    storyPriorityOrder,
    storyTypeOrder,
    taskStatusOrder,
    taskPriorityOrder,
    taskTypeOrder,
    deliveryStatusOrder,
    releaseStatusOrder,
    releaseTypeOrder,
    storyStatusStyle: (value: string | null | undefined) => withFallback(STORY_STATUS_BADGE, value, DEFAULT_SOFT_BADGE),
    storyStatusDot: (value: string | null | undefined) => withFallback(STORY_STATUS_DOT, value, DEFAULT_DOT),
    storyStatusText: (value: string | null | undefined) => withFallback(STORY_STATUS_TEXT, value, DEFAULT_TEXT),
    taskStatusStyle: (value: string | null | undefined) => withFallback(TASK_STATUS_BADGE, value, DEFAULT_SOFT_BADGE),
    taskStatusDot: (value: string | null | undefined) => withFallback(TASK_STATUS_DOT, value, DEFAULT_DOT),
    taskStatusText: (value: string | null | undefined) => withFallback(TASK_STATUS_TEXT, value, DEFAULT_TEXT),
    deliveryStatusStyle: (value: string | null | undefined) => withFallback(DELIVERY_STATUS_BADGE, value, DEFAULT_SOFT_BADGE),
    deliveryStatusDot: (value: string | null | undefined) => withFallback(DELIVERY_STATUS_DOT, value, DEFAULT_DOT),
    deliveryStatusText: (value: string | null | undefined) => withFallback(DELIVERY_STATUS_TEXT, value, DEFAULT_TEXT),
    releaseStatusStyle: (value: string | null | undefined) => withFallback(RELEASE_STATUS_BADGE, value, DEFAULT_SOFT_BADGE),
    releaseStatusDot: (value: string | null | undefined) => withFallback(RELEASE_STATUS_DOT, value, DEFAULT_DOT),
    releaseTypeStyle: (value: string | null | undefined) => withFallback(RELEASE_TYPE_BADGE, value, DEFAULT_SOFT_BADGE),
    storyPriorityStyle: (value: string | null | undefined) => withFallback(STORY_PRIORITY_BADGE, value, DEFAULT_BADGE),
    storyPriorityDot: (value: string | null | undefined) => withFallback(STORY_PRIORITY_DOT, value, DEFAULT_DOT),
    taskPriorityStyle: (value: string | null | undefined) => withFallback(TASK_PRIORITY_BADGE, value, DEFAULT_BADGE),
    taskPriorityDot: (value: string | null | undefined) => withFallback(TASK_PRIORITY_DOT, value, DEFAULT_DOT),
    storyTypeStyle: (value: string | null | undefined) => withFallback(STORY_TYPE_BADGE, value, DEFAULT_SOFT_BADGE),
    storyTypeIconColor: (value: string | null | undefined) => withFallback(STORY_TYPE_ICON_COLOR, value, DEFAULT_TEXT),
    storyTypeIcon: (value: string | null | undefined) => (value ? STORY_TYPE_ICON[value] || FolderOpen : FolderOpen),
    taskTypeStyle: (value: string | null | undefined) => withFallback(TASK_TYPE_BADGE, value, DEFAULT_SOFT_BADGE),
    taskTypeIcon: (value: string | null | undefined) => (value ? TASK_TYPE_ICON[value] || FolderOpen : FolderOpen),
  }
}
