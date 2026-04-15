<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import {
  X, Maximize2, Copy, Loader2, ChevronDown, Check,
  Clock, CalendarDays, FileText, Package, ListTodo,
} from 'lucide-vue-next'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useProductStore } from '@/stores/products'
import type { Delivery, DeliveryStatus } from '@/types/delivery'
import { useCopyLink } from '@/utils/useCopyLink'
import { buildEntityShareUrl, productShareContextFromProductName } from '@/utils/productDeepLink'

const props = defineProps<{
  delivery: Delivery | null
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  updated: []
  navigate: [id: string]
}>()

const deliveriesStore = useDeliveriesStore()
const productStore = useProductStore()
const { copied, copyLink } = useCopyLink()
const origin = typeof window !== 'undefined' ? window.location.origin : ''

function copyDeliveryShareLink() {
  const d = props.delivery
  if (!d) return
  const ctx = productShareContextFromProductName(
    productStore.products,
    d.productId,
    productStore.activeProduct || { name: d.productId, projectKey: null },
  )
  copyLink(buildEntityShareUrl(origin, '/deliveries', { delivery: d.id }, ctx))
}

// Editing state
const editingField = ref<string | null>(null)
const editTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const saving = ref(false)

// Dropdown states
const showStatusDropdown = ref(false)

// Edit fields
const editDescription = ref('')
const editStartDate = ref('')
const editEndDate = ref('')

