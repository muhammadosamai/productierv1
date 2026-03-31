<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  DashboardPage,
  DashboardPageViewerRole,
  DashboardVisibility,
} from '@/types/dashboard'

interface UserOption {
  id: string
  name: string
  email?: string
}

const props = withDefaults(defineProps<{
  open: boolean
  page: DashboardPage | null
  users: UserOption[]
  canCreateTeamWide: boolean
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: {
    visibility: DashboardVisibility
    viewerUserIds: string[]
    viewers: Array<{ userId: string; role: DashboardPageViewerRole }>
  }): void
}>()

const visibility = ref<DashboardVisibility>('personal')
const selectedViewers = ref<Record<string, DashboardPageViewerRole>>({})
const search = ref('')

watch(() => [props.open, props.page?.id], () => {
  if (!props.page) return
  visibility.value = props.page.visibility
  const nextSelected: Record<string, DashboardPageViewerRole> = {}
  const assignments = Array.isArray(props.page.viewerAssignments) && props.page.viewerAssignments.length > 0
    ? props.page.viewerAssignments
    : (props.page.viewerUserIds || []).map((userId) => ({ userId, role: 'viewer' as const }))
  for (const assignment of assignments) {
    nextSelected[assignment.userId] = assignment.role === 'editor' ? 'editor' : 'viewer'
  }
  selectedViewers.value = nextSelected
  search.value = ''
}, { immediate: true })

const selectedViewerIds = computed(() => Object.keys(selectedViewers.value))

const filteredUsers = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return props.users
  return props.users.filter((user) => {
    const haystack = `${user.name} ${user.email || ''}`.toLowerCase()
    return haystack.includes(term)
  })
})

function toggleUser(userId: string) {
  if (selectedViewers.value[userId]) {
    const next = { ...selectedViewers.value }
    delete next[userId]
    selectedViewers.value = next
    return
  }
  selectedViewers.value = {
    ...selectedViewers.value,
    [userId]: 'viewer',
  }
}

function setUserRole(userId: string, role: DashboardPageViewerRole) {
  if (!selectedViewers.value[userId]) return
  selectedViewers.value = {
    ...selectedViewers.value,
    [userId]: role,
  }
}

function onRoleChange(userId: string, rawValue: string) {
  setUserRole(userId, rawValue === 'editor' ? 'editor' : 'viewer')
}

function onSave() {
  const viewers = selectedViewerIds.value.map((userId) => ({
    userId,
    role: selectedViewers.value[userId] || 'viewer',
  }))
  emit('save', {
    visibility: visibility.value,
    viewerUserIds: viewers.map((viewer) => viewer.userId),
    viewers,
  })
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <div class="w-full max-w-xl rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 class="text-sm font-semibold text-gray-900">Share Dashboard Page</h3>
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <div class="space-y-4 p-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Visibility</label>
          <select
            v-model="visibility"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            :disabled="props.busy"
          >
            <option value="personal">Personal</option>
            <option v-if="props.canCreateTeamWide" value="team">Team-wide</option>
            <option value="invited">Invited users</option>
          </select>
        </div>

        <div v-if="visibility === 'invited'">
          <label class="mb-1 block text-xs font-medium text-gray-600">Invite specific viewers</label>
          <input
            v-model="search"
            type="text"
            class="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Search users by name or email"
          />
          <div class="max-h-56 space-y-1 overflow-auto rounded-lg border border-gray-100 p-2">
            <label
              v-for="user in filteredUsers"
              :key="user.id"
              class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                :checked="selectedViewerIds.includes(user.id)"
                :disabled="props.busy"
                @change="toggleUser(user.id)"
              >
              <div class="min-w-0">
                <p class="truncate text-sm text-gray-800">{{ user.name }}</p>
                <p class="truncate text-xs text-gray-400">{{ user.email }}</p>
              </div>
              <select
                v-if="selectedViewerIds.includes(user.id)"
                class="ml-auto rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
                :value="selectedViewers[user.id] || 'viewer'"
                :disabled="props.busy"
                @change="onRoleChange(user.id, String(($event.target as HTMLSelectElement).value || 'viewer'))"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
        <button
          type="button"
          class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300"
          :disabled="props.busy"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-[#4857FE] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3f4de5] disabled:opacity-60"
          :disabled="props.busy"
          @click="onSave"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
