<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronLeft, ChevronRight, Filter } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import type { Task, TaskPriority } from '@/types/backlog'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const props = defineProps<{
  tasks: Task[]
  teamMembers: TeamUser[]
}>()

const emit = defineEmits<{
  taskClick: [task: Task]
  taskDueChange: [taskId: string, dueAt: string]
}>()

function getUserById(id: string): TeamUser | undefined {
  return props.teamMembers.find(u => u.id === id)
}

// ============ DATE LOGIC ============

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

const today = new Date()
const weekOffset = ref(0)

const weekStart = computed(() => {
  const monday = getMonday(today)
  monday.setDate(monday.getDate() + weekOffset.value * 7)
  return monday
})

const weekEnd = computed(() => {
  const end = new Date(weekStart.value)
  end.setDate(end.getDate() + 13)
  return end
})

const days = computed(() => {
  const result: Date[] = []
  const d = new Date(weekStart.value)
  for (let i = 0; i < 14; i++) {
    result.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return result
})

function prevWeek() { weekOffset.value -= 1 }
function nextWeek() { weekOffset.value += 1 }
function goToday() { weekOffset.value = 0 }

const dateRangeLabel = computed(() => {
  const start = weekStart.value
  const end = weekEnd.value
  const sMonth = start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  const eMonth = end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  return `${sMonth} - ${eMonth}`
})

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function dayName(date: Date) { return DAY_NAMES[date.getDay()] }
function dayNumber(date: Date) { return date.getDate() }

function isToday(date: Date) {
  return date.toDateString() === today.toDateString()
}

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6
}

// ============ TASK POSITIONING ============

function getTaskDate(task: Task): Date | null {
  if (task.dueAt) return new Date(task.dueAt)
  if (task.completedAt && task.status === 'done') return new Date(task.completedAt)
  if (task.startedAt) return new Date(task.startedAt)
  return new Date(task.createdAt)
}

function dayKey(date: Date): string {
  return date.toDateString()
}

// Mutable task arrays per day — vuedraggable modifies these directly
const dayTasks = ref<Record<string, Task[]>>({})
const isDragging = ref(false)

function rebuildDayTasks() {
  const map: Record<string, Task[]> = {}
  for (const day of days.value) {
    map[dayKey(day)] = []
  }
  for (const task of props.tasks) {
    const date = getTaskDate(task)
    if (!date) continue
    const key = date.toDateString()
    if (map[key]) {
      map[key].push(task)
    }
  }
  dayTasks.value = map
}

watch([() => props.tasks, days], () => {
  rebuildDayTasks()
}, { immediate: true, deep: true })

// Count tasks visible in current range
const visibleTaskCount = computed(() => {
  let count = 0
  for (const day of days.value) {
    count += (dayTasks.value[dayKey(day)] || []).length
  }
  return count
})

// When a task is dropped into a day column, update its dueAt
function onDayChange(date: Date, evt: any) {
  if (!evt.added) return
  const task = evt.added.element as Task
  // Build ISO date string for the target day (noon to avoid timezone issues)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const newDueAt = `${y}-${m}-${d}T12:00:00.000Z`
  emit('taskDueChange', task.id, newDueAt)
}

// ============ STYLING ============

function priorityBadgeStyle(priority: TaskPriority) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700 border border-red-200'
    case 'medium': return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
    case 'low': return 'bg-green-100 text-green-700 border border-green-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

function typeBadgeStyle(type: string) {
  switch (type) {
    case 'design': return 'bg-purple-50/80 text-purple-600'
    case 'development': return 'bg-blue-50/80 text-blue-600'
    case 'testing': return 'bg-green-50/80 text-green-600'
    case 'review': return 'bg-cyan-50/80 text-cyan-600'
    case 'research': return 'bg-yellow-50/80 text-yellow-600'
    case 'fix': return 'bg-red-50/80 text-red-600'
    case 'documentation': return 'bg-gray-50/80 text-gray-500'
    case 'deployment': return 'bg-orange-50/80 text-orange-600'
    default: return 'bg-gray-50/80 text-gray-500'
  }
}

function typeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function cardBorderColor(task: Task) {
  switch (task.status) {
    case 'done': return 'border-l-[#00c875]'
    case 'in_review': return 'border-l-[#579bfc]'
    case 'in_progress': return 'border-l-[#fdab3d]'
    default: return 'border-l-[#c4c4c4]'
  }
}

function formatTaskDate(task: Task) {
  const date = getTaskDate(task)
  if (!date) return ''
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' at ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase()
}