// Options
const statusOptions: { value: DeliveryStatus; label: string }[] = [
  { value: 'initialized', label: 'Initialized' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

// Reset state when delivery changes
watch(() => props.delivery?.id, () => {
  editingField.value = null
  closeAllDropdowns()
})

function closeAllDropdowns() {
  showStatusDropdown.value = false
}

async function updateField(field: string, value: any) {
  if (!props.delivery) return
  saving.value = true
  try {
    await deliveriesStore.updateDelivery(props.delivery.id, { [field]: value })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
    closeAllDropdowns()
  }
}

// Title editing
function startEditTitle() {
  if (!props.delivery) return
  editTitle.value = props.delivery.title
  editingField.value = 'title'
  nextTick(() => titleInputRef.value?.focus())
}

async function saveTitle() {
  if (!props.delivery || !editTitle.value.trim()) {
    editingField.value = null
    return
  }
  if (editTitle.value === props.delivery.title) {
    editingField.value = null
    return
  }
  await updateField('title', editTitle.value.trim())
}

// Status
async function selectStatus(status: DeliveryStatus) {
  await updateField('status', status)
}

// Dates
function startEditDates() {
  if (!props.delivery) return
  editStartDate.value = props.delivery.startDate || ''
  editEndDate.value = props.delivery.endDate || ''
  editingField.value = 'dates'
}

async function saveDates() {
  saving.value = true
  try {
    await deliveriesStore.updateDelivery(props.delivery!.id, {
      startDate: editStartDate.value || null,
      endDate: editEndDate.value || null,
    })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
  }
}

// Description
function startEditDescription() {
  if (!props.delivery) return
  editDescription.value = props.delivery.description || ''
  editingField.value = 'description'
}

async function saveDescription() {
  if (!props.delivery) return
  if (editDescription.value === (props.delivery.description || '')) {
    editingField.value = null
    return
  }
  await updateField('description', editDescription.value || null)
}

function onBackdropClick() {
  closeAllDropdowns()
}

// ============ STYLING ============

function statusStyle(status: string) {
  switch (status) {
    case 'initialized': return 'bg-[#ff69b4]/15 text-[#ff69b4]'
    case 'in_progress': return 'bg-[#fdab3d]/15 text-[#d48806]'
    case 'overdue': return 'bg-[#e2445c]/15 text-[#e2445c]'
    case 'blocked': return 'bg-[#a25ddc]/15 text-[#a25ddc]'
    case 'completed': return 'bg-[#00c875]/15 text-[#00a65a]'
    case 'archived': return 'bg-gray-100 text-gray-400'
    default: return 'bg-gray-100 text-gray-500'
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'initialized': return 'bg-[#ff69b4]'
    case 'in_progress': return 'bg-[#fdab3d]'
    case 'overdue': return 'bg-[#e2445c]'
    case 'blocked': return 'bg-[#a25ddc]'
    case 'completed': return 'bg-[#00c875]'
    case 'archived': return 'bg-gray-300'
    default: return 'bg-gray-400'
  }
}

function label(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function progressPercent() {
  if (!props.delivery) return 0
  if (props.delivery.progress !== undefined) return props.delivery.progress
  if (props.delivery.totalTasks && props.delivery.totalTasks > 0 && props.delivery.completedTasks !== undefined) {
    return Math.round((props.delivery.completedTasks / props.delivery.totalTasks) * 100)
  }
  return 0
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="panel-backdrop">
      <div
        v-if="open && delivery"
        class="fixed inset-0 bg-black/20 z-40"
        @click="emit('close')"
      ></div>
    </Transition>

    <!-- Slide-over Panel -->
    <Transition name="panel-slide">
      <div
        v-if="open && delivery"
        class="fixed top-0 right-0 bottom-0 w-[520px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
        @click="onBackdropClick"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div class="flex items-center gap-2">
            <button class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Expand"
              @click="emit('navigate', delivery.id)"
            >
              <Maximize2 :size="14" />
            </button>
            <button
              class="p-1 rounded-md hover:bg-gray-100 transition-colors"
              :class="copied ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'"
              title="Copy link"
              @click="copyDeliveryShareLink()"
            >
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
            </button>
            <span class="text-[11px] font-mono text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">DLV-{{ delivery.id.slice(-5).toUpperCase() }}</span>
            <div v-if="saving" class="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 :size="12" class="animate-spin" /> Saving...
            </div>
          </div>
          <button
            class="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 overflow-y-auto">
          <!-- Title -->
          <div class="px-6 pt-5 pb-4">
            <div v-if="editingField === 'title'" class="mb-4">
              <input
                ref="titleInputRef"
                v-model="editTitle"
                class="w-full text-lg font-bold text-gray-900 bg-transparent border-b-2 border-[#4857FE] outline-none py-1 leading-snug"
                @keydown.enter="saveTitle"
                @keydown.escape="editingField = null"
                @blur="saveTitle"
                @click.stop
              />
            </div>
            <h2
              v-else
              class="text-lg font-bold text-gray-900 leading-snug mb-4 cursor-pointer hover:text-[#4857FE] transition-colors group/title"
              @click.stop="startEditTitle"
            >
              {{ delivery.title }}
              <span class="text-xs text-gray-300 opacity-0 group-hover/title:opacity-100 ml-1 transition-opacity">click to edit</span>
            </h2>

            <!-- Metadata Grid -->
            <div class="space-y-3.5">
              <!-- Status -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <Clock :size="13" class="text-gray-400" /> Status
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="statusStyle(delivery.status)"
                    @click="showStatusDropdown = !showStatusDropdown"
                  >
                    <span class="w-2 h-2 rounded-full" :class="statusDot(delivery.status)"></span>
                    {{ label(delivery.status) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div v-if="showStatusDropdown" class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]">
                    <button
                      v-for="opt in statusOptions" :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="delivery.status === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectStatus(opt.value)"
                    >
                      <span class="w-2 h-2 rounded-full" :class="statusDot(opt.value)"></span>
                      {{ opt.label }}
                      <Check v-if="delivery.status === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Period -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <CalendarDays :size="13" class="text-gray-400" /> Period
                </span>
                <div v-if="editingField === 'dates'" class="flex items-center gap-2" @click.stop>
                  <input
                    v-model="editStartDate"
                    type="date"
                    class="text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE]"
                  />
                  <span class="text-xs text-gray-400">to</span>
                  <input
                    v-model="editEndDate"
                    type="date"
                    class="text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE]"
                  />
                  <button class="text-xs text-[#4857FE] font-medium hover:underline" @click="saveDates">Save</button>
                  <button class="text-xs text-gray-400 hover:underline" @click="editingField = null">Cancel</button>
                </div>
                <button
                  v-else
                  class="text-sm text-gray-700 hover:text-[#4857FE] transition-colors cursor-pointer"
                  @click.stop="startEditDates"
                >
                  {{ delivery.startDate || delivery.endDate
                    ? `${formatDate(delivery.startDate)} – ${formatDate(delivery.endDate)}`
                    : 'Set dates' }}
                </button>
              </div>

              <!-- Progress -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <ListTodo :size="13" class="text-gray-400" /> Progress
                </span>
                <div class="flex items-center gap-3 flex-1">
                  <div class="flex-1 max-w-[180px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="progressPercent() === 100 ? 'bg-[#00c875]' : 'bg-[#4857FE]'"
                      :style="{ width: progressPercent() + '%' }"
                    ></div>
                  </div>
                  <span class="text-sm text-gray-700 font-medium">{{ progressPercent() }}%</span>
                  <span class="text-xs text-gray-400">({{ delivery.completedTasks || 0 }}/{{ delivery.totalTasks || 0 }} tasks)</span>
                </div>
              </div>

              <!-- Created by -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0">Created by</span>
                <div class="flex items-center gap-2">
                  <template v-if="delivery.createdByUser">
                    <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                      <UploadAssetImg v-if="delivery.createdByUser.avatar" :src="delivery.createdByUser.avatar" class="w-6 h-6 rounded-full object-cover" />
                      <span v-else>{{ delivery.createdByUser.name[0] }}</span>
                    </div>
                    <span class="text-sm text-gray-700">{{ delivery.createdByUser.name }}</span>
                  </template>
                  <span v-else class="text-sm text-gray-400">—</span>
                </div>
              </div>

              <!-- Created -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0">Created</span>
                <span class="text-sm text-gray-700">{{ formatDate(delivery.createdAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Description -->
          <div class="px-6 py-4 border-t border-gray-100">
            <div class="flex items-center gap-1.5 mb-2">
              <FileText :size="13" class="text-gray-400" />
              <span class="text-sm font-medium text-gray-700">Description</span>
            </div>
            <div v-if="editingField === 'description'" @click.stop>
              <textarea
                v-model="editDescription"
                rows="4"
                class="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 resize-none"
                placeholder="Add a description..."
                @keydown.escape="editingField = null"
              ></textarea>
              <div class="flex items-center gap-2 mt-2">
                <button class="px-3 py-1.5 bg-[#4857FE] text-white text-xs font-medium rounded-md hover:bg-[#3a46d9] transition-colors" @click="saveDescription">Save</button>
                <button class="px-3 py-1.5 text-gray-500 text-xs font-medium hover:text-gray-700 transition-colors" @click="editingField = null">Cancel</button>
              </div>
            </div>
            <div
              v-else
              class="text-sm text-gray-600 whitespace-pre-wrap cursor-pointer hover:bg-gray-50 rounded-lg px-3 py-2 -mx-3 transition-colors min-h-[40px]"
              @click.stop="startEditDescription"
            >
              {{ delivery.description || 'Click to add a description...' }}
            </div>
          </div>

          <!-- Open full page button -->
          <div class="px-6 py-4 border-t border-gray-100">
            <button
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              @click="emit('navigate', delivery.id)"
            >
              <Package :size="14" />
              Open full delivery page
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-backdrop-enter-active,
.panel-backdrop-leave-active {
  transition: opacity 0.25s ease;
}
.panel-backdrop-enter-from,
.panel-backdrop-leave-to {
  opacity: 0;
}

.panel-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-slide-leave-active {
  transition: transform 0.2s ease-in;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
}
</style>
