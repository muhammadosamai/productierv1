import { computed } from 'vue'
import { useMetadataStore } from '@/stores/metadata'
import type {
  StoryPriority,
  StoryStatus,
  StoryType,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@/types/backlog'
import type { DeliveryStatus } from '@/types/delivery'
import type { ReleaseStatus, ReleaseType } from '@/types/release'

type Option<T extends string> = {
  value: T
  label: string
}

const STORY_TYPE_FALLBACK = ['feature', 'bug', 'improvement', 'technical_debt', 'research', 'infrastructure', 'testing', 'documentation'] as const satisfies readonly StoryType[]
const STORY_PRIORITY_FALLBACK = ['critical', 'high', 'medium', 'low'] as const satisfies readonly StoryPriority[]
const STORY_STATUS_FALLBACK = ['backlog', 'drafted', 'initialized', 'in_progress', 'completed', 'archived'] as const satisfies readonly StoryStatus[]

const TASK_TYPE_FALLBACK = ['design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment'] as const satisfies readonly TaskType[]
const TASK_PRIORITY_FALLBACK = ['critical', 'high', 'medium', 'low'] as const satisfies readonly TaskPriority[]
const TASK_STATUS_FALLBACK = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'overdue', 'blocked', 'archived'] as const satisfies readonly TaskStatus[]

const DELIVERY_STATUS_FALLBACK = ['initialized', 'in_progress', 'overdue', 'blocked', 'completed', 'archived'] as const satisfies readonly DeliveryStatus[]
const RELEASE_STATUS_FALLBACK = ['draft', 'planned', 'in_progress', 'completed', 'failed'] as const satisfies readonly ReleaseStatus[]
const RELEASE_TYPE_FALLBACK = ['feature', 'hotfix', 'patch'] as const satisfies readonly ReleaseType[]

const LABEL_OVERRIDES: Record<string, string> = {
  technical_debt: 'Technical Debt',
  in_progress: 'In Progress',
  in_review: 'In Review',
  test_cycles: 'Testing Cycles',
  initialized: 'Initialized',
  feature_requests: 'Feature Requests',
  feedbacks: 'Consumer Feedback',
  releases: 'Releases',
  test_cycles_status: 'Testing Cycles',
}

function toLabel(value: string): string {
  if (LABEL_OVERRIDES[value]) return LABEL_OVERRIDES[value]
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function mergeEnumValues<T extends string>(
  metadataValues: string[] | undefined,
  fallback: readonly T[],
): T[] {
  const merged: T[] = []
  const fallbackSet = new Set<string>(fallback)
  if (Array.isArray(metadataValues)) {
    for (const value of metadataValues) {
      if (fallbackSet.has(value) && !merged.includes(value as T)) {
        merged.push(value as T)
      }
    }
  }
  for (const value of fallback) {
    if (!merged.includes(value)) merged.push(value)
  }
  return merged
}

function toOptions<T extends string>(values: T[]): Option<T>[] {
  return values.map((value) => ({
    value,
    label: toLabel(value),
  }))
}

export function useDomainOptions() {
  const metadataStore = useMetadataStore()

  const storyTypeValues = computed(() => mergeEnumValues<StoryType>(metadataStore.enums.story.type, STORY_TYPE_FALLBACK))
  const storyPriorityValues = computed(() => mergeEnumValues<StoryPriority>(metadataStore.enums.story.priority, STORY_PRIORITY_FALLBACK))
  const storyStatusValues = computed(() => mergeEnumValues<StoryStatus>(metadataStore.enums.story.status, STORY_STATUS_FALLBACK))

  const taskTypeValues = computed(() => mergeEnumValues<TaskType>(metadataStore.enums.task.type, TASK_TYPE_FALLBACK))
  const taskPriorityValues = computed(() => mergeEnumValues<TaskPriority>(metadataStore.enums.task.priority, TASK_PRIORITY_FALLBACK))
  const taskStatusValues = computed(() => mergeEnumValues<TaskStatus>(metadataStore.enums.task.status, TASK_STATUS_FALLBACK))

  const deliveryStatusValues = computed(() => mergeEnumValues<DeliveryStatus>(metadataStore.enums.delivery.status, DELIVERY_STATUS_FALLBACK))
  const releaseStatusValues = computed(() => mergeEnumValues<ReleaseStatus>(metadataStore.enums.release.status, RELEASE_STATUS_FALLBACK))
  const releaseTypeValues = computed(() => mergeEnumValues<ReleaseType>(metadataStore.enums.release.type, RELEASE_TYPE_FALLBACK))

  const storyTypeOptions = computed(() => toOptions(storyTypeValues.value))
  const storyPriorityOptions = computed(() => toOptions(storyPriorityValues.value))
  const storyStatusOptions = computed(() => toOptions(storyStatusValues.value))

  const taskTypeOptions = computed(() => toOptions(taskTypeValues.value))
  const taskPriorityOptions = computed(() => toOptions(taskPriorityValues.value))
  const taskStatusOptions = computed(() => toOptions(taskStatusValues.value))

  const deliveryStatusOptions = computed(() => toOptions(deliveryStatusValues.value))
  const releaseStatusOptions = computed(() => toOptions(releaseStatusValues.value))
  const releaseTypeOptions = computed(() => toOptions(releaseTypeValues.value))

  return {
    storyTypeValues,
    storyPriorityValues,
    storyStatusValues,
    taskTypeValues,
    taskPriorityValues,
    taskStatusValues,
    deliveryStatusValues,
    releaseStatusValues,
    releaseTypeValues,
    storyTypeOptions,
    storyPriorityOptions,
    storyStatusOptions,
    taskTypeOptions,
    taskPriorityOptions,
    taskStatusOptions,
    deliveryStatusOptions,
    releaseStatusOptions,
    releaseTypeOptions,
  }
}

export { toLabel as enumValueLabel }
