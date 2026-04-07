<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Search, Loader2, X, Plus, Users, Camera, ImagePlus } from 'lucide-vue-next'

interface UserResult {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}

interface TeamMember {
  userId: string
  name: string
  email: string
  avatar: string | null
  role: string
}

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [name: string]
}>()

const productStore = useProductStore()
const authStore = useAuthStore()

const name = ref('')
const description = ref('')
const submitting = ref(false)
const error = ref('')

// Logo upload
const logoPreview = ref<string | null>(null)
const logoFile = ref<File | null>(null)
const logoInputRef = ref<HTMLInputElement | null>(null)

function triggerLogoUpload() {
  logoInputRef.value?.click()
}

function handleLogoChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  logoFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => {
    logoPreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

function removeLogo() {
  logoPreview.value = null
  logoFile.value = null
  if (logoInputRef.value) logoInputRef.value.value = ''
}

async function uploadLogo(): Promise<string | null> {
  if (!logoFile.value) return null
  const formData = new FormData()
  formData.append('file', logoFile.value)
  try {
    const res = await fetch('/api/products/upload-logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.token}` },
      body: formData,
    })
    if (res.ok) {
      const data = await res.json()
      return data.logo
    }
  } catch { /* ignore */ }
  return null
}

// Team member search
const memberSearchQuery = ref('')
const memberSearchResults = ref<UserResult[]>([])
const memberSearchLoading = ref(false)
const selectedMemberIndex = ref(-1)
const memberInputRef = ref<HTMLInputElement | null>(null)
const teamMembers = ref<TeamMember[]>([])
let memberSearchTimeout: ReturnType<typeof setTimeout> | null = null

async function searchUsers(query: string) {
  memberSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const results: UserResult[] = await res.json()
      // Filter out already added members and the current user
      memberSearchResults.value = results.filter(
        u => !teamMembers.value.some(m => m.userId === u.id) && u.id !== authStore.user?.id
      )
    }
  } catch {
    memberSearchResults.value = []
  } finally {
    memberSearchLoading.value = false
  }
}

function onMemberInput() {
  selectedMemberIndex.value = -1
  if (memberSearchTimeout) clearTimeout(memberSearchTimeout)
  memberSearchTimeout = setTimeout(() => {
    searchUsers(memberSearchQuery.value)
  }, 200)
}

function addMember(user: UserResult) {
  teamMembers.value.push({
    userId: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: 'member',
  })
  memberSearchQuery.value = ''
  memberSearchResults.value = []
  nextTick(() => memberInputRef.value?.focus())
}

function removeMember(userId: string) {
  teamMembers.value = teamMembers.value.filter(m => m.userId !== userId)
}

function onMemberKeydown(e: KeyboardEvent) {
  const results = memberSearchResults.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedMemberIndex.value = Math.min(selectedMemberIndex.value + 1, results.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedMemberIndex.value = Math.max(selectedMemberIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedMemberIndex.value >= 0 && results[selectedMemberIndex.value]) {
      addMember(results[selectedMemberIndex.value]!)
    }
  } else if (e.key === 'Escape') {
    memberSearchResults.value = []
  }
}

function onMemberFocus() {
  searchUsers(memberSearchQuery.value)
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    name.value = ''
    description.value = ''
    logoPreview.value = null
    logoFile.value = null
    teamMembers.value = []
    memberSearchQuery.value = ''
    memberSearchResults.value = []
    error.value = ''
  }
})

