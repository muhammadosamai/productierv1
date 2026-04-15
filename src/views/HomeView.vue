<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ListChecks, BookOpen, Clock, AlertTriangle,
  Calendar, Loader2, ChevronRight, Package,
  TrendingUp, CheckCircle2, Flame, ClipboardList,
  Timer, Hourglass, Activity, Users,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { findProductIndexByDenormRef } from '@/utils/productDeepLink'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import DoughnutChart from '@/components/charts/DoughnutChart.vue'
import BarChart from '@/components/charts/BarChart.vue'

const router = useRouter()
const authStore = useAuthStore()
const productStore = useProductStore()

const loading = ref(true)
const homeData = ref<any>(null)
const taskFilter = ref<string>('all')

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

const currentDate = computed(() => {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
})

const roleLabel = computed(() => {
  const r = authStore.user?.role || ''
  return r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
})

const filteredTasks = computed(() => {
  if (!homeData.value?.tasks) return []
  if (taskFilter.value === 'all') return homeData.value.tasks
  return homeData.value.tasks.filter((t: any) => t.status === taskFilter.value)
})

// Product colors for stacked bar chart (green tones like the reference image)
const productColors = [
  '#1a3a2a', '#2d5f42', '#4a8c66', '#7bb896', '#b5dcc8', '#d4ede0',
  '#4857FE', '#7C5CFC', '#F59E0B', '#EF4444', '#0EA5E9', '#8B5CF6',
]

const weeklyBarDatasets = computed(() => {
  if (!homeData.value?.weeklyPerformance?.products) return []
  const products = homeData.value.weeklyPerformance.products
  return products.map((product: string, idx: number) => ({
    label: product,
    data: homeData.value.weeklyPerformance.data[product] || [],
    backgroundColor: productColors[idx % productColors.length],
    borderRadius: idx === products.length - 1 ? 4 : 0,
  }))
})

// Task status distribution for doughnut chart
const statusColorMap: Record<string, { color: string; label: string }> = {
  created: { color: '#D1D5DB', label: 'Created' },
  assigned: { color: '#0EA5E9', label: 'Assigned' },
  in_progress: { color: '#F59E0B', label: 'In Progress' },
  in_review: { color: '#8B5CF6', label: 'In Review' },
  done: { color: '#10B981', label: 'Done' },
  blocked: { color: '#EF4444', label: 'Blocked' },
  overdue: { color: '#DC2626', label: 'Overdue' },
  archived: { color: '#6B7280', label: 'Archived' },
}

const doughnutLabels = computed(() => {
  if (!homeData.value?.tasksByStatus) return []
  return Object.keys(homeData.value.tasksByStatus).map(k => statusColorMap[k]?.label || formatLabel(k))
})

const doughnutData = computed(() => {
  if (!homeData.value?.tasksByStatus) return []
  return Object.values(homeData.value.tasksByStatus) as number[]
})

const doughnutColors = computed(() => {
  if (!homeData.value?.tasksByStatus) return []
  return Object.keys(homeData.value.tasksByStatus).map(k => statusColorMap[k]?.color || '#9CA3AF')
})

const statusEntries = computed(() => {
  if (!homeData.value?.totalTasks) return []
  const total = homeData.value.totalTasks
  const raw = homeData.value.tasksByStatus || {}
  // Always show these statuses, even if 0
  const allStatuses = ['done', 'in_progress', 'in_review', 'assigned', 'created', 'blocked', 'overdue', 'archived']
  const merged: Record<string, number> = {}
  for (const s of allStatuses) {
    if (raw[s] || s === 'blocked' || s === 'overdue') {
      merged[s] = raw[s] || 0
    }
  }
  // Add any remaining statuses from data
  for (const s of Object.keys(raw)) {
    if (!(s in merged)) merged[s] = raw[s]
  }
  return Object.entries(merged)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([status, count]) => ({
      status,
      label: statusColorMap[status]?.label || formatLabel(status),
      color: statusColorMap[status]?.color || '#9CA3AF',
      count: count as number,
      pct: total > 0 ? Math.round(((count as number) / total) * 100) : 0,
    }))
})

