<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Camera, CheckCircle2, Loader2, Shield } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { usePagePermissions } from '@/lib/pagePermissions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/apiClient'

const authStore = useAuthStore()
const settingsPermissions = usePagePermissions('settings')
const canEditSettings = computed(() => settingsPermissions.canEdit.value)

const name = ref('')
const email = ref('')
const avatarPreview = ref<string | null>(null)
const pendingFile = ref<File | null>(null)
const saved = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const nameInputId = 'settings-profile-name'
const emailInputId = 'settings-profile-email'
const avatarInputId = 'settings-profile-avatar'

const isLoading = computed(() => authStore.loading || uploading.value)

function syncFromUser() {
  if (!authStore.user) return
  name.value = authStore.user.name
  email.value = authStore.user.email
  avatarPreview.value = authStore.user.avatar || null
}

onMounted(() => {
  syncFromUser()
})

watch(
  () => authStore.user,
  () => {
    syncFromUser()
  },
  { deep: true },
)

function userInitials() {
  if (!name.value) return '?'
  return name.value
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function triggerFileUpload() {
  if (!canEditSettings.value) return
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  if (!canEditSettings.value) return
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  pendingFile.value = file
  const reader = new FileReader()
  reader.onload = (readerEvent) => {
    avatarPreview.value = readerEvent.target?.result as string
  }
  reader.readAsDataURL(file)
}

async function uploadAvatar(): Promise<string | null> {
  if (!pendingFile.value) return null

  const formData = new FormData()
  formData.append('file', pendingFile.value)

  const res = await apiFetch('/auth/upload-avatar', {
    method: 'POST',
    token: authStore.token,
    body: formData,
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Avatar upload failed')
  }

  const data = await res.json()
  return data.avatar
}

function resetForm() {
  saved.value = false
  authStore.error = null
  pendingFile.value = null
  syncFromUser()
}

async function handleSubmit() {
  if (!canEditSettings.value) return
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
    setTimeout(() => {
      saved.value = false
    }, 3000)
  } catch (error) {
    authStore.error = (error as Error).message
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <section class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
    <div class="mb-6">
      <h2 class="text-lg font-semibold text-gray-900">Profile</h2>
      <p class="text-sm text-gray-500 mt-1">
        Update your personal information and profile photo.
      </p>
    </div>

    <form class="space-y-6" @submit.prevent="handleSubmit">
      <div
        v-if="saved"
        aria-live="polite"
        class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
      >
        <CheckCircle2 :size="16" class="text-green-500" />
        <p class="text-sm text-green-700 font-medium">Profile updated successfully.</p>
      </div>

      <div
        v-if="authStore.error"
        aria-live="polite"
        class="bg-red-50 border border-red-200 rounded-lg px-4 py-3"
      >
        <p class="text-sm text-red-600">{{ authStore.error }}</p>
      </div>

      <div class="flex items-center gap-5">
        <div class="relative group">
          <div
            class="w-20 h-20 rounded-full bg-[#4857FE] flex items-center justify-center text-white text-xl font-semibold overflow-hidden"
          >
            <img
              v-if="avatarPreview"
              :src="avatarPreview"
              alt="Profile avatar"
              class="w-20 h-20 rounded-full object-cover"
            />
            <span v-else>{{ userInitials() }}</span>
          </div>

          <button
            type="button"
            :disabled="!canEditSettings"
            :title="settingsPermissions.deniedReason('edit', 'profile settings') || 'Upload profile photo'"
            aria-label="Upload profile photo"
            class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2"
            @click="triggerFileUpload"
          >
            <Camera :size="20" class="text-white" />
          </button>

          <input
            :id="avatarInputId"
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            class="hidden"
            :disabled="!canEditSettings"
            @change="handleFileChange"
          >
        </div>

        <div>
          <p class="text-sm font-medium text-gray-900">Profile Photo</p>
          <button
            type="button"
            :disabled="!canEditSettings"
            :title="settingsPermissions.deniedReason('edit', 'profile settings') || 'Upload profile photo'"
            class="text-sm text-[#4857FE] hover:text-[#3E4BDE] font-medium mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2 rounded"
            @click="triggerFileUpload"
          >
            Upload New Photo
          </button>
          <p class="text-xs text-gray-400 mt-0.5">JPG, PNG, GIF, or WebP. Max 5 MB.</p>
        </div>
      </div>

      <div class="space-y-1.5">
        <label
          :for="nameInputId"
          class="text-sm font-medium text-gray-700"
        >
          Full Name
        </label>
        <Input
          :id="nameInputId"
          v-model="name"
          name="fullName"
          type="text"
          autocomplete="name"
          placeholder="Enter your full name…"
          required
          :disabled="!canEditSettings || isLoading"
        />
      </div>

      <div class="space-y-1.5">
        <label
          :for="emailInputId"
          class="text-sm font-medium text-gray-700"
        >
          Email
        </label>
        <Input
          :id="emailInputId"
          v-model="email"
          name="email"
          type="email"
          autocomplete="email"
          spellcheck="false"
          placeholder="Enter your work email…"
          required
          :disabled="!canEditSettings || isLoading"
        />
      </div>

      <div class="space-y-1.5">
        <p class="text-sm font-medium text-gray-700">Role</p>
        <div class="flex items-center gap-2 h-10 px-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-600">
          <Shield :size="14" class="text-gray-400" />
          <span>
            {{ authStore.user?.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'N/A' }}
          </span>
        </div>
        <p class="text-xs text-gray-400">Only an administrator can change your role.</p>
      </div>

      <div class="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          class="bg-[#4857FE] hover:bg-[#3E4BDE] h-10 px-6 text-sm font-medium"
          :disabled="isLoading || !canEditSettings"
          :title="settingsPermissions.deniedReason('edit', 'profile settings') || 'Save profile changes'"
        >
          <Loader2 v-if="isLoading" :size="16" class="animate-spin mr-2" />
          {{ isLoading ? 'Saving…' : 'Save Changes' }}
        </Button>

        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2 rounded"
          :disabled="isLoading"
          @click="resetForm"
        >
          Reset
        </button>
      </div>
    </form>
  </section>
</template>