async function handleSubmit() {
  if (!name.value.trim()) return

  error.value = ''
  submitting.value = true

  // Upload logo if selected
  let logoUrl: string | null = null
  if (logoFile.value) {
    logoUrl = await uploadLogo()
  }

  const result = await productStore.createProduct({
    name: name.value.trim(),
    logo: logoUrl,
    description: description.value.trim() || null,
    members: teamMembers.value.map(m => ({ userId: m.userId, role: m.role })),
  })

  submitting.value = false

  if (result && 'error' in result) {
    error.value = result.error as string
  } else if (result) {
    emit('created', (result as any).name)
    open.value = false
  } else {
    error.value = 'Failed to create product. Please try again.'
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[520px] !overflow-visible">
      <DialogHeader>
        <DialogTitle>Create Product</DialogTitle>
        <DialogDescription>Create a new product and add team members.</DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Logo + Product Name row -->
        <div class="flex items-start gap-4">
          <!-- Logo upload -->
          <div class="relative group shrink-0">
            <div
              class="w-16 h-16 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer transition-colors hover:border-[#4857FE] hover:bg-[#4857FE]/5"
              @click="triggerLogoUpload"
            >
              <UploadAssetImg
                v-if="logoPreview"
                :src="logoPreview"
                class="w-full h-full object-cover rounded-xl"
                alt="Product logo"
              />
              <ImagePlus v-else :size="22" class="text-gray-400" />
            </div>
            <button
              v-if="logoPreview"
              type="button"
              class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm hover:bg-red-600 transition-colors"
              @click.stop="removeLogo"
            >
              <X :size="10" />
            </button>
            <input
              ref="logoInputRef"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              class="hidden"
              @change="handleLogoChange"
            />
          </div>

          <!-- Product Name -->
          <div class="space-y-1.5 flex-1">
            <label class="text-sm font-medium text-gray-700">Product Name *</label>
            <Input
              v-model="name"
              placeholder="e.g. My New Product"
              autofocus
            />
            <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
            <p v-else class="text-xs text-gray-400">Click the icon to upload a logo</p>
          </div>
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <Textarea
            v-model="description"
            placeholder="Briefly describe the product..."
            :rows="3"
          />
        </div>

        <!-- Team Members -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Users :size="14" />
            Team Members
          </label>

          <!-- Added members list -->
          <div v-if="teamMembers.length > 0" class="flex flex-wrap gap-2 mb-2">
            <div
              v-for="member in teamMembers"
              :key="member.userId"
              class="flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-0.5"
            >
              <div class="w-5 h-5 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-medium overflow-hidden shrink-0">
                <UploadAssetImg
                  v-if="member.avatar"
                  :src="member.avatar"
                  class="w-5 h-5 rounded-full object-cover"
                  :alt="member.name"
                />
                <span v-else>{{ getInitials(member.name) }}</span>
              </div>
              <span class="text-xs font-medium text-gray-700 max-w-[120px] truncate">{{ member.name }}</span>
              <button type="button" class="text-gray-400 hover:text-gray-600" @click="removeMember(member.userId)">
                <X :size="12" />
              </button>
            </div>
          </div>

          <!-- Member search input -->
          <div class="relative">
            <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
              <Search :size="14" class="text-gray-400 shrink-0" />
              <input
                ref="memberInputRef"
                v-model="memberSearchQuery"
                class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                placeholder="Search users to add..."
                @input="onMemberInput"
                @keydown="onMemberKeydown"
                @focus="onMemberFocus"
              />
              <Loader2 v-if="memberSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
            </div>

            <!-- Autocomplete dropdown -->
            <div
              v-if="memberSearchResults.length > 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[100]"
              @mousedown.prevent
            >
              <button
                v-for="(user, idx) in memberSearchResults"
                :key="user.id"
                type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                :class="idx === selectedMemberIndex ? 'bg-[#4857FE]/10' : 'hover:bg-gray-50'"
                @click="addMember(user)"
              >
                <div class="w-7 h-7 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0">
                  <UploadAssetImg
                    v-if="user.avatar"
                    :src="user.avatar"
                    class="w-7 h-7 rounded-full object-cover"
                    :alt="user.name"
                  />
                  <span v-else>{{ getInitials(user.name) }}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</span>
                  <span class="text-[10px] text-gray-400 truncate">{{ user.email }}</span>
                </div>
                <Plus :size="14" class="text-gray-400 ml-auto shrink-0" />
              </button>
            </div>

            <!-- No results -->
            <div
              v-else-if="memberSearchQuery && !memberSearchLoading && memberSearchResults.length === 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[100]"
            >
              <p class="text-xs text-gray-400 text-center">No users found</p>
            </div>
          </div>

          <p class="text-xs text-gray-400">You will be added as an admin automatically.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button
            type="submit"
            :disabled="!name.trim() || submitting"
            class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          >
            {{ submitting ? 'Creating...' : 'Create Product' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