const productCounts = computed(() => {
  return homeData.value?.productCounts || {}
})

const totalCompleted = computed(() => {
  if (!homeData.value?.weeklyPerformance?.totals) return 0
  return homeData.value.weeklyPerformance.totals.reduce((a: number, b: number) => a + b, 0)
})

async function fetchHomeData() {
  if (!authStore.user) return
  loading.value = true
  try {
    const res = await fetch(`/api/auth/users/${authStore.user.id}/home`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      homeData.value = await res.json()
    }
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

onMounted(fetchHomeData)

// Styling helpers
function priorityStyle(p: string) {
  switch (p) {
    case 'high': return 'bg-red-100 text-red-700'
    case 'medium': return 'bg-green-100 text-green-700'
    case 'low': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function statusBadge(s: string) {
  switch (s) {
    case 'created': return 'bg-gray-100 text-gray-600'
    case 'assigned': return 'bg-sky-100 text-sky-700'
    case 'in_progress': return 'bg-amber-100 text-amber-700'
    case 'in_review': return 'bg-purple-100 text-purple-700'
    case 'done': return 'bg-emerald-100 text-emerald-700'
    case 'blocked': return 'bg-red-100 text-red-700'
    case 'overdue': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function storyStatusBar(s: string) {
  switch (s) {
    case 'backlog': return 'bg-gray-300'
    case 'drafted': return 'bg-blue-400'
    case 'initialized': return 'bg-sky-400'
    case 'in_progress': return 'bg-amber-400'
    case 'completed': return 'bg-emerald-400'
    default: return 'bg-gray-300'
  }
}

function deadlineBorder(dueAt: string) {
  const due = new Date(dueAt)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  if (due < tomorrow) return 'border-l-red-500'
  if (due < weekEnd) return 'border-l-amber-400'
  return 'border-l-gray-300'
}

function formatLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatRelativeTime(d: string) {
  const now = new Date()
  const then = new Date(d)
  const diffMs = now.getTime() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays}d ago`
}

function navigateToProduct(productRef: string) {
  const idx = findProductIndexByDenormRef(productStore.products, productRef)
  if (idx >= 0) productStore.selectProduct(idx)
  router.push('/metrics')
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}
</script>

<template>
  <div class="flex flex-col h-full overflow-auto" style="background-color: #F8FAFF">
    <div class="w-full px-8 py-5 space-y-4">

      <!-- Welcome Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">{{ greeting }}, {{ authStore.user?.name?.split(' ')[0] || 'there' }}!</h1>
          <p class="text-sm text-gray-400 mt-0.5">Here's your performance overview</p>
        </div>
        <div class="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <div class="text-right">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Current time</p>
            <p class="text-sm font-semibold text-gray-900">{{ currentDate }}</p>
          </div>
          <Clock :size="20" class="text-gray-400" />
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      </div>

      <template v-else-if="homeData">
        <!-- Stats Row (5 cards) -->
        <div class="grid grid-cols-5 gap-3">
          <!-- Overall Performance with ring -->
          <div class="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs text-gray-400">Overall Performance</p>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex-1">
                <p class="text-xl font-bold text-gray-900 leading-tight">{{ homeData.stats.totalCompleted }} <span class="text-xs font-normal text-gray-400">/{{ homeData.stats.totalAssigned }}</span></p>
                <div class="flex items-center gap-1 mt-1">
                  <span class="w-1 h-2.5 rounded-full" :class="homeData.stats.performancePct >= 70 ? 'bg-emerald-500' : homeData.stats.performancePct >= 40 ? 'bg-amber-500' : 'bg-red-500'"></span>
                  <span class="text-xs font-medium" :class="homeData.stats.performancePct >= 70 ? 'text-emerald-600' : homeData.stats.performancePct >= 40 ? 'text-amber-600' : 'text-red-600'">
                    {{ homeData.stats.performancePct >= 70 ? 'Good score' : homeData.stats.performancePct >= 40 ? 'Average' : 'Needs attention' }}
                  </span>
                </div>
              </div>
              <div class="relative w-[56px] h-[56px] shrink-0">
                <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F3F4F6" stroke-width="2.5" />
                  <circle cx="18" cy="18" r="15.5" fill="none" :stroke="homeData.stats.performancePct >= 70 ? '#4857FE' : homeData.stats.performancePct >= 40 ? '#F59E0B' : '#EF4444'" stroke-width="2.5" stroke-linecap="round" :stroke-dasharray="`${homeData.stats.performancePct * 0.974} ${97.4 - homeData.stats.performancePct * 0.974}`" />
                </svg>
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-xs font-bold text-[#4857FE]">{{ homeData.stats.performancePct }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Tasks Assigned -->
          <div class="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs text-gray-400">Tasks Assigned</p>
              <div class="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center">
                <ClipboardList :size="12" class="text-blue-500" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xl font-bold text-gray-900 leading-tight">{{ homeData.stats.totalAssigned }}</p>
              <div class="flex items-center gap-1">
                <span class="w-1 h-2.5 rounded-full bg-blue-500"></span>
                <span class="text-xs text-gray-400">All products</span>
              </div>
            </div>
          </div>

          <!-- Tasks Completed -->
          <div class="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs text-gray-400">Tasks Completed</p>
              <div class="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 :size="12" class="text-emerald-500" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xl font-bold text-gray-900 leading-tight">{{ homeData.stats.totalCompleted }}</p>
              <div class="flex items-center gap-1">
                <span class="w-1 h-2.5 rounded-full bg-emerald-500"></span>
                <span class="text-xs text-gray-400">{{ homeData.stats.performancePct }}% done</span>
              </div>
            </div>
          </div>

          <!-- Hours Estimated -->
          <div class="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs text-gray-400">Hours Estimated</p>
              <div class="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center">
                <Timer :size="12" class="text-purple-500" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xl font-bold text-gray-900 leading-tight">{{ homeData.stats.totalEstimatedHours }}<span class="text-xs font-normal text-gray-400">h</span></p>
              <div class="flex items-center gap-1">
                <span class="w-1 h-2.5 rounded-full bg-purple-500"></span>
                <span class="text-xs text-gray-400">Estimated</span>
              </div>
            </div>
          </div>

          <!-- Hours Spent -->
          <div class="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs text-gray-400">Hours Spent</p>
              <div class="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center">
                <Hourglass :size="12" class="text-amber-500" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xl font-bold text-gray-900 leading-tight">{{ homeData.stats.totalHoursSpent }}<span class="text-xs font-normal text-gray-400">h</span></p>
              <div class="flex items-center gap-1">
                <span class="w-1 h-2.5 rounded-full bg-amber-500"></span>
                <span class="text-xs text-gray-400">Completed</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tasks Timeline (this week) -->
        <div v-if="homeData.weekTimeline" class="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div class="flex items-center justify-between px-5 pt-4 pb-3">
            <h2 class="text-sm font-semibold text-gray-900">Task Due Timeline</h2>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400">This week</span>
            </div>
          </div>

          <!-- Day columns -->
          <div class="grid grid-cols-7 border-t border-gray-100">
            <div
              v-for="day in homeData.weekTimeline.days"
              :key="day.date"
              class="border-r border-gray-50 last:border-r-0"
            >
              <!-- Day header -->
              <div
                class="flex items-center justify-center gap-1.5 py-2 border-b border-gray-100"
                :class="day.isToday ? 'bg-[#4857FE]/5' : ''"
              >
                <span class="text-sm font-bold" :class="day.isToday ? 'text-[#4857FE]' : 'text-gray-900'">{{ day.dayNum }}</span>
                <span class="text-xs font-medium" :class="day.isToday ? 'text-[#4857FE]' : 'text-gray-400'">{{ day.dayName }}</span>
              </div>

              <!-- Today marker -->
              <div v-if="day.isToday" class="flex justify-center -mt-px">
                <div class="flex flex-col items-center">
                  <div class="w-2.5 h-2.5 rounded-full bg-[#4857FE] border-2 border-white shadow-sm"></div>
                  <div class="w-px h-2 bg-[#4857FE]/30"></div>
                </div>
              </div>

              <!-- Tasks for this day -->
              <div class="p-1.5 space-y-1.5 min-h-[80px]">
                <div
                  v-for="task in homeData.weekTimeline.tasks.filter((t: any) => t.dueAt?.startsWith(day.date))"
                  :key="task.id"
                  class="rounded-lg px-2.5 py-2 text-sm cursor-pointer transition-all hover:shadow-sm"
                  :class="{
                    'bg-emerald-50 border border-emerald-200 text-emerald-800': task.status === 'done',
                    'bg-amber-50 border border-amber-200 text-amber-800': task.status === 'in_progress',
                    'bg-purple-50 border border-purple-200 text-purple-800': task.status === 'in_review',
                    'bg-red-50 border border-red-200 text-red-800': task.status === 'blocked',
                    'bg-gray-50 border border-gray-200 text-gray-700': !['done', 'in_progress', 'in_review', 'blocked'].includes(task.status),
                  }"
                >
                  <p class="font-medium truncate">{{ task.title }}</p>
                  <div class="flex items-center justify-between mt-0.5">
                    <span class="text-xs opacity-70 truncate">{{ task.product }}</span>
                    <span class="text-xs font-medium capitalize opacity-80">{{ task.status.replace(/_/g, ' ') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3-Column Layout -->
        <div class="grid grid-cols-3 gap-5">

          <!-- Column 1: My Tasks -->
          <div class="space-y-5">
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="flex items-center justify-between px-4 pt-4 pb-2.5">
                <div class="flex items-center gap-2">
                  <ListChecks :size="15" class="text-[#4857FE]" />
                  <h2 class="text-sm font-semibold text-gray-900">My Tasks</h2>
                  <span class="text-xs font-bold rounded-full px-1.5 py-0.5 bg-[#4857FE]/10 text-[#4857FE]">{{ homeData.tasks.length }}</span>
                </div>
              </div>
              <div class="flex items-center gap-1 px-4 pb-2.5 border-b border-gray-100">
                <button
                  v-for="tab in ['all', 'in_progress', 'in_review', 'blocked']"
                  :key="tab"
                  class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer"
                  :class="taskFilter === tab ? 'bg-[#4857FE] text-white' : 'text-gray-500 hover:bg-gray-100'"
                  @click="taskFilter = tab"
                >
                  {{ tab === 'all' ? 'All' : formatLabel(tab) }}
                </button>
              </div>
              <div v-if="filteredTasks.length > 0" class="divide-y divide-gray-50 max-h-[400px] overflow-auto">
                <div
                  v-for="task in filteredTasks.slice(0, 12)"
                  :key="task.id"
                  class="flex items-center gap-2 px-4 py-2 hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  <TaskStatusIcon :status="task.status" :size="14" />
                  <span class="text-sm text-gray-900 truncate flex-1">{{ task.title }}</span>
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold" :class="priorityStyle(task.priority)">
                    {{ task.priority.charAt(0).toUpperCase() }}
                  </span>
                </div>
              </div>
              <div v-else class="py-6 text-center text-xs text-gray-400">No tasks match this filter</div>
            </div>

            <!-- My Stories -->
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="flex items-center gap-2 px-4 pt-4 pb-2.5 border-b border-gray-100">
                <BookOpen :size="15" class="text-purple-500" />
                <h2 class="text-sm font-semibold text-gray-900">My Stories</h2>
                <span class="text-xs font-bold rounded-full px-1.5 py-0.5 bg-purple-50 text-purple-600">{{ homeData.stories.length }}</span>
              </div>
              <div v-if="homeData.stories.length > 0" class="divide-y divide-gray-50">
                <div
                  v-for="story in homeData.stories.slice(0, 6)"
                  :key="story.id"
                  class="flex items-center gap-2 px-4 py-2 hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  <span class="w-1 h-5 rounded-full shrink-0" :class="storyStatusBar(story.status)"></span>
                  <span class="text-sm text-gray-900 truncate flex-1">{{ story.title }}</span>
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold" :class="priorityStyle(story.priority)">
                    {{ story.priority.charAt(0).toUpperCase() }}
                  </span>
                </div>
              </div>
              <div v-else class="py-6 text-center text-xs text-gray-400">No stories assigned</div>
            </div>
          </div>

          <!-- Column 2: Charts -->
          <div class="space-y-5">
            <!-- Task Distribution -->
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-sm font-semibold text-gray-900">Task Distribution</h2>
                <span class="text-xs text-gray-400">By status</span>
              </div>
              <div class="flex items-center gap-4">
                <div class="w-[130px] shrink-0">
                  <DoughnutChart
                    v-if="doughnutData.length > 0"
                    :labels="doughnutLabels"
                    :data="doughnutData"
                    :colors="doughnutColors"
                    :height="130"
                    center-label="Tasks"
                    :center-value="homeData.totalTasks"
                  />
                  <div v-else class="w-[130px] h-[130px] flex items-center justify-center">
                    <span class="text-xs text-gray-400">No data</span>
                  </div>
                </div>
                <div class="flex-1 space-y-1.5">
                  <div
                    v-for="entry in statusEntries"
                    :key="entry.status"
                    class="flex items-center justify-between"
                  >
                    <div class="flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: entry.color }"></span>
                      <span class="text-sm text-gray-600">{{ entry.label }}</span>
                    </div>
                    <span class="text-xs text-gray-400">{{ entry.pct }}%</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Weekly Performance by Product -->
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <TrendingUp :size="14" class="text-emerald-500" />
                  <h2 class="text-sm font-semibold text-gray-900">Tasks Completed</h2>
                </div>
                <span class="text-xs text-gray-400">Last 8 weeks</span>
              </div>
              <BarChart
                v-if="homeData.weeklyPerformance && weeklyBarDatasets.length > 0"
                :labels="homeData.weeklyPerformance.labels"
                :datasets="weeklyBarDatasets"
                :height="200"
                :stacked="true"
                :show-legend="true"
              />
              <div v-else class="h-[200px] flex items-center justify-center">
                <span class="text-xs text-gray-400">No completed tasks yet</span>
              </div>
              <p class="text-xs text-gray-400 mt-2 text-center">
                <span class="font-semibold text-[#4857FE]">{{ totalCompleted }}</span> tasks completed across all products
              </p>
            </div>

            <!-- Peer Performance -->
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <Activity :size="14" class="text-[#4857FE]" />
                  <h2 class="text-sm font-semibold text-gray-900">Peer Performance</h2>
                </div>
                <span class="text-xs text-gray-400">Last 8 weeks</span>
              </div>
              <BarChart
                v-if="homeData.peerPerformance"
                :labels="homeData.peerPerformance.labels"
                :datasets="[
                  { label: 'Me', data: homeData.peerPerformance.myData, backgroundColor: '#1e293b' },
                  { label: 'Peer Avg', data: homeData.peerPerformance.peerAvgData, backgroundColor: '#94a3b8' },
                ]"
                :height="180"
                :stacked="false"
                :show-legend="true"
              />
            </div>

          </div>

          <!-- Column 3: Activity + Deadlines + Blockers -->
          <div class="space-y-5">
            <!-- Products Grid -->
            <div>
              <div class="flex items-center gap-2 mb-3">
                <Package :size="16" class="text-gray-400" />
                <h2 class="text-sm font-semibold text-gray-900">Products</h2>
              </div>
              <div class="grid grid-cols-3 gap-2.5">
                <div
                  v-for="product in productStore.products"
                  :key="product.name"
                  class="flex flex-col items-center gap-1.5 px-2 py-3 bg-white rounded-xl border border-gray-100 hover:border-[#4857FE]/30 hover:shadow-sm transition-all cursor-pointer group"
                  @click="navigateToProduct(product.name)"
                >
                  <div class="w-9 h-9 rounded-xl overflow-hidden shrink-0 shadow-sm">
                    <UploadAssetImg v-if="product.logo" :src="product.logo" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full bg-gradient-to-br from-[#4857FE] to-[#7C5CFC] flex items-center justify-center text-[10px] font-bold text-white">
                      {{ product.name.slice(0, 2).toUpperCase() }}
                    </div>
                  </div>
                  <span class="text-xs font-medium text-gray-700 truncate text-center w-full group-hover:text-[#4857FE] transition-colors">{{ product.name }}</span>
                  <div class="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>{{ productCounts[product.name]?.stories || 0 }} stories</span>
                    <span>·</span>
                    <span>{{ productCounts[product.name]?.tasks || 0 }} tasks</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="flex items-center gap-2 px-4 pt-4 pb-2.5 border-b border-gray-100">
                <Clock :size="15" class="text-gray-400" />
                <h2 class="text-sm font-semibold text-gray-900">Recent Activity</h2>
              </div>
              <div v-if="homeData.activities?.length > 0" class="divide-y divide-gray-50 max-h-[350px] overflow-auto">
                <div
                  v-for="activity in homeData.activities.slice(0, 15)"
                  :key="activity.id"
                  class="flex items-start gap-2 px-4 py-2"
                >
                  <div class="w-6 h-6 rounded-full overflow-hidden shrink-0 mt-0.5">
                    <UploadAssetImg v-if="activity.userAvatar" :src="activity.userAvatar" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full bg-[#4857FE]/10 flex items-center justify-center text-[8px] font-bold text-[#4857FE]">
                      {{ getInitials(activity.userName || 'U') }}
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-600 leading-relaxed">
                      <span class="font-semibold text-gray-800">{{ activity.userName?.split(' ')[0] }}</span>
                      {{ ' ' + activity.action + ' ' }}
                      <span class="font-medium text-gray-700 truncate">{{ activity.entityTitle }}</span>
                    </p>
                  </div>
                  <span class="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">{{ formatRelativeTime(activity.createdAt) }}</span>
                </div>
              </div>
              <div v-else class="py-6 text-center text-xs text-gray-400">No recent activity</div>
            </div>

            <!-- Upcoming Deadlines -->
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="flex items-center gap-2 px-4 pt-4 pb-2.5 border-b border-gray-100">
                <Calendar :size="15" class="text-amber-500" />
                <h2 class="text-sm font-semibold text-gray-900">Upcoming Deadlines</h2>
              </div>
              <div v-if="homeData.upcomingDeadlines?.length > 0" class="divide-y divide-gray-50">
                <div
                  v-for="item in homeData.upcomingDeadlines"
                  :key="item.id"
                  class="flex items-center gap-2 px-4 py-2 border-l-[3px]"
                  :class="deadlineBorder(item.dueAt)"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-900 truncate">{{ item.title }}</p>
                    <p class="text-xs text-gray-400">{{ item.product }}</p>
                  </div>
                  <span class="text-xs font-medium whitespace-nowrap" :class="new Date(item.dueAt) < new Date() ? 'text-red-500' : 'text-gray-500'">
                    {{ formatDate(item.dueAt) }}
                  </span>
                </div>
              </div>
              <div v-else class="py-6 text-center text-xs text-gray-400">No upcoming deadlines</div>
            </div>

            <!-- Blockers -->
            <div v-if="homeData.blockedTasks?.length > 0" class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="flex items-center gap-2 px-4 pt-4 pb-2.5 border-b border-gray-100">
                <Flame :size="15" class="text-red-500" />
                <h2 class="text-sm font-semibold text-gray-900">Blockers</h2>
                <span class="text-xs font-bold rounded-full px-1.5 py-0.5 bg-red-50 text-red-600">{{ homeData.stats.blockedCount }}</span>
              </div>
              <div class="divide-y divide-gray-50">
                <div
                  v-for="task in homeData.blockedTasks"
                  :key="task.id"
                  class="px-4 py-2"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-900 truncate flex-1">{{ task.title }}</span>
                    <span class="text-xs text-gray-400 bg-gray-100 rounded px-1 py-0.5">{{ task.productName }}</span>
                  </div>
                  <p v-if="task.blockedReason" class="text-xs text-red-500 mt-0.5 truncate">{{ task.blockedReason }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </template>
    </div>
  </div>
</template>
