<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useReleasesStore } from '@/stores/releases'
import { useDeliveriesStore } from '@/stores/deliveries'
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
import RichTextEditor from '@/components/ui/RichTextEditor.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Search, Loader2 } from 'lucide-vue-next'
import type { ReleaseType, ReleaseStatus } from '@/types/release'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [id: string]
}>()

const releasesStore = useReleasesStore()
const deliveriesStore = useDeliveriesStore()
const productStore = useProductStore()
const authStore = useAuthStore()

const title = ref('')
const version = ref('')
const releaseType = ref<ReleaseType>('feature')
const status = ref<ReleaseStatus>('draft')
const plannedAt = ref('')
const notes = ref('')
const releaseManagerId = ref<string | null>(null)
const selectedDeliveryIds = ref<string[]>([])
const submitting = ref(false)

// Release manager search
const managerSearch = ref('')
const managerSearchResults = ref<any[]>([])
const showManagerDropdown = ref(false)
const selectedManager = ref<any>(null)

async function searchManagers(query: string) {
  if (!query.trim()) { managerSearchResults.value = []; return }
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) managerSearchResults.value = await res.json()
  } catch { /* ignore */ }
}

let managerTimeout: ReturnType<typeof setTimeout>
function onManagerInput() {
  clearTimeout(managerTimeout)
  managerTimeout = setTimeout(() => searchManagers(managerSearch.value), 200)
  showManagerDropdown.value = true
}

function selectManager(user: any) {
  selectedManager.value = user
  releaseManagerId.value = user.id
  managerSearch.value = user.name
  showManagerDropdown.value = false
}

function clearManager() {
  selectedManager.value = null
  releaseManagerId.value = null
  managerSearch.value = ''
}

const availableDeliveries = computed(() => deliveriesStore.deliveries)

function toggleDelivery(id: string) {
  const idx = selectedDeliveryIds.value.indexOf(id)
  if (idx >= 0) {
    selectedDeliveryIds.value.splice(idx, 1)
  } else {
    selectedDeliveryIds.value.push(id)
  }
}

watch(open, (val) => {
  if (val) {
    deliveriesStore.fetchDeliveries()
  } else {
    title.value = ''
    version.value = ''
    releaseType.value = 'feature'
    status.value = 'draft'
    plannedAt.value = ''
    notes.value = ''
    releaseManagerId.value = null
    selectedManager.value = null
    managerSearch.value = ''
    selectedDeliveryIds.value = []
  }
})

async function submit() {
  if (!title.value.trim() || submitting.value) return
  submitting.value = true
  try {
    const pid = productStore.activeProductName
    if (!pid) return
    const result = await releasesStore.createRelease({
      title: title.value.trim(),
      version: version.value.trim() || null,
      releaseType: releaseType.value,
      status: status.value,
      plannedAt: plannedAt.value || null,
      releaseManagerId: releaseManagerId.value,
      notes: notes.value || null,
      productId: pid,
      deliveryIds: selectedDeliveryIds.value,
    })
    if (result) {
      emit('created', result.id)
      open.value = false
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create Release</DialogTitle>
        <DialogDescription>Create a new release to bundle deliveries for deployment.</DialogDescription>
      </DialogHeader>

      <form @submit.prevent="submit" class="space-y-4 mt-2">
        <!-- Title -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <Input v-model="title" placeholder="Release title..." />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <!-- Version -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Version</label>
            <Input v-model="version" placeholder="e.g. 1.0.0" />
          </div>

          <!-- Planned Date -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Planned Date</label>
            <input
              v-model="plannedAt"
              type="date"
              class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <!-- Type -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Type</label>
            <Select v-model="releaseType">
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="hotfix">Hotfix</SelectItem>
                <SelectItem value="patch">Patch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Status -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Status</label>
            <Select v-model="status">
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Release Manager -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Release Manager</label>
          <div class="relative">
            <div v-if="selectedManager" class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg">
              <div class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                {{ selectedManager.name.charAt(0).toUpperCase() }}
              </div>
              <span class="text-sm flex-1">{{ selectedManager.name }}</span>
              <button type="button" @click="clearManager" class="text-gray-400 hover:text-gray-600 text-xs">Clear</button>
            </div>
            <div v-else>
              <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                v-model="managerSearch"
                @input="onManagerInput"
                @focus="showManagerDropdown = true"
                placeholder="Search team members..."
                class="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
              />
            </div>
            <div
              v-if="showManagerDropdown && managerSearchResults.length > 0 && !selectedManager"
              class="absolute z-[100] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto"
            >
              <div
                v-for="user in managerSearchResults"
                :key="user.id"
                @click="selectManager(user)"
                class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <div class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                  {{ user.name.charAt(0).toUpperCase() }}
                </div>
                <span class="text-sm">{{ user.name }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Notes</label>
          <RichTextEditor v-model="notes" placeholder="Release notes..." />
        </div>

        <!-- Linked Deliveries -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Linked Deliveries</label>
          <div class="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
            <div v-if="availableDeliveries.length === 0" class="px-3 py-4 text-sm text-gray-400 text-center">
              No deliveries available
            </div>
            <div
              v-for="delivery in availableDeliveries"
              :key="delivery.id"
              @click="toggleDelivery(delivery.id)"
              class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
            >
              <div
                class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                :class="selectedDeliveryIds.includes(delivery.id)
                  ? 'bg-[#4857FE] border-[#4857FE]'
                  : 'border-gray-300'"
              >
                <Check v-if="selectedDeliveryIds.includes(delivery.id)" :size="10" class="text-white" />
              </div>
              <div class="flex-1 min-w-0">
                <span class="text-sm text-gray-700 truncate block">{{ delivery.title }}</span>
              </div>
              <span
                class="text-[10px] font-medium px-1.5 py-0.5 rounded"
                :class="{
                  'bg-green-50 text-green-600': delivery.status === 'completed',
                  'bg-orange-50 text-orange-600': delivery.status === 'in_progress',
                  'bg-gray-50 text-gray-500': delivery.status === 'initialized',
                }"
              >
                {{ delivery.status?.replace(/_/g, ' ') }}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter class="pt-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="!title.trim() || submitting">
            <Loader2 v-if="submitting" :size="14" class="animate-spin mr-2" />
            Create Release
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