function avatarZIndex(index: unknown): number {
  return 3 - Number(index)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Timeline Header: Date navigation -->
    <div class="flex items-center justify-between px-2 py-3">
      <div class="flex items-center gap-1">
        <span class="text-sm text-gray-500 font-medium">
          {{ visibleTaskCount }} task{{ visibleTaskCount !== 1 ? 's' : '' }} in view
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="goToday"
          class="px-2.5 py-1 text-xs font-medium text-[#4857FE] bg-[#4857FE]/5 rounded-md hover:bg-[#4857FE]/10 transition-colors"
        >
          Today
        </button>
        <button
          @click="prevWeek"
          class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft :size="16" />
        </button>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg min-w-[180px] justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          <span class="text-sm font-semibold text-gray-700">{{ dateRangeLabel }}</span>
        </div>
        <button
          @click="nextWeek"
          class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronRight :size="16" />
        </button>
        <button class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <Filter :size="14" />
          Filter
        </button>
      </div>
    </div>

    <!-- Timeline Grid -->
    <div class="flex-1 overflow-x-auto overflow-y-auto border-t border-gray-200">
      <div class="min-w-max h-full flex flex-col">
        <!-- Day Headers -->
        <div class="flex sticky top-0 z-10 bg-white border-b border-gray-200">
          <div
            v-for="day in days"
            :key="day.toISOString()"
            class="flex-shrink-0 w-[200px] px-3 py-2.5 text-center border-r border-gray-100 last:border-r-0"
            :class="[
              isToday(day) ? 'bg-[#4857FE]/5' : isWeekend(day) ? 'bg-gray-50/50' : '',
            ]"
          >
            <div class="flex items-center justify-center gap-2">
              <span
                class="text-[11px] font-bold tracking-wider"
                :class="isToday(day) ? 'text-[#4857FE]' : 'text-gray-400'"
              >
                {{ dayName(day) }}
              </span>
              <span
                class="text-sm font-bold"
                :class="[
                  isToday(day)
                    ? 'bg-[#4857FE] text-white w-7 h-7 rounded-full flex items-center justify-center'
                    : 'text-gray-700'
                ]"
              >
                {{ dayNumber(day) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Task Rows (drag-and-drop per day column) -->
        <div class="flex flex-1 relative">
          <div
            v-for="day in days"
            :key="'col-' + day.toISOString()"
            class="flex-shrink-0 w-[200px] border-r border-gray-100 last:border-r-0 relative"
            :class="[
              isToday(day) ? 'bg-[#FFF5F5]' : isWeekend(day) ? 'bg-gray-50/30' : '',
            ]"
          >
            <!-- Today indicator line -->
            <div
              v-if="isToday(day)"
              class="absolute top-0 left-1/2 -translate-x-px w-0.5 h-full bg-red-400/60 z-[1]"
            >
              <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-red-400"></div>
            </div>

            <!-- Draggable zone for this day -->
            <draggable
              v-model="dayTasks[dayKey(day)]"
              group="timeline"
              item-key="id"
              :animation="200"
              ghost-class="timeline-ghost"
              drag-class="timeline-drag"
              class="p-2 space-y-2.5 relative z-[2] h-full min-h-[120px]"
              @start="isDragging = true"
              @end="isDragging = false"
              @change="(evt: any) => onDayChange(day, evt)"
            >
              <template #item="{ element: task }">
                <div
                  class="bg-white rounded-xl border border-gray-200/80 hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-grab active:cursor-grabbing border-l-[3px]"
                  :class="cardBorderColor(task)"
                  @click="emit('taskClick', task)"
                >
                  <div class="p-3">
                    <!-- Title -->
                    <h4 class="text-[13px] font-semibold text-gray-900 line-clamp-2 leading-snug mb-1">
                      {{ task.title }}
                    </h4>

                    <!-- Date -->
                    <p class="text-[10px] text-gray-400 mb-2.5">
                      {{ formatTaskDate(task) }}
                    </p>

                    <!-- Badges row -->
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span
                          v-if="task.type"
                          class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                          :class="typeBadgeStyle(task.type)"
                        >
                          {{ typeLabel(task.type) }}
                        </span>
                        <span
                          class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                          :class="priorityBadgeStyle(task.priority)"
                        >
                          {{ priorityLabel(task.priority) }}
                        </span>
                      </div>

                      <!-- Assignee avatars -->
                      <div class="flex items-center -space-x-1.5">
                        <template v-if="task.assigneeUserIds && task.assigneeUserIds.length > 0">
                          <div
                            v-for="(userId, i) in task.assigneeUserIds.slice(0, 2)"
                            :key="userId"
                            class="w-5 h-5 rounded-full border-2 border-white overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[7px] font-bold"
                            :style="{ zIndex: avatarZIndex(i) }"
                            :title="getUserById(userId)?.name || userId"
                          >
                            <img v-if="getUserById(userId)?.avatar" :src="getUserById(userId)!.avatar!" class="w-5 h-5 rounded-full object-cover" />
                            <span v-else>{{ (getUserById(userId)?.name || '?')[0] }}</span>
                          </div>
                          <div
                            v-if="task.assigneeUserIds.length > 2"
                            class="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold"
                            :style="{ backgroundColor: '#ff7575', color: '#fff' }"
                          >
                            +{{ task.assigneeUserIds.length - 2 }}
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </draggable>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-ghost {
  opacity: 0.4;
}
.timeline-ghost > * {
  border: 2px dashed #4857FE !important;
}
.timeline-drag {
  opacity: 0.9;
  transform: rotate(2deg);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}
</style>
