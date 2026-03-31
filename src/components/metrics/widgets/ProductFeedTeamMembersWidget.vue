<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Loader2, Search, UserPlus, Users, X } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { useProductMembersStore } from '@/stores/productMembers'
import { useAuthStore } from '@/stores/auth'
import { usePagePermissions } from '@/lib/pagePermissions'
import { usersApi } from '@/lib/api'

const productStore = useProductStore()
const membersStore = useProductMembersStore()
const authStore = useAuthStore()
const teamPermissions = usePagePermissions('team')
const canCreateTeamMembers = computed(() => teamPermissions.canCreate.value)
const canDeleteTeamMembers = computed(() => teamPermissions.canDelete.value)

const showAddMember = ref(false)
const memberSearch = ref('')
const memberSearchResults = ref<Array<{ id: string; name: string; email: string; avatar: string | null }>>([])
const memberSearchLoading = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

function activeProductId(): string {
  return productStore.activeProduct.id || ''
}

async function loadMembers() {
  const productId = activeProductId()
  if (!productId) return
  await membersStore.fetchMembers(productId)
}

onMounted(() => {
  loadMembers()
})

watch(() => productStore.activeProduct.id, () => {
  showAddMember.value = false
  memberSearch.value = ''
  memberSearchResults.value = []
  loadMembers()
})

async function searchUsers(query: string) {
  memberSearchLoading.value = true
  try {
    const payload = await usersApi.list({ q: query }, authStore.token)
    const all = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.items) ? payload.items : [])
    const existingIds = new Set(membersStore.members.map((member) => member.userId))
    memberSearchResults.value = all.filter((entry: any) => !existingIds.has(entry.id))
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
  if (!canCreateTeamMembers.value) return
  const productId = activeProductId()
  if (!productId) return
  const created = await membersStore.addMember(productId, user.id)
  if (!created) return
  memberSearch.value = ''
  memberSearchResults.value = []
  showAddMember.value = false
}

async function removeMember(userId: string) {
  if (!canDeleteTeamMembers.value) return
  const productId = activeProductId()
  if (!productId) return
  await membersStore.removeMember(productId, userId)
}

function openAddMember() {
  if (!canCreateTeamMembers.value) return
  showAddMember.value = true
  memberSearch.value = ''
  memberSearchResults.value = []
  searchUsers('')
}

function userInitials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-white">
    <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
      <div class="flex items-center gap-2">
        <Users :size="17" class="text-gray-400" />
        <h2 class="text-sm font-semibold text-gray-900">Team Members</h2>
        <span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">{{ membersStore.members.length }}</span>
      </div>
      <button
        type="button"
        class="flex items-center gap-1 text-xs font-medium transition-colors"
        :class="canCreateTeamMembers ? 'text-[#4857FE] hover:text-[#3E4BDE]' : 'cursor-not-allowed text-gray-400'"
        :disabled="!canCreateTeamMembers"
        :title="teamPermissions.deniedReason('create', 'team members') || 'Add team member'"
        @click="openAddMember"
      >
        <UserPlus :size="14" />
        Add
      </button>
    </div>

    <div v-if="showAddMember" class="border-b border-gray-100 px-4 py-3">
      <div class="relative">
        <div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
          <Search :size="14" class="shrink-0 text-gray-400" />
          <input
            v-model="memberSearch"
            class="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-400"
            placeholder="Search users..."
            autofocus
            @input="onMemberSearchInput"
          >
          <button type="button" class="shrink-0 text-gray-400 hover:text-gray-600" @click="showAddMember = false">
            <X :size="14" />
          </button>
        </div>

        <div
          v-if="memberSearchResults.length > 0"
          class="absolute left-0 right-0 top-full z-50 mt-1 max-h-[200px] overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <button
            v-for="user in memberSearchResults"
            :key="user.id"
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50"
            @click="addMember(user)"
          >
            <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#7C5CFC] text-[10px] font-medium text-white">
              <img v-if="user.avatar" :src="user.avatar" class="h-7 w-7 rounded-full object-cover" :alt="user.name">
              <span v-else>{{ userInitials(user.name) }}</span>
            </div>
            <div class="min-w-0 flex flex-col">
              <span class="truncate text-sm font-medium text-gray-900">{{ user.name }}</span>
              <span class="truncate text-[10px] text-gray-400">{{ user.email }}</span>
            </div>
          </button>
        </div>

        <div
          v-else-if="memberSearch && !memberSearchLoading && memberSearchResults.length === 0"
          class="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        >
          <p class="text-center text-xs text-gray-400">No users found</p>
        </div>
      </div>
    </div>

    <div v-if="membersStore.loading" class="flex flex-1 items-center justify-center py-8">
      <Loader2 :size="16" class="animate-spin text-gray-400" />
    </div>

    <div v-else-if="membersStore.members.length === 0" class="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
      <Users :size="24" class="mx-auto mb-2 text-gray-200" />
      <p class="text-xs text-gray-400">No team members yet</p>
    </div>

    <div v-else class="min-h-0 flex-1 divide-y divide-gray-50 overflow-auto">
      <div
        v-for="member in membersStore.members"
        :key="member.id"
        class="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50/50"
      >
        <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#7C5CFC] text-[10px] font-medium text-white">
          <img
            v-if="member.userAvatar"
            :src="member.userAvatar"
            class="h-8 w-8 rounded-full object-cover"
            :alt="member.userName"
          >
          <span v-else>{{ userInitials(member.userName) }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-gray-900">{{ member.userName }}</p>
          <p class="truncate text-[11px] text-gray-400">{{ member.userEmail }}</p>
        </div>
        <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] capitalize text-gray-400">{{ member.role }}</span>
        <button
          type="button"
          class="shrink-0 text-gray-300 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          :disabled="!canDeleteTeamMembers"
          :title="teamPermissions.deniedReason('delete', 'team members') || 'Remove team member'"
          @click="removeMember(member.userId)"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>
