<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Camera, CheckCircle2, ArrowLeft, User, Shield, Box, AlertTriangle, ImagePlus, X, Mail } from 'lucide-vue-next'
import { useRouter, useRoute } from 'vue-router'
import RolesSettings from '@/components/settings/RolesSettings.vue'
import DeleteProductDialog from '@/components/product/DeleteProductDialog.vue'
import { useProductStore } from '@/stores/products'
import type { User } from '@/types/user'

const authStore = useAuthStore()
const productStore = useProductStore()
const router = useRouter()
const route = useRoute()

// Tabs — default to query param if provided
type TabType = 'profile' | 'roles' | 'product' | 'email'
const initialTab = (): TabType => {
  const tab = route.query.tab as string
  if (tab === 'roles' && ['super_admin', 'admin', 'product_admin'].includes(authStore.user?.role || '')) return 'roles'
  if (tab === 'product') return 'product'
  if (tab === 'email') return 'email'
  return 'profile'
}
const activeTab = ref<TabType>(initialTab())

// Email preferences
const emailPrefs = ref({
  assignedToMe: true,
  statusChanges: true,
  newComments: true,
  deadlineReminders: true,
})
const emailPrefsSaving = ref(false)
const emailPrefsSaved = ref(false)
const emailPrefsLoaded = ref(false)

async function loadEmailPreferences() {
  try {
    const res = await fetch('/api/auth/email-preferences', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const data = await res.json()
      emailPrefs.value = {
        assignedToMe: data.assignedToMe ?? true,
        statusChanges: data.statusChanges ?? true,
        newComments: data.newComments ?? true,
        deadlineReminders: data.deadlineReminders ?? true,
      }
      emailPrefsLoaded.value = true
    }
  } catch {}
}

async function saveEmailPreferences() {
  emailPrefsSaving.value = true
  emailPrefsSaved.value = false
  try {
    const res = await fetch('/api/auth/email-preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify(emailPrefs.value),
    })
    if (res.ok) {
      emailPrefsSaved.value = true
      setTimeout(() => emailPrefsSaved.value = false, 3000)
    }
  } catch {}
  emailPrefsSaving.value = false
}

watch(activeTab, (tab) => {
  if (tab === 'email' && !emailPrefsLoaded.value) loadEmailPreferences()
})
const canViewRoles = computed(() => ['super_admin', 'admin', 'product_admin'].includes(authStore.user?.role || ''))

// Product settings
const showDeleteProductDialog = ref(false)
const canDeleteProduct = computed(() => {
  const product = productStore.activeProduct
  if (!product) return false
  return product.createdByUserId === authStore.user?.id || authStore.user?.role === 'super_admin'
})

// Product edit form
const productName = ref('')
const productDescription = ref('')
const productLogoPreview = ref<string | null>(null)
const productLogoFile = ref<File | null>(null)
const productLogoInputRef = ref<HTMLInputElement | null>(null)
const productSaving = ref(false)
const productSaved = ref(false)
const productError = ref('')

function loadProductForm() {
  const p = productStore.activeProduct
  if (p) {
    productName.value = p.name
    productDescription.value = p.description || ''
    productLogoPreview.value = p.logo || null
    productLogoFile.value = null
  }
}

watch(() => productStore.activeProduct?.name, () => loadProductForm())
watch(activeTab, (tab) => { if (tab === 'product') loadProductForm() })

function triggerProductLogoUpload() {
  productLogoInputRef.value?.click()
}

function handleProductLogoChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  productLogoFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => { productLogoPreview.value = e.target?.result as string }
  reader.readAsDataURL(file)
}

function removeProductLogo() {
  productLogoPreview.value = null
  productLogoFile.value = null
  if (productLogoInputRef.value) productLogoInputRef.value.value = ''
}

async function uploadProductLogo(): Promise<string> {
  if (!productLogoFile.value) throw new Error('No file selected')
  const formData = new FormData()
  formData.append('file', productLogoFile.value)
  const res = await fetch('/api/products/upload-logo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authStore.token}` },
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Logo upload failed')
  }
  const logo = (data as { logo?: string }).logo
  if (!logo) throw new Error('Invalid response from logo upload')
  return logo
}

