<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useProductStore } from '@/stores/products'
import { useBacklogStore } from '@/stores/backlog'
import { useInitiativesStore } from '@/stores/initiatives'
import { useActivitiesStore } from '@/stores/activities'
import { useProductMembersStore } from '@/stores/productMembers'
import { useAuthStore } from '@/stores/auth'
import {
  Loader2, Plus, X, Search, Clock, UserPlus, Users,
  Signal, FileText, Type, Tag, CalendarClock, Hourglass, User,
} from 'lucide-vue-next'
import type { Activity } from '@/stores/activities'

const productStore = useProductStore()
const backlogStore = useBacklogStore()
const initiativesStore = useInitiativesStore()
const activitiesStore = useActivitiesStore()
const membersStore = useProductMembersStore()
const authStore = useAuthStore()

// Team member search
const showAddMember = ref(false)
const memberSearch = ref('')
const memberSearchResults = ref<{ id: string; name: string; email: string; avatar: string | null }[]>([])
const memberSearchLoading = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

// Activity helpers (no expansion needed)

onMounted(() => {
  loadData()
})

watch(() => productStore.activeProductName, () => {
  loadData()
})

function loadData() {
  const product = productStore.activeProductName
  backlogStore.fetchStories(product)
  initiativesStore.fetchInitiatives()
  activitiesStore.fetchActivities(product)
  membersStore.fetchMembers(product)
}

// Stats
const totalStories = computed(() => backlogStore.stories.length)
const totalInitiatives = computed(() => initiativesStore.initiatives.length)
const inProgressStories = computed(() => backlogStore.stories.filter(i => i.status === 'in_progress').length)
const completedStories = computed(() => backlogStore.stories.filter(i => i.status === 'completed').length)

// Group activities by date
const groupedActivities = computed(() => {
  const groups: { label: string; activities: Activity[] }[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const dateMap = new Map<string, Activity[]>()

  for (const activity of activitiesStore.activities) {
    const d = new Date(activity.createdAt)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    let label: string
    if (day.getTime() === today.getTime()) {
      label = `Today ${formatDateHeader(d)}`
    } else if (day.getTime() === yesterday.getTime()) {
      label = `Yesterday, ${formatDateHeader(d)}`
    } else {
      label = formatDateHeader(d)
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

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]!
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}


function userInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function activityActionColor(action: string) {
  switch (action) {
    case 'created': return 'bg-[#00c875]'
    case 'updated': return 'bg-[#579bfc]'
    case 'deleted': return 'bg-[#e2445c]'
    default: return 'bg-gray-400'
  }
}

function formatRelativeTime(dateStr: string) {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function entityTypeLabel(type: string) {
  switch (type) {
    case 'initiative': return 'Initiative'
    case 'story': return 'Story'
    case 'task': return 'Task'
    default: return type
  }
}

function statusStyle(status: string) {
  switch (status) {
    case 'initialized': return 'bg-[#ff69b4] text-white'
    case 'pending': return 'bg-[#a25ddc] text-white'
    case 'planning': return 'bg-[#fdab3d] text-white'
    case 'active': case 'in_progress': return 'bg-[#00c875] text-white'
    case 'paused': case 'in_review': return 'bg-[#e2445c] text-white'
    case 'completed': case 'done': return 'bg-[#00c875] text-white'
    case 'backlog': case 'created': return 'bg-[#c4c4c4] text-white'
    case 'drafted': return 'bg-[#579bfc] text-white'
    case 'assigned': return 'bg-[#a25ddc] text-white'
    case 'ready': return 'bg-[#579bfc] text-white'
    case 'overdue': return 'bg-red-500 text-white'
    case 'blocked': return 'bg-[#e2445c] text-white'
    case 'archived': return 'bg-gray-400 text-white'
    default: return 'bg-gray-200 text-gray-600'
  }
}

function formatLabel(field: string) {
  return field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function changeFieldIcon(field: string) {
  switch (field) {
    case 'status': return Signal
    case 'priority': return Signal
    case 'type': return Type
    case 'title': return FileText
    case 'owner': case 'leader': return User
    case 'initiative': return Tag
    case 'delivery': return CalendarClock
    case 'estimate': return Hourglass
    default: return FileText
  }
}

function changeIconColor(change: { from: string | null; to: string | null }): string {
  if (!change.from && change.to) return 'text-green-500'
  if (change.from && !change.to) return 'text-red-400'
  return 'text-[#579bfc]'
}

function changeDescription(change: { field: string; from: string | null; to: string | null }): string {
  if (!change.from && change.to) return `Set ${formatLabel(change.field)}`
  if (change.from && !change.to) return `Cleared ${formatLabel(change.field)}`
  return `Changed ${formatLabel(change.field)}`
}

// Member search
async function searchUsers(query: string) {
  memberSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const all = await res.json()
      // Filter out existing members
      const existingIds = new Set(membersStore.members.map(m => m.userId))
      memberSearchResults.value = all.filter((u: any) => !existingIds.has(u.id))
    }
  } catch {
    memberSearchResults.value = []
  } finally {
    memberSearchLoading.value = false
  }
}

function onMemberSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    searchUsers(memberSearch.value)
  }, 200)
}

