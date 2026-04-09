<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useWikiStore } from '@/stores/wiki'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Loader2, X, Tag, Plus } from 'lucide-vue-next'
import type { AssetStatus, AssetVisibility } from '@/types/wiki'

interface UserResult {
  id: string
  name: string
  email: string
  avatar: string | null
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [] }>()

const productStore = useProductStore()
const authStore = useAuthStore()
const wikiStore = useWikiStore()

const title = ref('')
const description = ref('')
const content = ref('')
const assetTypeId = ref('')
const status = ref<AssetStatus>('draft')
const visibility = ref<AssetVisibility>('internal')
const ownerUserId = ref<string | null>(null)
const ownerName = ref('')
const tagInput = ref('')
const tags = ref<string[]>([])
const submitting = ref(false)

// Owner search
const ownerSearchQuery = ref('')
const ownerSearchResults = ref<UserResult[]>([])
const ownerSearchLoading = ref(false)
const showOwnerDropdown = ref(false)
let ownerSearchTimeout: ReturnType<typeof setTimeout> | null = null

// Grouped asset types
const typeGroups = computed(() => {
  const groups: Record<string, { label: string; types: typeof wikiStore.assetTypes }> = {}
  for (const at of wikiStore.assetTypes) {
    if (!groups[at.category]) {
      const labels: Record<string, string> = {
        engineering: 'Engineering / Infra',
        product: 'Product / UX',
        business: 'Business / Knowledge',
        external: 'External / Integration',
      }
      groups[at.category] = { label: labels[at.category] || at.category, types: [] }
    }
    groups[at.category]!.types.push(at)
  }
  return Object.values(groups)
})

async function searchOwners(query: string) {
  ownerSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) ownerSearchResults.value = await res.json()
  } catch {
    ownerSearchResults.value = []
  } finally {
    ownerSearchLoading.value = false
  }
}

function onOwnerInput() {
  showOwnerDropdown.value = true
  if (ownerSearchTimeout) clearTimeout(ownerSearchTimeout)
  ownerSearchTimeout = setTimeout(() => searchOwners(ownerSearchQuery.value), 200)
}

function selectOwner(user: UserResult) {
  ownerUserId.value = user.id
  ownerName.value = user.name
  showOwnerDropdown.value = false
  ownerSearchQuery.value = ''
}

function onOwnerBlur() {
  setTimeout(() => (showOwnerDropdown.value = false), 150)
}

function clearOwner() {
  ownerUserId.value = null
  ownerName.value = ''
}

function addTag() {
  const t = tagInput.value.trim().toLowerCase()
  if (t && !tags.value.includes(t)) {
    tags.value.push(t)
  }
  tagInput.value = ''
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

function onTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
  }
}

watch(open, (val) => {
  if (!val) {
    title.value = ''
    description.value = ''
    content.value = ''
    assetTypeId.value = ''
    status.value = 'draft'
    visibility.value = 'internal'
    ownerUserId.value = null
    ownerName.value = ''
    tags.value = []
    tagInput.value = ''
    } else {
      // Ensure types are loaded
      const pname = productStore.activeProductName
      if (wikiStore.assetTypes.length === 0 && pname) {
        wikiStore.fetchAssetTypes(pname)
      }
    }
})

async function handleSubmit() {
  if (!title.value.trim() || !assetTypeId.value) return
  submitting.value = true

  const pname = productStore.activeProductName
  if (!pname) { submitting.value = false; return }
  const created = await wikiStore.createAsset({
    productId: pname,
    assetTypeId: assetTypeId.value,
    title: title.value.trim(),
    description: description.value.trim() || null,
    content: content.value.trim() || null,
    status: status.value,
    visibility: visibility.value,
    ownerUserId: ownerUserId.value,
    tags: tags.value.length > 0 ? tags.value : null,
  })

  submitting.value = false
  if (created) {
    emit('created')
    open.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create Asset</DialogTitle>
        <DialogDescription>Add a new asset to the wiki.</DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Title -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input
            v-model="title"
            autofocus
            placeholder="e.g. REST API v2, Auth Service, Incident Response SOP..."
            class="w-full text-lg font-medium bg-transparent border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400 transition-colors"
          />
        </div>

        <!-- Type & Status -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Type *</label>
            <Select v-model="assetTypeId">
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <template v-for="group in typeGroups" :key="group.label">
                  <SelectGroup>
                    <SelectLabel class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{{ group.label }}</SelectLabel>
                    <SelectItem v-for="at in group.types" :key="at.id" :value="at.id">
                      <span class="flex items-center gap-2">
                        <span>{{ at.icon }}</span>
                        {{ at.name }}
                      </span>
                    </SelectItem>
                  </SelectGroup>
                </template>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Status</label>
            <Select v-model="status">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft"><span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-gray-400"></span>Draft</span></SelectItem>
                <SelectItem value="active"><span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-green-500"></span>Active</span></SelectItem>
                <SelectItem value="deprecated"><span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-red-500"></span>Deprecated</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Visibility & Owner -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Visibility</label>
            <Select v-model="visibility">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Owner</label>
            <div v-if="ownerName" class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-[7px] bg-white">
              <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ ownerName }}</span>
              <button type="button" class="text-gray-400 hover:text-gray-600" @click="clearOwner"><X :size="14" /></button>
            </div>
            <div v-else class="relative">
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-[7px] focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  v-model="ownerSearchQuery"
                  class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Search users..."
                  @input="onOwnerInput"
                  @focus="showOwnerDropdown = true; searchOwners(ownerSearchQuery)"
                  @blur="onOwnerBlur"
                />
              </div>
              <div
                v-if="showOwnerDropdown && ownerSearchResults.length > 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[100]"
              >
                <button
                  v-for="user in ownerSearchResults"
                  :key="user.id"
                  type="button"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                  @mousedown.prevent="selectOwner(user)"
                >
                  <div class="w-5 h-5 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-medium overflow-hidden shrink-0">
                    <UploadAssetImg v-if="user.avatar" :src="user.avatar" class="w-5 h-5 rounded-full object-cover" />
                    <span v-else>{{ user.name[0] }}</span>
                  </div>
                  <span class="text-sm text-gray-900">{{ user.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <input
            v-model="description"
            placeholder="Short summary of this asset..."
            class="w-full text-sm bg-transparent border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400 transition-colors"
          />
        </div>

        <!-- Tags -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Tags</label>
          <div class="flex items-center gap-1.5 flex-wrap border border-gray-200 rounded-lg px-2.5 py-2 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
            <span
              v-for="tag in tags"
              :key="tag"
              class="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full"
            >
              {{ tag }}
              <button type="button" class="text-gray-400 hover:text-gray-600" @click="removeTag(tag)"><X :size="10" /></button>
            </span>
            <input
              v-model="tagInput"
              class="flex-1 min-w-[80px] text-sm bg-transparent outline-none placeholder-gray-400"
              placeholder="Add tag..."
              @keydown="onTagKeydown"
              @blur="addTag"
            />
          </div>
        </div>

        <!-- Content -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Content</label>
          <Textarea
            v-model="content"
            placeholder="Write content using markdown..."
            :rows="6"
            class="font-mono text-[13px]"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button
            type="submit"
            :disabled="!title.trim() || !assetTypeId || submitting"
            class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          >
            {{ submitting ? 'Creating...' : 'Create Asset' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
