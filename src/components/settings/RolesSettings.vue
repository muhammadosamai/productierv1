<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRolesStore, type PagePermission } from '@/stores/roles'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, Shield, Eye, EyeOff, Plus, Pencil, User } from 'lucide-vue-next'
import type { UserRole } from '@/types/user'

const rolesStore = useRolesStore()

const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

// Roles that can be configured (exclude super_admin)
const configurableRoles: { key: UserRole; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'product_admin', label: 'Product Admin' },
  { key: 'product_manager', label: 'Product Manager' },
  { key: 'business_analyst', label: 'Business Analyst' },
  { key: 'developer', label: 'Developer' },
  { key: 'viewer', label: 'Viewer' },
]

const pageLabels: Record<string, string> = {
  home: 'Home',
  overview: 'Overview / Metrics',
  wiki: 'Wiki',
  team: 'Team',
  initiatives: 'Initiatives',
  stories: 'Stories',
  tasks: 'Tasks',
  deliveries: 'Deliveries',
  releases: 'Releases',
  'test-cycles': 'Testing Cycles',
  'performance-cycles': 'Performance Cycles',
  issues: 'Issues',
  feedbacks: 'Consumer Feedback',
  'feature-requests': 'Feature Requests',
  users: 'Users',
  integrations: 'Integrations',
  settings: 'Settings',
}

// Local editable state: { role: { page: PagePermission } }
const localPermissions = ref<Record<string, Record<string, PagePermission>>>({})

const defaultPerm = (): PagePermission => ({ visible: true, canCreate: true, canEdit: true, selfViewOnly: false })

// Pages that support self-view-only filtering
const selfViewPages = new Set(['initiatives', 'stories', 'tasks', 'deliveries', 'releases'])

// Track which roles have unsaved changes
const dirtyRoles = computed(() => {
  const dirty = new Set<string>()
  for (const role of configurableRoles) {
    const savedPerms = rolesStore.allPermissions[role.key] || {}
    const localPerms = localPermissions.value[role.key] || {}
    for (const page of rolesStore.CONTROLLABLE_PAGES) {
      const s = savedPerms[page] || defaultPerm()
      const l = localPerms[page] || defaultPerm()
      if (s.visible !== l.visible || s.canCreate !== l.canCreate || s.canEdit !== l.canEdit || s.selfViewOnly !== l.selfViewOnly) {
        dirty.add(role.key)
        break
      }
    }
  }
  return dirty
})

const hasChanges = computed(() => dirtyRoles.value.size > 0)

onMounted(async () => {
  await rolesStore.fetchAllPermissions()
  // Initialize local state from fetched permissions
  for (const role of configurableRoles) {
    const perms: Record<string, PagePermission> = {}
    for (const page of rolesStore.CONTROLLABLE_PAGES) {
      const saved = rolesStore.allPermissions[role.key]?.[page]
      perms[page] = saved ? { ...saved } : defaultPerm()
    }
    localPermissions.value[role.key] = perms
  }
})

function getPerm(role: string, page: string): PagePermission {
  return localPermissions.value[role]?.[page] || defaultPerm()
}

function toggleVisible(role: string, page: string) {
  if (!localPermissions.value[role]) localPermissions.value[role] = {}
  if (!localPermissions.value[role][page]) localPermissions.value[role][page] = defaultPerm()
  const perm = localPermissions.value[role][page]
  perm.visible = !perm.visible
  // If hidden, also disable create and edit
  if (!perm.visible) {
    perm.canCreate = false
    perm.canEdit = false
  }
}

function toggleCreate(role: string, page: string) {
  if (!localPermissions.value[role]) localPermissions.value[role] = {}
  if (!localPermissions.value[role][page]) localPermissions.value[role][page] = defaultPerm()
  const perm = localPermissions.value[role][page]
  if (!perm.visible) return // can't enable create if page is hidden
  perm.canCreate = !perm.canCreate
}