async function addMember(user: { id: string; name: string }) {
  const pname = productStore.activeProductName
  if (!pname) return
  await membersStore.addMember(pname, user.id)
  memberSearch.value = ''
  memberSearchResults.value = []
  showAddMember.value = false
}

async function removeMember(userId: string) {
  const pname = productStore.activeProductName
  if (!pname) return
  await membersStore.removeMember(pname, userId)
}

function openAddMember() {
  showAddMember.value = true
  memberSearch.value = ''
  memberSearchResults.value = []
  searchUsers('')
}

</script>

<template>
  <div class="flex flex-col h-full overflow-auto p-8" style="background-color: #F8FAFF">
    <div class="max-w-[1200px] mx-auto w-full">
      <!-- Page title -->
      <div class="mb-6">
        <h1 class="text-2xl font-semibold text-gray-900">Product Overview</h1>
        <p class="text-sm text-gray-400 mt-1">{{ productStore.activeProductName }} — dashboard & activity</p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Stories</p>
          <p class="text-2xl font-semibold text-gray-900 mt-2">{{ totalStories }}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Initiatives</p>
          <p class="text-2xl font-semibold text-gray-900 mt-2">{{ totalInitiatives }}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">In Progress</p>
          <p class="text-2xl font-semibold text-blue-600 mt-2">{{ inProgressStories }}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Completed</p>
          <p class="text-2xl font-semibold text-green-600 mt-2">{{ completedStories }}</p>
        </div>
      </div>

      <!-- Two-column layout -->
      <div class="grid grid-cols-[1fr_320px] gap-6">
        <!-- Left: Activity Timeline -->
        <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div class="flex items-center gap-2">
              <Clock :size="18" class="text-gray-400" />
              <h2 class="text-sm font-semibold text-gray-900">Activities</h2>
            </div>
            <button
              v-if="activitiesStore.activities.length > 0"
              class="text-xs text-gray-400 hover:text-gray-600"
              @click="activitiesStore.fetchActivities()"
            >
              Refresh
            </button>
          </div>

          <!-- Loading -->
          <div v-if="activitiesStore.loading" class="flex items-center justify-center py-16">
            <Loader2 :size="20" class="animate-spin text-gray-400" />
          </div>

          <!-- Empty -->
          <div v-else-if="activitiesStore.activities.length === 0" class="text-center py-16">
            <Clock :size="32" class="text-gray-200 mx-auto mb-3" />
            <p class="text-sm text-gray-400">No activity yet</p>
            <p class="text-xs text-gray-300 mt-1">Changes to stories and initiatives will appear here</p>
          </div>

          <!-- Activity groups -->
          <div v-else>
            <div v-for="group in groupedActivities" :key="group.label">
              <!-- Date header -->
              <div class="pt-3 pb-1.5 px-5">
                <span class="text-[11px] font-bold tracking-wider text-[#4857FE]">{{ group.label }}</span>
              </div>

              <!-- Activities in group -->
              <div class="relative px-5">
                <!-- Timeline line -->
                <div class="absolute left-[35px] top-0 bottom-0 w-px bg-gray-100"></div>

                <div v-for="activity in group.activities" :key="activity.id" class="relative py-3">
                  <div class="flex items-start gap-3">
                    <!-- Avatar with action dot -->
                    <div class="relative shrink-0 z-10">
                      <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden ring-2 ring-white">
                        <UploadAssetImg
                          v-if="activity.userAvatar"
                          :src="activity.userAvatar"
                          class="w-8 h-8 rounded-full object-cover"
                          :alt="activity.userName"
                        />
                        <span v-else>{{ userInitials(activity.userName) }}</span>
                      </div>
                      <div
                        class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                        :class="activityActionColor(activity.action)"
                      ></div>
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <!-- Row 1: User name + entity tag (left) + Time (right) -->
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span class="text-sm font-semibold text-gray-900">{{ activity.userName }}</span>
                          <span
                            class="text-[9px] font-medium rounded px-1.5 py-0.5 truncate max-w-[160px]"
                            :class="activity.entityType === 'story' ? 'text-orange-600 bg-orange-50' : activity.entityType === 'task' ? 'text-[#4857FE] bg-[#4857FE]/8' : 'text-purple-600 bg-purple-50'"
                            :title="activity.entityTitle"
                          >{{ entityTypeLabel(activity.entityType) }}: {{ activity.entityTitle }}</span>
                        </div>
                        <span class="text-[11px] text-gray-400 shrink-0 ml-2">{{ formatRelativeTime(activity.createdAt) }}</span>
                      </div>

                      <!-- Row 2: Action details inline -->
                      <div class="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                        <!-- Created -->
                        <div v-if="activity.action === 'created'" class="flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-[#00c875] shrink-0"></span>
                          <span class="text-xs font-medium text-gray-600">{{ entityTypeLabel(activity.entityType) }} created</span>
                        </div>
                        <!-- Deleted -->
                        <div v-else-if="activity.action === 'deleted'" class="flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                          <span class="text-xs font-medium text-gray-600">{{ entityTypeLabel(activity.entityType) }} deleted</span>
                        </div>
                        <!-- Updated — descriptive change lines -->
                        <div v-else-if="activity.changes && activity.changes.length > 0" class="space-y-2">
                          <div v-for="(change, ci) in activity.changes" :key="ci" class="flex items-start gap-2">
                            <component :is="changeFieldIcon(change.field)" :size="12" class="shrink-0 mt-0.5" :class="changeIconColor(change)" />
                            <div class="text-xs text-gray-600 min-w-0">
                              <span class="font-medium">{{ changeDescription(change) }}</span>

                              <!-- Status: colored pill badges -->
                              <template v-if="change.field === 'status'">
                                <span
                                  v-if="change.from"
                                  class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ml-1 align-middle"
                                  :class="statusStyle(change.from)"
                                >{{ formatLabel(change.from) }}</span>
                                <span v-if="change.from && change.to" class="text-gray-300 mx-0.5 align-middle">→</span>
                                <span
                                  v-if="change.to"
                                  class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold align-middle"
                                  :class="statusStyle(change.to)"
                                >{{ formatLabel(change.to) }}</span>
                              </template>

                              <!-- Other fields: text badges -->
                              <template v-else-if="change.field !== 'description' && change.field !== 'acceptanceCriteria' && change.field !== 'ownerAvatar'">
                                <span v-if="change.from" class="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium ml-1 align-middle">{{ formatLabel(change.from) }}</span>
                                <span v-if="change.from && change.to" class="text-gray-300 mx-0.5 align-middle">→</span>
                                <span v-if="change.to" class="inline-flex items-center px-1.5 py-0.5 rounded bg-[#4857FE]/10 text-[#4857FE] text-[10px] font-medium align-middle">{{ formatLabel(change.to) }}</span>
                              </template>
                            </div>
                          </div>
                        </div>
                        <!-- Fallback -->
                        <div v-else class="flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-[#579bfc] shrink-0"></span>
                          <span class="text-xs font-medium text-gray-600">{{ formatLabel(activity.action) }} {{ entityTypeLabel(activity.entityType).toLowerCase() }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Team Members -->
        <div class="bg-white rounded-xl border border-gray-100 h-fit">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div class="flex items-center gap-2">
              <Users :size="18" class="text-gray-400" />
              <h2 class="text-sm font-semibold text-gray-900">Team Members</h2>
              <span class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{{ membersStore.members.length }}</span>
            </div>
            <button
              class="flex items-center gap-1 text-xs text-[#4857FE] font-medium hover:text-[#3E4BDE]"
              @click="openAddMember"
            >
              <UserPlus :size="14" />
              Add
            </button>
          </div>

          <!-- Add member search -->
          <div v-if="showAddMember" class="px-5 py-3 border-b border-gray-100">
            <div class="relative">
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  v-model="memberSearch"
                  class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Search users..."
                  autofocus
                  @input="onMemberSearchInput"
                />
                <button @click="showAddMember = false" class="text-gray-400 hover:text-gray-600 shrink-0">
                  <X :size="14" />
                </button>
              </div>

              <!-- Results dropdown -->
              <div
                v-if="memberSearchResults.length > 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[200px] overflow-auto"
              >
                <button
                  v-for="user in memberSearchResults"
                  :key="user.id"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                  @click="addMember(user)"
                >
                  <div class="w-7 h-7 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0">
                    <UploadAssetImg v-if="user.avatar" :src="user.avatar" class="w-7 h-7 rounded-full object-cover" :alt="user.name" />
                    <span v-else>{{ userInitials(user.name) }}</span>
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</span>
                    <span class="text-[10px] text-gray-400 truncate">{{ user.email }}</span>
                  </div>
                </button>
              </div>

              <div
                v-else-if="memberSearch && !memberSearchLoading && memberSearchResults.length === 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3"
              >
                <p class="text-xs text-gray-400 text-center">No users found</p>
              </div>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="membersStore.loading" class="flex items-center justify-center py-8">
            <Loader2 :size="16" class="animate-spin text-gray-400" />
          </div>

          <!-- Empty -->
          <div v-else-if="membersStore.members.length === 0" class="text-center py-8 px-5">
            <Users :size="24" class="text-gray-200 mx-auto mb-2" />
            <p class="text-xs text-gray-400">No team members yet</p>
          </div>

          <!-- Members list -->
          <div v-else class="divide-y divide-gray-50">
            <div
              v-for="member in membersStore.members"
              :key="member.id"
              class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors group"
            >
              <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0">
                <UploadAssetImg v-if="member.userAvatar" :src="member.userAvatar" class="w-8 h-8 rounded-full object-cover" :alt="member.userName" />
                <span v-else>{{ userInitials(member.userName) }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">{{ member.userName }}</p>
                <p class="text-[11px] text-gray-400 truncate">{{ member.userEmail }}</p>
              </div>
              <span class="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded capitalize">{{ member.role }}</span>
              <button
                class="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                @click="removeMember(member.userId)"
              >
                <X :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
