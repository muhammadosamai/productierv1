<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loader2, Search, ShieldCheck, UserCog, Users, X } from 'lucide-vue-next'
import { useUsersStore } from '@/stores/users'
import { useProductStore } from '@/stores/products'
import { useRolesStore } from '@/stores/roles'
import { useAuthStore } from '@/stores/auth'
import { usePagePermissions } from '@/lib/pagePermissions'
import InviteMembersPanel from '@/components/users/InviteMembersPanel.vue'
import type { UserRole } from '@/types/user'

const usersStore = useUsersStore()
const productStore = useProductStore()
const rolesStore = useRolesStore()
const authStore = useAuthStore()
const usersPermissions = usePagePermissions('users')

const searchQuery = ref('')
const roleFilter = ref('')
const activeFilter = ref<'all' | 'active' | 'inactive'>('all')
const selectedRole = ref<UserRole>('viewer')
const selectedActive = ref(true)
const selectedTitleId = ref('')

const membershipProductId = ref('')
const membershipRole = ref('member')

let searchTimer: ReturnType<typeof setTimeout> | null = null

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'product_admin', label: 'Product Admin' },
  { value: 'product_manager', label: 'Product Manager' },
  { value: 'business_analyst', label: 'Business Analyst' },
  { value: 'developer', label: 'Developer' },
  { value: 'viewer', label: 'Viewer' },
]

const selectedUser = computed(() => usersStore.selectedUser)
const canAccessUsers = computed(() => usersPermissions.canAccess.value)
const canEditUsers = computed(() => usersPermissions.canEdit.value)
const canManageUserTitles = computed(() => authStore.user?.role === 'super_admin' || authStore.user?.role === 'admin')
const availableTitles = computed(() => rolesStore.titles.filter((title) => title.isActive))

const productNameById = computed(() => {
  const map = new Map<string, string>()
  for (const product of productStore.products) {
    if (product.id) map.set(product.id, product.name)
  }
  return map
})

const availableProducts = computed(() =>
  productStore.products.filter((product) => product.id && !usersStore.memberships.some((m) => m.productId === product.id)),
)

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function roleBadgeStyle(role: string): string {
  if (role === 'super_admin' || role === 'admin') return 'bg-red-100 text-red-700 border-red-200'
  if (role === 'product_admin' || role === 'product_manager') return 'bg-purple-100 text-purple-700 border-purple-200'
  if (role === 'business_analyst') return 'bg-blue-100 text-blue-700 border-blue-200'
  if (role === 'developer') return 'bg-green-100 text-green-700 border-green-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function activeBadgeStyle(isActive: boolean): string {
  return isActive
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-gray-100 text-gray-500 border-gray-200'
}

async function loadUsers() {
  await usersStore.fetchUsers({
    q: searchQuery.value,
    role: roleFilter.value || undefined,
    active: activeFilter.value === 'all' ? '' : activeFilter.value === 'active' ? 'true' : 'false',
  })
}

async function selectUser(userId: string): Promise<boolean> {
  const selected = await usersStore.fetchUser(userId)
  if (!selected) return false
  selectedRole.value = selected.role
  selectedActive.value = selected.isActive
  selectedTitleId.value = selected.titleId || selected.title?.id || ''
  return true
}

async function saveRole() {
  if (!canEditUsers.value || !selectedUser.value) return
  await usersStore.updateUserRole(selectedUser.value.id, selectedRole.value)
}

async function saveStatus() {
  if (!canEditUsers.value || !selectedUser.value) return
  await usersStore.updateUserStatus(selectedUser.value.id, selectedActive.value)
}

async function saveTitle() {
  if (!canEditUsers.value || !canManageUserTitles.value || !selectedUser.value) return
  await usersStore.updateUserTitle(selectedUser.value.id, selectedTitleId.value || null)
}

async function addMembership() {
  if (!canEditUsers.value) return
  if (!selectedUser.value || !membershipProductId.value) return
  const success = await usersStore.addMembership(selectedUser.value.id, membershipProductId.value, membershipRole.value)
  if (!success) return
  membershipProductId.value = ''
  membershipRole.value = 'member'
}

async function removeMembership(productId: string) {
  if (!canEditUsers.value || !selectedUser.value) return
  await usersStore.removeMembership(selectedUser.value.id, productId)
}

watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadUsers()
  }, 250)
})

watch([roleFilter, activeFilter], () => {
  loadUsers()
})

onMounted(async () => {
  if (!canAccessUsers.value) return
  if (canManageUserTitles.value) {
    await rolesStore.fetchTitles()
  }
  await productStore.fetchProducts()
  await loadUsers()
  if (usersStore.users.length > 0 && usersStore.users[0]?.id) {
    await selectUser(usersStore.users[0].id)
  }
})

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
})
</script>

