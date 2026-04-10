<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  X, Maximize2, Copy, Loader2, Check,
  Mail, Shield, CalendarDays,
  Lightbulb, BookOpen, CheckSquare, Package,
} from 'lucide-vue-next'
import { useCopyLink } from '@/utils/useCopyLink'

interface TeamUser {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  createdAt?: string
}

interface WorkData {
  initiatives: any[]
  stories: any[]
  tasks: any[]
  deliveries: any[]
}

const props = defineProps<{
  member: TeamUser | null
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const authStore = useAuthStore()
const { copied, copyLink } = useCopyLink()
const activeTab = ref<'initiatives' | 'stories' | 'tasks' | 'deliveries'>('tasks')
const workData = ref<WorkData | null>(null)
const loadingWork = ref(false)

const tabs = [
  { key: 'initiatives' as const, label: 'Initiatives', icon: Lightbulb },
  { key: 'stories' as const, label: 'Stories', icon: BookOpen },
  { key: 'tasks' as const, label: 'Tasks', icon: CheckSquare },
  { key: 'deliveries' as const, label: 'Deliveries', icon: Package },
]

watch(() => [props.open, props.member], async ([isOpen, m]) => {
  if (isOpen && m) {
    activeTab.value = 'tasks'
    await fetchWork((m as TeamUser).id)
  } else {
    workData.value = null
  }
}, { immediate: true })

async function fetchWork(userId: string) {
  loadingWork.value = true
  try {
    const res = await fetch(`/api/auth/users/${userId}/work`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      workData.value = await res.json()
    }
  } catch { /* ignore */ } finally {
    loadingWork.value = false
  }
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function roleStyle(role: string) {
  switch (role) {
    case 'super_admin':
    case 'admin': return 'bg-red-100 text-red-700 border border-red-200'
    case 'product_admin':
    case 'product_manager': return 'bg-purple-100 text-purple-700 border border-purple-200'
    case 'business_analyst': return 'bg-blue-100 text-blue-700 border border-blue-200'
    case 'developer': return 'bg-green-100 text-green-700 border border-green-200'
    case 'viewer': return 'bg-gray-100 text-gray-600 border border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusColor(status: string) {
  switch (status) {
    case 'done': case 'completed': return 'bg-emerald-100 text-emerald-700'
    case 'in_progress': case 'active': return 'bg-blue-100 text-blue-700'
    case 'in_review': return 'bg-violet-100 text-violet-700'
    case 'blocked': case 'overdue': return 'bg-red-100 text-red-700'
    case 'paused': return 'bg-amber-100 text-amber-700'
    case 'backlog': case 'planning': case 'initialized': case 'created': case 'ready': return 'bg-gray-100 text-gray-600'
    case 'assigned': return 'bg-sky-100 text-sky-700'
    case 'archived': return 'bg-gray-100 text-gray-500'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function priorityDot(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-500'
    case 'medium': return 'bg-yellow-500'
    case 'low': return 'bg-green-500'
    default: return 'bg-gray-400'
  }
}

function tabCount(key: string): number {
  if (!workData.value) return 0
  return (workData.value as any)[key]?.length || 0
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="panel-backdrop">
      <div
        v-if="open && member"
        class="fixed inset-0 bg-black/20 z-40"
        @click="emit('close')"
      ></div>
    </Transition>

    <!-- Slide-over Panel -->
    <Transition name="panel-slide">
      <div
        v-if="open && member"
        class="fixed top-0 right-0 bottom-0 w-[520px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div class="flex items-center gap-2">
            <button class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Expand">
              <Maximize2 :size="14" />
            </button>
            <button
              class="p-1 rounded-md hover:bg-gray-100 transition-colors"
              :class="copied ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'"
              title="Copy link"
              @click="copyLink(`${window.location.origin}/team?member=${member.id}`)"
            >
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
            </button>
            <span class="text-[11px] font-mono text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">USR-{{ member.id.slice(-5).toUpperCase() }}</span>
          </div>
          <button
            class="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 overflow-y-auto">
          <!-- Profile Section -->
          <div class="px-6 pt-5 pb-4 flex items-center gap-4">
            <div class="w-14 h-14 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-xl font-bold shrink-0">
              <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-14 h-14 rounded-full object-cover" />
              <span v-else>{{ getInitials(member.name) }}</span>
            </div>
            <div class="min-w-0">
              <h2 class="text-base font-bold text-gray-900 leading-snug">{{ member.name }}</h2>
              <div class="flex items-center gap-2 mt-1">
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                  :class="roleStyle(member.role)"
                >
                  <Shield :size="9" />
                  {{ roleLabel(member.role) }}
                </span>
                <span class="text-[11px] text-gray-400">{{ member.email }}</span>
              </div>
            </div>
          </div>

          <!-- Details row -->
          <div class="px-6 pb-4 flex items-center gap-4 text-[11px] text-gray-500">
            <span class="flex items-center gap-1"><Mail :size="11" class="text-gray-400" /> {{ member.email }}</span>
            <span class="flex items-center gap-1"><CalendarDays :size="11" class="text-gray-400" /> Joined {{ formatDate(member.createdAt) }}</span>
          </div>

          <!-- Tabs -->
          <div class="border-t border-gray-100">
            <div class="flex px-4">
              <button
                v-for="tab in tabs"
                :key="tab.key"
                class="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors"
                :class="activeTab === tab.key
                  ? 'border-[#4857FE] text-[#4857FE]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                @click="activeTab = tab.key"
              >
                <component :is="tab.icon" :size="13" />
                {{ tab.label }}
                <span
                  v-if="workData"
                  class="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                  :class="activeTab === tab.key ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'bg-gray-100 text-gray-500'"
                >
                  {{ tabCount(tab.key) }}
                </span>
              </button>
            </div>
          </div>

          <!-- Tab Content -->
          <div class="px-4 py-3">
            <!-- Loading -->
            <div v-if="loadingWork" class="flex items-center justify-center py-12">
              <Loader2 :size="20" class="text-gray-400 animate-spin" />
            </div>

            <!-- No data -->
            <div v-else-if="!workData || tabCount(activeTab) === 0" class="text-center py-12">
              <p class="text-sm text-gray-400">No {{ activeTab }} found</p>
            </div>

            <!-- Initiatives Tab -->
            <template v-else-if="activeTab === 'initiatives'">
              <div class="space-y-1.5">
                <div
                  v-for="item in workData.initiatives"
                  :key="item.id"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div class="w-1.5 h-1.5 rounded-full shrink-0" :class="priorityDot(item.priority)"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-900 truncate">{{ item.title }}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">{{ item.product }} · {{ item.period || '—' }}</p>
                  </div>
                  <span
                    class="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                    :class="statusColor(item.status)"
                  >{{ statusLabel(item.status) }}</span>
                </div>
              </div>
            </template>

            <!-- Stories Tab -->
            <template v-else-if="activeTab === 'stories'">
              <div class="space-y-1.5">
                <div
                  v-for="item in workData.stories"
                  :key="item.id"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div class="w-1.5 h-1.5 rounded-full shrink-0" :class="priorityDot(item.priority)"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-900 truncate">{{ item.title }}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">
                      {{ item.product }}
                      <span v-if="item.initiative"> · {{ item.initiative }}</span>
                      <span v-if="item.type"> · {{ item.type }}</span>
                    </p>
                  </div>
                  <span
                    class="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                    :class="statusColor(item.status)"
                  >{{ statusLabel(item.status) }}</span>
                </div>
              </div>
            </template>

            <!-- Tasks Tab -->
            <template v-else-if="activeTab === 'tasks'">
              <div class="space-y-1.5">
                <div
                  v-for="item in workData.tasks"
                  :key="item.id"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div class="w-1.5 h-1.5 rounded-full shrink-0" :class="priorityDot(item.priority)"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-900 truncate">{{ item.title }}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">
                      {{ item.productId }}
                      <span v-if="item.dueAt"> · Due {{ formatDate(item.dueAt) }}</span>
                    </p>
                  </div>
                  <span
                    class="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                    :class="statusColor(item.status)"
                  >{{ statusLabel(item.status) }}</span>
                </div>
              </div>
            </template>

            <!-- Deliveries Tab -->
            <template v-else-if="activeTab === 'deliveries'">
              <div class="space-y-1.5">
                <div
                  v-for="item in workData.deliveries"
                  :key="item.id"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-900 truncate">{{ item.title }}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">
                      {{ item.productId }}
                      <span v-if="item.startDate && item.endDate"> · {{ formatDate(item.startDate) }} — {{ formatDate(item.endDate) }}</span>
                    </p>
                  </div>
                  <span
                    class="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                    :class="statusColor(item.status)"
                  >{{ statusLabel(item.status) }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-backdrop-enter-active,
.panel-backdrop-leave-active {
  transition: opacity 0.25s ease;
}
.panel-backdrop-enter-from,
.panel-backdrop-leave-to {
  opacity: 0;
}

.panel-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-slide-leave-active {
  transition: transform 0.2s ease-in;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
}
</style>
