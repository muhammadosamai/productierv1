<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, Loader2 } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { useActivitiesStore } from '@/stores/activities'
import type { Activity } from '@/stores/activities'
import { buildHomeActivityEntityRoute } from '@/lib/homeEntityRouting'

const productStore = useProductStore()
const activitiesStore = useActivitiesStore()
const router = useRouter()

async function loadActivities() {
  const productId = productStore.activeProduct.id || ''
  if (!productId) return
  await activitiesStore.fetchActivities(productId)
}

onMounted(() => {
  loadActivities()
})

watch(() => productStore.activeProduct.id, () => {
  loadActivities()
})

const groupedActivities = computed(() => {
  const groups: { label: string; activities: Activity[] }[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const dateMap = new Map<string, Activity[]>()
  for (const activity of activitiesStore.activities) {
    const date = new Date(activity.createdAt)
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    let label: string
    if (day.getTime() === today.getTime()) {
      label = `Today ${formatDateHeader(date)}`
    } else if (day.getTime() === yesterday.getTime()) {
      label = `Yesterday, ${formatDateHeader(date)}`
    } else {
      label = formatDateHeader(date)
    }
    if (!dateMap.has(label)) dateMap.set(label, [])
    dateMap.get(label)!.push(activity)
  }

  for (const [label, acts] of dateMap) {
    groups.push({ label, activities: acts })
  }

  return groups
})

function formatDateHeader(date: Date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}${getOrdinal(date.getDate())}, ${date.getFullYear()}`
}

function getOrdinal(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const rest = value % 100
  return suffixes[(rest - 20) % 10] || suffixes[rest] || suffixes[0]!
}

function formatRelativeTime(dateStr: string) {
  const now = new Date()
  const target = new Date(dateStr)
  const diffMs = now.getTime() - target.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return target.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function entityTypeLabel(type: string) {
  if (type === 'initiative') return 'Initiative'
  if (type === 'story') return 'Story'
  if (type === 'task') return 'Task'
  return type
}

function activityActionColor(action: string) {
  if (action === 'created') return 'bg-[#00c875]'
  if (action === 'updated') return 'bg-[#579bfc]'
  if (action === 'deleted') return 'bg-[#e2445c]'
  return 'bg-gray-400'
}

function activityRoute(activity: Activity) {
  return buildHomeActivityEntityRoute(activity.entityType, activity.entityId)
}

function openActivityEntity(activity: Activity) {
  const targetRoute = activityRoute(activity)
  if (!targetRoute) return
  router.push(targetRoute)
}

function userInitials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)
}
</script>

<template>
  <div class="h-full bg-white">
    <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
      <div class="flex items-center gap-2">
        <Clock :size="17" class="text-gray-400" />
        <h2 class="text-sm font-semibold text-gray-900">Activities</h2>
      </div>
      <button
        v-if="activitiesStore.activities.length > 0"
        type="button"
        class="text-xs text-gray-400 hover:text-gray-600"
        @click="loadActivities"
      >
        Refresh
      </button>
    </div>

    <div v-if="activitiesStore.loading" class="flex items-center justify-center py-14">
      <Loader2 :size="18" class="animate-spin text-gray-400" />
    </div>

    <div v-else-if="activitiesStore.activities.length === 0" class="px-4 py-14 text-center">
      <Clock :size="28" class="mx-auto mb-2 text-gray-200" />
      <p class="text-sm text-gray-400">No activity yet</p>
      <p class="mt-1 text-xs text-gray-300">Changes to stories and initiatives will appear here</p>
    </div>

    <div v-else class="max-h-[540px] space-y-4 overflow-auto px-4 py-4">
      <div v-for="group in groupedActivities" :key="group.label">
        <div class="pb-1">
          <span class="text-[11px] font-bold tracking-wider text-[#4857FE]">{{ group.label }}</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="activity in group.activities"
            :key="activity.id"
            class="rounded-lg border border-gray-100 bg-white p-3"
          >
            <div class="flex items-start gap-3">
              <div class="relative mt-0.5 shrink-0">
                <div class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#7C5CFC] text-[10px] font-medium text-white">
                  <img
                    v-if="activity.userAvatar"
                    :src="activity.userAvatar"
                    class="h-8 w-8 rounded-full object-cover"
                    :alt="activity.userName"
                  />
                  <span v-else>{{ userInitials(activity.userName) }}</span>
                </div>
                <div
                  class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
                  :class="activityActionColor(activity.action)"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-semibold text-gray-900">{{ activity.userName }}</p>
                  <span class="shrink-0 text-[11px] text-gray-400">{{ formatRelativeTime(activity.createdAt) }}</span>
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <button
                    v-if="activityRoute(activity)"
                    type="button"
                    class="truncate rounded bg-[#4857FE]/8 px-1.5 py-0.5 text-[10px] font-medium text-[#4857FE]"
                    :title="activity.entityTitle"
                    @click.stop="openActivityEntity(activity)"
                  >
                    {{ entityTypeLabel(activity.entityType) }}: {{ activity.entityTitle }}
                  </button>
                  <span
                    v-else
                    class="truncate rounded bg-[#4857FE]/8 px-1.5 py-0.5 text-[10px] font-medium text-[#4857FE]"
                    :title="activity.entityTitle"
                  >
                    {{ entityTypeLabel(activity.entityType) }}: {{ activity.entityTitle }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
