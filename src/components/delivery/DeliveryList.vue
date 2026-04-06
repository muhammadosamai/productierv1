<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronUp, ChevronDown, MoreHorizontal, Plus, Search, Filter } from 'lucide-vue-next'
import type { Task, TaskPriority, TaskStatus } from '@/types/backlog'

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
}>()

function getUserById(id: string): TeamUser | undefined {
  return props.teamMembers.find(u => u.id === id)
}

// ============ STATUS GROUPS ============

interface StatusGroup {
  key: 'todo' | 'in_progress' | 'review' | 'done'
  label: string
  color: string
}

const statusGroups: StatusGroup[] = [
  { key: 'todo', label: 'TO DO', color: '#c4c4c4' },
  { key: 'in_progress', label: 'ON PROGRESS', color: '#fdab3d' },
  { key: 'review', label: 'IN REVIEW', color: '#579bfc' },
  { key: 'done', label: 'DONE', color: '#00c875' },
]

// Collapsed state per group
const collapsed = ref<Record<string, boolean>>({
  todo: false,
  in_progress: false,
  review: false,
  done: false,
})

function toggleCollapse(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}

// Group tasks by status
const tasksByStatus = computed(() => {
  const map: Record<StatusGroup['key'], Task[]> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  }
  for (const task of props.tasks) {
    if (task.status === 'created' || task.status === 'assigned') {
      map.todo.push(task)
    } else if (task.status === 'in_review') {
      map.review.push(task)
    } else if (task.status === 'in_progress') {
      map.in_progress.push(task)
    } else if (task.status === 'done') {
      map.done.push(task)
    }
  }
  return map
})

// ============ STYLING ============

function priorityBadgeStyle(priority: TaskPriority) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700 border border-red-200'
    case 'medium': return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
    case 'low': return 'bg-green-100 text-green-700 border border-green-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function taskShortId(task: Task) {
  return 'TSK-' + task.id.slice(-5).toUpperCase()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header bar -->
    <div class="flex items-center justify-between px-6 py-3">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500 font-medium">
          {{ props.tasks.length }} task{{ props.tasks.length !== 1 ? 's' : '' }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
          <Search :size="14" class="text-gray-400 shrink-0" />
          <input
            class="text-sm text-gray-700 bg-transparent outline-none w-40 placeholder-gray-400"
            placeholder="Search team"
          />
        </div>
        <button class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <Filter :size="14" />
          Filter
        </button>
      </div>
    </div>

    <!-- List content -->
    <div class="flex-1 overflow-y-auto px-6 pb-6">
      <div class="space-y-4">
        <div
          v-for="group in statusGroups"
          :key="group.key"
          class="bg-white rounded-xl border border-gray-200/80 overflow-hidden"
        >
          <!-- Group header -->
          <div
            class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
            @click="toggleCollapse(group.key)"
          >
            <div class="flex items-center gap-2.5">
              <div class="w-1 h-5 rounded-full" :style="{ backgroundColor: group.color }"></div>
              <span
                class="text-xs font-bold tracking-wider"
                :style="{ color: group.color }"
              >
                {{ group.label }}  ({{ tasksByStatus[group.key]?.length || 0 }})
              </span>
              <component
                :is="collapsed[group.key] ? ChevronDown : ChevronUp"
                :size="14"
                class="text-gray-400"
              />
            </div>
            <button
              class="text-gray-400 hover:text-[#4857FE] transition-colors p-1 rounded hover:bg-gray-100"
              @click.stop
            >
              <Plus :size="14" />
            </button>
          </div>

          <!-- Table -->
          <div v-if="!collapsed[group.key] && tasksByStatus[group.key]?.length > 0">
            <!-- Column headers -->
            <div class="grid grid-cols-[1fr_1.2fr_120px_100px_100px_40px] gap-x-3 items-center px-5 py-2 border-t border-b border-gray-100 bg-gray-50/50">
              <span class="text-[11px] font-medium text-gray-400 tracking-wide">Task Name</span>
              <span class="text-[11px] font-medium text-gray-400 tracking-wide">Description</span>
              <span class="text-[11px] font-medium text-gray-400 tracking-wide">Deadline</span>
              <span class="text-[11px] font-medium text-gray-400 tracking-wide">People</span>
              <span class="text-[11px] font-medium text-gray-400 tracking-wide">Priority</span>
              <span></span>
            </div>

            <!-- Task rows -->
            <div class="divide-y divide-gray-100">
              <div
                v-for="task in tasksByStatus[group.key]"
                :key="task.id"
                class="grid grid-cols-[1fr_1.2fr_120px_100px_100px_40px] gap-x-3 items-center px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer group"
                @click="emit('taskClick', task)"
              >
                <!-- Task name -->
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-sm text-gray-800 truncate font-medium">{{ task.title }}</span>
                </div>

                <!-- Description -->
                <div class="min-w-0">
                  <span class="text-sm text-gray-500 truncate block">{{ task.description || '—' }}</span>
                </div>

                <!-- Deadline -->
                <div>
                  <span class="text-sm text-gray-600">{{ formatDate(task.dueAt) }}</span>
                </div>

                <!-- People -->
                <div class="flex items-center -space-x-1.5">
                  <template v-if="task.assigneeUserIds && task.assigneeUserIds.length > 0">
                    <div
                      v-for="(userId, i) in task.assigneeUserIds.slice(0, 3)"
                      :key="userId"
                      class="w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold"
                      :style="{ zIndex: 3 - i }"
                      :title="getUserById(userId)?.name || userId"
                    >
                      <img v-if="getUserById(userId)?.avatar" :src="getUserById(userId)!.avatar!" class="w-7 h-7 rounded-full object-cover" />
                      <span v-else>{{ (getUserById(userId)?.name || '?')[0] }}</span>
                    </div>
                    <div
                      v-if="task.assigneeUserIds.length > 3"
                      class="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold"
                      :style="{ backgroundColor: '#fdab3d', color: '#fff' }"
                    >
                      +{{ task.assigneeUserIds.length - 3 }}
                    </div>
                  </template>
                  <div v-else class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                    <span class="text-[9px] text-gray-400">?</span>
                  </div>
                </div>

                <!-- Priority -->
                <div>
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold"
                    :class="priorityBadgeStyle(task.priority)"
                  >
                    {{ priorityLabel(task.priority) }}
                  </span>
                </div>

                <!-- More actions -->
                <div class="flex items-center justify-center">
                  <button
                    class="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-gray-100"
                    @click.stop
                  >
                    <MoreHorizontal :size="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty collapsed or no tasks -->
          <div
            v-if="!collapsed[group.key] && (!tasksByStatus[group.key] || tasksByStatus[group.key].length === 0)"
            class="px-5 py-4 border-t border-gray-100"
          >
            <p class="text-xs text-gray-400 text-center">No tasks</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
