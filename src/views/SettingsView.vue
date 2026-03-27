<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Camera, CheckCircle2, ArrowLeft, User, Shield } from 'lucide-vue-next'
import { useRouter, useRoute } from 'vue-router'
import RolesSettings from '@/components/settings/RolesSettings.vue'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

// Tabs — default to query param if provided
const activeTab = ref<'profile' | 'roles'>(
  route.query.tab === 'roles' && authStore.user?.role === 'super_admin' ? 'roles' : 'profile'
)
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin')

// Profile form state
const name = ref('')
const email = ref('')
const avatarPreview = ref<string | null>(null)
const pendingFile = ref<File | null>(null)
const saved = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  if (authStore.user) {
    name.value = authStore.user.name
    email.value = authStore.user.email
    avatarPreview.value = authStore.user.avatar || null
  }
})

function triggerFileUpload() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  pendingFile.value = file

  const reader = new FileReader()
  reader.onload = (e) => {
    avatarPreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

async function uploadAvatar(): Promise<string | null> {
  if (!pendingFile.value) return null

  const formData = new FormData()
  formData.append('file', pendingFile.value)

  const res = await fetch('/api/auth/upload-avatar', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authStore.token}`,
    },
    body: formData,
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Avatar upload failed')
  }

  const data = await res.json()
  return data.avatar
}

async function handleSubmit() {
  saved.value = false
  authStore.error = null
  uploading.value = true

  try {
    let avatarUrl: string | null = null
    if (pendingFile.value) {
      avatarUrl = await uploadAvatar()
      pendingFile.value = null
    }

    const data: { name?: string; email?: string } = {}
    if (name.value !== authStore.user?.name) data.name = name.value
    if (email.value !== authStore.user?.email) data.email = email.value

    if (Object.keys(data).length > 0) {
      const success = await authStore.updateProfile(data)
      if (!success) return
    } else if (avatarUrl) {
      await authStore.fetchMe()
    }

    saved.value = true
    setTimeout(() => (saved.value = false), 3000)
  } catch (e) {
    authStore.error = (e as Error).message
  } finally {
    uploading.value = false
  }
}

const isLoading = () => authStore.loading || uploading.value

const userInitials = () => {
  if (!name.value) return '?'
  return name.value
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
</script>

<template>
  <div class="max-w-5xl mx-auto py-10 px-6">
    <!-- Back button + title -->
    <div class="mb-8">
      <button
        class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium mb-4"
        @click="router.back()"
      >
        <ArrowLeft :size="14" />
        Back
      </button>
      <h1 class="text-2xl font-bold text-gray-900">Settings</h1>
      <p class="text-sm text-gray-500 mt-1">Manage your account and application settings</p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 border-b border-gray-200">
      <button
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === 'profile'
          ? 'text-[#7C5CFC]'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'profile'"
      >
        <User :size="16" />
        Profile
        <span
          v-if="activeTab === 'profile'"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C5CFC] rounded-t"
        />
      </button>
      <button
        v-if="isSuperAdmin"
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === 'roles'
          ? 'text-[#7C5CFC]'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'roles'"
      >
        <Shield :size="16" />
        Roles
        <span
          v-if="activeTab === 'roles'"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C5CFC] rounded-t"
        />
      </button>
    </div>

    <!-- Profile Tab -->
    <div v-if="activeTab === 'profile'" class="max-w-2xl">
      <div class="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- Success message -->
          <div
            v-if="saved"
            class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
          >
            <CheckCircle2 :size="16" class="text-green-500" />
            <p class="text-sm text-green-700 font-medium">Profile updated successfully</p>
          </div>

          <!-- Error message -->
          <div v-if="authStore.error" class="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p class="text-sm text-red-600">{{ authStore.error }}</p>
          </div>

          <!-- Avatar upload -->
          <div class="flex items-center gap-5">
            <div class="relative group">
              <div
                class="w-20 h-20 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-xl font-semibold overflow-hidden"
              >
                <img
                  v-if="avatarPreview"
                  :src="avatarPreview"
                  class="w-20 h-20 rounded-full object-cover"
                  alt="Avatar"
                />
                <span v-else>{{ userInitials() }}</span>
              </div>
              <button
                type="button"
                class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                @click="triggerFileUpload"
              >
                <Camera :size="20" class="text-white" />
              </button>
              <input
                ref="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                class="hidden"
                @change="handleFileChange"
              />
            </div>
            <div>
              <p class="text-sm font-medium text-gray-900">Profile photo</p>
              <button
                type="button"
                class="text-sm text-[#7C5CFC] hover:text-[#6B4CE0] font-medium mt-0.5"
                @click="triggerFileUpload"
              >
                Upload new photo
              </button>
              <p class="text-xs text-gray-400 mt-0.5">JPG, PNG, GIF or WebP. Max 5MB.</p>
            </div>
          </div>

          <!-- Name -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Full Name</label>
            <Input
              v-model="name"
              type="text"
              placeholder="Your full name"
              required
            />
          </div>

          <!-- Email -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Email</label>
            <Input
              v-model="email"
              type="email"
              placeholder="Your email address"
              required
            />
          </div>

          <!-- Role (read-only) -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Role</label>
            <div class="flex items-center h-10 px-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500">
              {{ authStore.user?.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'N/A' }}
            </div>
            <p class="text-xs text-gray-400">Role can only be changed by an administrator</p>
          </div>

          <!-- Submit -->
          <div class="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              class="bg-[#7C5CFC] hover:bg-[#6B4CE0] h-10 px-6 text-sm font-medium"
              :disabled="isLoading()"
            >
              <Loader2 v-if="isLoading()" :size="16" class="animate-spin mr-2" />
              {{ isLoading() ? 'Saving...' : 'Save Changes' }}
            </Button>
            <button
              type="button"
              class="text-sm text-gray-500 hover:text-gray-700 font-medium"
              @click="router.back()"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Roles Tab -->
    <div v-if="activeTab === 'roles' && isSuperAdmin">
      <RolesSettings />
    </div>
  </div>
</template>