async function handleProductSave() {
  if (!productStore.activeProduct) return
  productError.value = ''
  productSaved.value = false
  productSaving.value = true

  try {
    let logoUrl: string | null | undefined = undefined
    if (productLogoFile.value) {
      try {
        logoUrl = await uploadProductLogo()
        productLogoFile.value = null
        if (productLogoInputRef.value) productLogoInputRef.value.value = ''
        productLogoPreview.value = logoUrl
      } catch (e) {
        productError.value = (e as Error).message || 'Logo upload failed'
        return
      }
    } else if (!productLogoPreview.value && productStore.activeProduct.logo) {
      logoUrl = null // Logo was removed
    }

    const currentName = productStore.activeProductName
    const updates: Record<string, any> = {}
    if (productName.value.trim() !== currentName) updates.name = productName.value.trim()
    if (productDescription.value !== (productStore.activeProduct.description || '')) updates.description = productDescription.value || null
    if (logoUrl !== undefined) updates.logo = logoUrl

    if (Object.keys(updates).length === 0) {
      productSaved.value = true
      setTimeout(() => productSaved.value = false, 3000)
      return
    }

    const success = await productStore.updateProduct(currentName, updates)
    if (success) {
      productSaved.value = true
      setTimeout(() => productSaved.value = false, 3000)
    } else {
      productError.value = 'Failed to update product. The name may already be taken.'
    }
  } catch {
    productError.value = 'Network error. Please try again.'
  } finally {
    productSaving.value = false
  }
}

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