<template>
  <section v-if="canAccessUsers" class="space-y-5">
    <div>
      <h2 class="text-lg font-semibold text-gray-900">Members</h2>
      <p class="text-sm text-gray-500 mt-1">
        Manage organization users, roles, titles, and product memberships.
      </p>
    </div>

    <InviteMembersPanel
      v-if="canEditUsers"
      :can-invite="canEditUsers"
      heading="Invite Organization Members"
      description="Create manual invite links for POC onboarding and optionally pre-assign workspace, team, and title."
    />

    <div class="flex flex-wrap items-center gap-3">
      <div class="relative w-full sm:max-w-sm">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          name="memberSearch"
          autocomplete="off"
          placeholder="Search members…"
          class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
        >
      </div>

      <select
        v-model="roleFilter"
        name="memberRoleFilter"
        class="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
      >
        <option value="">All Roles</option>
        <option v-for="role in roleOptions" :key="role.value" :value="role.value">
          {{ role.label }}
        </option>
      </select>

      <select
        v-model="activeFilter"
        name="memberStatusFilter"
        class="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
      >
        <option value="all">All Statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(360px,1fr)_minmax(320px,440px)] gap-5">
      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-[520px]">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">Users</h3>
          <Loader2 v-if="usersStore.loading" :size="14" class="animate-spin text-[#4857FE]" />
        </div>

        <div
          v-if="usersStore.loading && usersStore.users.length === 0"
          class="flex-1 flex items-center justify-center text-sm text-gray-500"
        >
          Loading users…
        </div>

        <div
          v-else-if="usersStore.users.length === 0"
          class="flex-1 flex items-center justify-center text-sm text-gray-500"
        >
          No users found.
        </div>

        <div v-else class="flex-1 overflow-auto divide-y divide-gray-100">
          <button
            v-for="user in usersStore.users"
            :key="user.id"
            class="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-inset"
            :class="selectedUser?.id === user.id ? 'bg-[#4857FE]/5' : ''"
            @click="selectUser(user.id)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</p>
                <p class="text-xs text-gray-400 truncate mt-0.5">{{ user.email }}</p>
                <div class="flex flex-wrap items-center gap-2 mt-2">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium"
                    :class="roleBadgeStyle(user.role)"
                  >
                    {{ roleLabel(user.role) }}
                  </span>
                  <span
                    v-if="user.title?.name"
                    class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium bg-amber-100 text-amber-700 border-amber-200"
                  >
                    {{ user.title.name }}
                  </span>
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium"
                    :class="activeBadgeStyle(user.isActive)"
                  >
                    {{ user.isActive ? 'Active' : 'Inactive' }}
                  </span>
                </div>
              </div>
              <div class="text-xs text-gray-400 shrink-0">
                {{ user.membershipsCount ?? 0 }} memberships
              </div>
            </div>
          </button>
        </div>
      </div>

      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-[520px]">
        <div class="px-5 py-3 border-b border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700">Member Details</h3>
        </div>

        <div v-if="!selectedUser" class="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div class="w-14 h-14 rounded-xl bg-[#4857FE]/10 flex items-center justify-center mb-3">
            <UserCog :size="24" class="text-[#4857FE]" />
          </div>
          <p class="text-sm text-gray-600 font-medium">Select a user</p>
          <p class="text-xs text-gray-400 mt-1">View and manage role, status, and memberships.</p>
        </div>

        <div v-else class="flex-1 overflow-auto p-5 space-y-5">
          <div>
            <p class="text-base font-semibold text-gray-900">{{ selectedUser.name }}</p>
            <p class="text-sm text-gray-400">{{ selectedUser.email }}</p>
          </div>

          <div class="space-y-2">
            <label class="text-xs uppercase tracking-wide text-gray-400 font-medium">Role</label>
            <div class="flex items-center gap-2">
              <select
                v-model="selectedRole"
                name="selectedUserRole"
                :disabled="!canEditUsers || usersStore.saving"
                :title="usersPermissions.deniedReason('edit', 'users') || 'Edit user role'"
                class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
              >
                <option v-for="role in roleOptions" :key="role.value" :value="role.value">
                  {{ role.label }}
                </option>
              </select>
              <button
                class="px-3 py-2 text-xs font-medium rounded-lg bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2"
                :disabled="!canEditUsers || usersStore.saving || selectedRole === selectedUser.role"
                :title="usersPermissions.deniedReason('edit', 'users') || 'Save role'"
                @click="saveRole"
              >
                Save
              </button>
            </div>
          </div>

          <div v-if="canManageUserTitles" class="space-y-2">
            <label class="text-xs uppercase tracking-wide text-gray-400 font-medium">Title</label>
            <div class="flex items-center gap-2">
              <select
                v-model="selectedTitleId"
                name="selectedUserTitle"
                :disabled="!canEditUsers || usersStore.saving"
                :title="usersPermissions.deniedReason('edit', 'users') || 'Edit user title'"
                class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
              >
                <option value="">No title (role-only fallback)</option>
                <option v-for="title in availableTitles" :key="title.id" :value="title.id">
                  {{ title.name }}
                </option>
              </select>
              <button
                class="px-3 py-2 text-xs font-medium rounded-lg bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2"
                :disabled="!canEditUsers || usersStore.saving || (selectedTitleId || null) === (selectedUser.titleId || selectedUser.title?.id || null)"
                :title="usersPermissions.deniedReason('edit', 'users') || 'Save title'"
                @click="saveTitle"
              >
                Save
              </button>
            </div>
            <p class="text-[11px] text-gray-400">
              Title permissions are merged with role permissions and capped by role hard limits.
            </p>
          </div>

          <div class="space-y-2">
            <label class="text-xs uppercase tracking-wide text-gray-400 font-medium">Status</label>
            <div class="flex items-center gap-2">
              <select
                v-model="selectedActive"
                name="selectedUserStatus"
                :disabled="!canEditUsers || usersStore.saving"
                :title="usersPermissions.deniedReason('edit', 'users') || 'Edit user status'"
                class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
              >
                <option :value="true">Active</option>
                <option :value="false">Inactive</option>
              </select>
              <button
                class="px-3 py-2 text-xs font-medium rounded-lg bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2"
                :disabled="!canEditUsers || usersStore.saving || selectedActive === selectedUser.isActive"
                :title="usersPermissions.deniedReason('edit', 'users') || 'Save status'"
                @click="saveStatus"
              >
                Save
              </button>
            </div>
          </div>

          <div class="pt-1">
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs uppercase tracking-wide text-gray-400 font-medium">Memberships</label>
              <Loader2 v-if="usersStore.membershipsLoading" :size="13" class="animate-spin text-[#4857FE]" />
            </div>

            <div v-if="usersStore.memberships.length === 0" class="text-xs text-gray-400 py-2">
              No product memberships.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="membership in usersStore.memberships"
                :key="membership.id"
                class="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="text-sm text-gray-700 truncate">
                    {{ productNameById.get(membership.productId) || membership.productId }}
                  </p>
                  <p class="text-[11px] text-gray-400">{{ roleLabel(membership.role) }}</p>
                </div>
                <button
                  class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                  :disabled="usersStore.saving || !canEditUsers"
                  :title="usersPermissions.deniedReason('edit', 'memberships') || 'Remove membership'"
                  aria-label="Remove membership"
                  @click="removeMembership(membership.productId)"
                >
                  <X :size="13" />
                </button>
              </div>
            </div>

            <div class="mt-3 border border-dashed border-gray-200 rounded-lg p-3 space-y-2">
              <p class="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <ShieldCheck :size="12" />
                Add Membership
              </p>
              <div class="flex items-center gap-2">
                <select
                  v-model="membershipProductId"
                  name="membershipProduct"
                  :disabled="!canEditUsers || usersStore.saving"
                  :title="usersPermissions.deniedReason('edit', 'memberships') || 'Select product'"
                  class="flex-1 px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
                >
                  <option value="">Select product…</option>
                  <option v-for="product in availableProducts" :key="product.id" :value="product.id">
                    {{ product.name }}
                  </option>
                </select>
                <select
                  v-model="membershipRole"
                  name="membershipRole"
                  :disabled="!canEditUsers || usersStore.saving"
                  :title="usersPermissions.deniedReason('edit', 'memberships') || 'Select membership role'"
                  class="px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <button
                class="w-full px-3 py-2 text-xs font-medium rounded-lg bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2"
                :disabled="usersStore.saving || !membershipProductId || !canEditUsers"
                :title="usersPermissions.deniedReason('edit', 'memberships') || 'Add membership'"
                @click="addMembership"
              >
                Add Membership
              </button>
            </div>
          </div>

          <p
            v-if="usersStore.error"
            aria-live="polite"
            class="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2"
          >
            {{ usersStore.error }}
          </p>
        </div>
      </div>
    </div>
  </section>

  <section
    v-else
    class="bg-white rounded-xl border border-gray-200 p-6"
  >
    <div class="flex items-start gap-3">
      <Users :size="18" class="text-gray-400 mt-0.5" />
      <div>
        <h2 class="text-base font-semibold text-gray-900">Members</h2>
        <p class="text-sm text-gray-500 mt-1">
          You do not have permission to view organization members.
        </p>
      </div>
    </div>
  </section>
</template>