function toggleEdit(role: string, page: string) {
  if (!localPermissions.value[role]) localPermissions.value[role] = {}
  if (!localPermissions.value[role][page]) localPermissions.value[role][page] = defaultPerm()
  const perm = localPermissions.value[role][page]
  if (!perm.visible) return // can't enable edit if page is hidden
  perm.canEdit = !perm.canEdit
}

function toggleSelfViewOnly(role: string, page: string) {
  if (!localPermissions.value[role]) localPermissions.value[role] = {}
  if (!localPermissions.value[role][page]) localPermissions.value[role][page] = defaultPerm()
  const perm = localPermissions.value[role][page]
  if (!perm.visible) return // can't enable self-view if page is hidden
  perm.selfViewOnly = !perm.selfViewOnly
}

async function saveAll() {
  saving.value = true
  saved.value = false
  error.value = null

  try {
    for (const role of dirtyRoles.value) {
      await rolesStore.updateRolePermissions(role, localPermissions.value[role] as Record<string, PagePermission>)
    }
    // Sync local state with server
    for (const role of configurableRoles) {
      const perms: Record<string, PagePermission> = {}
      for (const page of rolesStore.CONTROLLABLE_PAGES) {
        const s = rolesStore.allPermissions[role.key]?.[page]
        perms[page] = s ? { ...s } : defaultPerm()
      }
      localPermissions.value[role.key] = perms
    }
    saved.value = true
    setTimeout(() => (saved.value = false), 3000)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

// Selected role for viewing permissions
const selectedRoleKey = ref<string>(configurableRoles[0]?.key ?? '')

const selectedRoleLabel = computed(() =>
  configurableRoles.find(r => r.key === selectedRoleKey.value)?.label || ''
)
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Shield :size="20" class="text-[#7C5CFC]" />
          Role Permissions
        </h2>
        <p class="text-sm text-gray-500 mt-0.5">
          Control page visibility, create, and edit permissions for each role. Super Admin always has full access.
        </p>
      </div>
      <Button
        class="bg-[#7C5CFC] hover:bg-[#6B4CE0] h-9 px-5 text-sm font-medium"
        :disabled="saving || !hasChanges"
        @click="saveAll"
      >
        <Loader2 v-if="saving" :size="14" class="animate-spin mr-1.5" />
        {{ saving ? 'Saving...' : 'Save Changes' }}
      </Button>
    </div>

    <!-- Success message -->
    <div
      v-if="saved"
      class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5"
    >
      <CheckCircle2 :size="15" class="text-green-500" />
      <p class="text-sm text-green-700 font-medium">Permissions saved successfully</p>
    </div>

    <!-- Error message -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
      <p class="text-sm text-red-600">{{ error }}</p>
    </div>

    <!-- Role selector tabs -->
    <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
      <button
        v-for="role in configurableRoles"
        :key="role.key"
        class="px-3 py-1.5 text-xs font-medium rounded-md transition-all relative"
        :class="selectedRoleKey === role.key
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'"
        @click="selectedRoleKey = role.key"
      >
        {{ role.label }}
        <span
          v-if="dirtyRoles.has(role.key)"
          class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#7C5CFC] rounded-full"
        />
      </button>
    </div>

    <!-- Permissions table for selected role -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50/80">
              <th class="text-left py-3 px-4 font-medium text-gray-600 min-w-[160px]">
                Page
              </th>
              <th class="text-center py-3 px-4 font-medium text-gray-600 w-[100px]">
                <span class="flex items-center justify-center gap-1.5">
                  <Eye :size="13" /> Visible
                </span>
              </th>
              <th class="text-center py-3 px-4 font-medium text-gray-600 w-[100px]">
                <span class="flex items-center justify-center gap-1.5">
                  <Plus :size="13" /> Create
                </span>
              </th>
              <th class="text-center py-3 px-4 font-medium text-gray-600 w-[100px]">
                <span class="flex items-center justify-center gap-1.5">
                  <Pencil :size="13" /> Edit
                </span>
              </th>
              <th class="text-center py-3 px-4 font-medium text-gray-600 w-[120px]">
                <span class="flex items-center justify-center gap-1.5">
                  <User :size="13" /> Self Only
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="page in rolesStore.CONTROLLABLE_PAGES"
              :key="page"
              class="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors"
              :class="{ 'opacity-40': !getPerm(selectedRoleKey, page).visible }"
            >
              <td class="py-2.5 px-4 font-medium text-gray-700">
                {{ pageLabels[page] || page }}
              </td>
              <!-- Visible toggle -->
              <td class="text-center py-2.5 px-4">
                <button
                  @click="toggleVisible(selectedRoleKey, page)"
                  class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer"
                  :class="getPerm(selectedRoleKey, page).visible
                    ? 'bg-[#7C5CFC]'
                    : 'bg-gray-300'"
                >
                  <span
                    class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                    :class="getPerm(selectedRoleKey, page).visible ? 'translate-x-2' : '-translate-x-2'"
                  />
                </button>
              </td>
              <!-- Create toggle -->
              <td class="text-center py-2.5 px-4">
                <button
                  @click="toggleCreate(selectedRoleKey, page)"
                  class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200"
                  :class="[
                    getPerm(selectedRoleKey, page).canCreate ? 'bg-[#7C5CFC]' : 'bg-gray-300',
                    getPerm(selectedRoleKey, page).visible ? 'cursor-pointer' : 'cursor-not-allowed'
                  ]"
                  :disabled="!getPerm(selectedRoleKey, page).visible"
                >
                  <span
                    class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                    :class="getPerm(selectedRoleKey, page).canCreate ? 'translate-x-2' : '-translate-x-2'"
                  />
                </button>
              </td>
              <!-- Edit toggle -->
              <td class="text-center py-2.5 px-4">
                <button
                  @click="toggleEdit(selectedRoleKey, page)"
                  class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200"
                  :class="[
                    getPerm(selectedRoleKey, page).canEdit ? 'bg-[#7C5CFC]' : 'bg-gray-300',
                    getPerm(selectedRoleKey, page).visible ? 'cursor-pointer' : 'cursor-not-allowed'
                  ]"
                  :disabled="!getPerm(selectedRoleKey, page).visible"
                >
                  <span
                    class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                    :class="getPerm(selectedRoleKey, page).canEdit ? 'translate-x-2' : '-translate-x-2'"
                  />
                </button>
              </td>
              <!-- Self View Only toggle (only for applicable pages) -->
              <td class="text-center py-2.5 px-4">
                <template v-if="selfViewPages.has(page)">
                  <button
                    @click="toggleSelfViewOnly(selectedRoleKey, page)"
                    class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200"
                    :class="[
                      getPerm(selectedRoleKey, page).selfViewOnly ? 'bg-[#F59E0B]' : 'bg-gray-300',
                      getPerm(selectedRoleKey, page).visible ? 'cursor-pointer' : 'cursor-not-allowed'
                    ]"
                    :disabled="!getPerm(selectedRoleKey, page).visible"
                  >
                    <span
                      class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                      :class="getPerm(selectedRoleKey, page).selfViewOnly ? 'translate-x-2' : '-translate-x-2'"
                    />
                  </button>
                </template>
                <span v-else class="text-gray-300 text-xs">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
      <span class="flex items-center gap-1.5">
        <Eye :size="12" /> <strong>Visible</strong> — page is accessible
      </span>
      <span class="flex items-center gap-1.5">
        <Plus :size="12" /> <strong>Create</strong> — can create new items
      </span>
      <span class="flex items-center gap-1.5">
        <Pencil :size="12" /> <strong>Edit</strong> — can modify existing items
      </span>
      <span class="flex items-center gap-1.5">
        <User :size="12" /> <strong class="text-[#F59E0B]">Self Only</strong> — user only sees items assigned to them
      </span>
    </div>

    <!-- Info note -->
    <p class="text-xs text-gray-400">
      Changes will take effect the next time users with the affected roles log in or refresh the page.
      When a page is hidden, create and edit are automatically disabled.
      Self View Only applies to Initiatives, Stories, Tasks, Deliveries, and Releases.
    </p>
  </div>
</template>