async function uploadAvatar(): Promise<{ avatar: string; user: User | null }> {
  if (!pendingFile.value) throw new Error('No file selected')

  const formData = new FormData()
  formData.append('file', pendingFile.value)

  const res = await fetch('/api/auth/upload-avatar', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authStore.token}`,
    },
    body: formData,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Avatar upload failed')
  }

  const avatar = (data as { avatar?: string; user?: User | null }).avatar
  const user = (data as { user?: User | null }).user ?? null
  if (!avatar) throw new Error('Invalid response from avatar upload')
  return { avatar, user }
}

async function handleSubmit() {
  saved.value = false
  authStore.error = null
  uploading.value = true

  try {
    if (pendingFile.value) {
      const { user: uploadedUser } = await uploadAvatar()
      pendingFile.value = null
      if (uploadedUser) {
        authStore.$patch({ user: uploadedUser })
        avatarPreview.value = uploadedUser.avatar || null
      } else {
        const refreshed = await authStore.fetchMe()
        if (!refreshed) {
          authStore.error = 'Avatar uploaded but profile could not be refreshed. Please reload the page.'
          return
        }
        if (authStore.user?.avatar) avatarPreview.value = authStore.user.avatar
      }
    }

    const data: { name?: string; email?: string } = {}
    if (name.value !== authStore.user?.name) data.name = name.value
    if (email.value !== authStore.user?.email) data.email = email.value

    if (Object.keys(data).length > 0) {
      const success = await authStore.updateProfile(data)
      if (!success) return
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
        v-if="canViewRoles"
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
      <button
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === 'email'
          ? 'text-[#7C5CFC]'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'email'"
      >
        <Mail :size="16" />
        Email Notifications
        <span
          v-if="activeTab === 'email'"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C5CFC] rounded-t"
        />
      </button>
      <button
        v-if="productStore.activeProduct"
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === 'product'
          ? 'text-[#7C5CFC]'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'product'"
      >
        <Box :size="16" />
        Product Settings
        <span
          v-if="activeTab === 'product'"
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
                <UploadAssetImg
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
    <div v-if="activeTab === 'roles' && canViewRoles">
      <RolesSettings />
    </div>

    <!-- Email Notifications Tab -->
    <div v-if="activeTab === 'email'" class="max-w-2xl">
      <div class="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-900 mb-1">Email Notifications</h2>
        <p class="text-sm text-gray-500 mb-6">Choose which email notifications you'd like to receive</p>

        <!-- Success -->
        <div
          v-if="emailPrefsSaved"
          class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6"
        >
          <CheckCircle2 :size="16" class="text-green-500" />
          <p class="text-sm text-green-700 font-medium">Preferences saved</p>
        </div>

        <div class="space-y-5">
          <!-- Assigned to me -->
          <label class="flex items-center justify-between gap-4 cursor-pointer group">
            <div>
              <p class="text-sm font-medium text-gray-900 group-hover:text-gray-700">Assigned to me</p>
              <p class="text-xs text-gray-500 mt-0.5">When a task, story, or issue is assigned to you</p>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              :class="emailPrefs.assignedToMe ? 'bg-[#7C5CFC]' : 'bg-gray-200'"
              @click="emailPrefs.assignedToMe = !emailPrefs.assignedToMe"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out"
                :class="emailPrefs.assignedToMe ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </label>

          <!-- Status changes -->
          <label class="flex items-center justify-between gap-4 cursor-pointer group">
            <div>
              <p class="text-sm font-medium text-gray-900 group-hover:text-gray-700">Status changes</p>
              <p class="text-xs text-gray-500 mt-0.5">When items you own or are assigned to change status</p>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              :class="emailPrefs.statusChanges ? 'bg-[#7C5CFC]' : 'bg-gray-200'"
              @click="emailPrefs.statusChanges = !emailPrefs.statusChanges"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out"
                :class="emailPrefs.statusChanges ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </label>

          <!-- New comments -->
          <label class="flex items-center justify-between gap-4 cursor-pointer group">
            <div>
              <p class="text-sm font-medium text-gray-900 group-hover:text-gray-700">New comments</p>
              <p class="text-xs text-gray-500 mt-0.5">When someone comments on your items</p>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              :class="emailPrefs.newComments ? 'bg-[#7C5CFC]' : 'bg-gray-200'"
              @click="emailPrefs.newComments = !emailPrefs.newComments"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out"
                :class="emailPrefs.newComments ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </label>

          <!-- Deadline reminders -->
          <label class="flex items-center justify-between gap-4 cursor-pointer group">
            <div>
              <p class="text-sm font-medium text-gray-900 group-hover:text-gray-700">Deadline reminders</p>
              <p class="text-xs text-gray-500 mt-0.5">Upcoming deadlines on deliveries and releases</p>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              :class="emailPrefs.deadlineReminders ? 'bg-[#7C5CFC]' : 'bg-gray-200'"
              @click="emailPrefs.deadlineReminders = !emailPrefs.deadlineReminders"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out"
                :class="emailPrefs.deadlineReminders ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </label>
        </div>

        <div class="mt-8 pt-6 border-t border-gray-100">
          <Button
            class="bg-[#7C5CFC] hover:bg-[#6B4CE0] h-10 px-6 text-sm font-medium"
            :disabled="emailPrefsSaving"
            @click="saveEmailPreferences"
          >
            <Loader2 v-if="emailPrefsSaving" :size="16" class="animate-spin mr-2" />
            {{ emailPrefsSaving ? 'Saving...' : 'Save Preferences' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Product Settings Tab -->
    <div v-if="activeTab === 'product' && productStore.activeProduct" class="max-w-2xl space-y-6">
      <!-- Product Edit Form -->
      <div class="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <form @submit.prevent="handleProductSave" class="space-y-6">
          <!-- Success -->
          <div v-if="productSaved" class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle2 :size="16" class="text-green-500" />
            <p class="text-sm text-green-700 font-medium">Product updated successfully</p>
          </div>

          <!-- Error -->
          <div v-if="productError" class="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p class="text-sm text-red-600">{{ productError }}</p>
          </div>

          <!-- Logo + Name row -->
          <div class="flex items-start gap-5">
            <!-- Logo upload -->
            <div class="relative group shrink-0">
              <div
                class="w-20 h-20 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer transition-colors hover:border-[#4857FE] hover:bg-[#4857FE]/5"
                @click="triggerProductLogoUpload"
              >
                <UploadAssetImg
                  v-if="productLogoPreview"
                  :src="productLogoPreview"
                  class="w-full h-full object-cover rounded-xl"
                  alt="Product logo"
                />
                <ImagePlus v-else :size="24" class="text-gray-400" />
              </div>
              <button
                v-if="productLogoPreview"
                type="button"
                class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm hover:bg-red-600 transition-colors"
                @click.stop="removeProductLogo"
              >
                <X :size="10" />
              </button>
              <input
                ref="productLogoInputRef"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                class="hidden"
                @change="handleProductLogoChange"
              />
            </div>

            <div class="flex-1 space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Product Name</label>
              <Input v-model="productName" placeholder="Product name" />
              <p class="text-xs text-gray-400">Click the icon to change the logo</p>
            </div>
          </div>

          <!-- Description -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Description</label>
            <Textarea
              v-model="productDescription"
              placeholder="Briefly describe the product..."
              :rows="3"
            />
          </div>

          <!-- Submit -->
          <div class="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              class="bg-[#7C5CFC] hover:bg-[#6B4CE0] h-10 px-6 text-sm font-medium"
              :disabled="productSaving"
            >
              <Loader2 v-if="productSaving" :size="16" class="animate-spin mr-2" />
              {{ productSaving ? 'Saving...' : 'Save Changes' }}
            </Button>
          </div>
        </form>
      </div>

      <!-- Danger Zone -->
      <div v-if="canDeleteProduct" class="rounded-2xl border-2 border-red-200 bg-white overflow-hidden">
        <div class="px-6 py-4 bg-red-50 border-b border-red-200">
          <h2 class="text-lg font-semibold text-red-800 flex items-center gap-2">
            <AlertTriangle :size="18" />
            Danger Zone
          </h2>
        </div>
        <div class="px-6 py-5">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-900">Delete this product</p>
              <p class="text-sm text-gray-500 mt-0.5">
                Once you delete a product, there is no going back. All stories, tasks, initiatives, deliveries, and other data will be permanently removed.
              </p>
            </div>
            <button
              class="shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
              @click="showDeleteProductDialog = true"
            >
              Delete Product
            </button>
          </div>
        </div>
      </div>

      <!-- Delete Product Dialog -->
      <DeleteProductDialog
        v-model:open="showDeleteProductDialog"
        :product-name="productStore.activeProductName"
      />
    </div>
  </div>
</template>
