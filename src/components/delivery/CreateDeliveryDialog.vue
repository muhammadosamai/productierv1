<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useInitiativesStore } from '@/stores/initiatives'
import { useProductStore } from '@/stores/products'
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
import { Check } from 'lucide-vue-next'
import type { DeliveryStatus } from '@/types/delivery'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [id: string]
}>()

const deliveriesStore = useDeliveriesStore()
const initiativesStore = useInitiativesStore()
const productStore = useProductStore()

const title = ref('')
const description = ref('')
const status = ref<DeliveryStatus>('initialized')
const startDate = ref('')
const endDate = ref('')
const selectedInitiativeIds = ref<string[]>([])
const submitting = ref(false)

const availableInitiatives = computed(() => initiativesStore.initiatives)

function toggleInitiative(id: string) {
  const idx = selectedInitiativeIds.value.indexOf(id)
  if (idx >= 0) {
    selectedInitiativeIds.value.splice(idx, 1)
  } else {
    selectedInitiativeIds.value.push(id)
  }
}

const submitted = ref(false)

function resetForm() {
  title.value = ''
  description.value = ''
  status.value = 'initialized'
  startDate.value = ''
  endDate.value = ''
  selectedInitiativeIds.value = []
}

// Only reset form after successful submission
watch(open, (val) => {
  if (!val && submitted.value) {
    resetForm()
    submitted.value = false
  } else if (val) {
    // Fetch initiatives when dialog opens
    initiativesStore.fetchInitiatives()
  }
})

async function handleSubmit() {
  if (!title.value.trim()) return
  submitting.value = true
  const created = await deliveriesStore.createDelivery({
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    status: status.value,
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined,
    productId: productStore.activeProduct.id,
    initiativeIds: selectedInitiativeIds.value.length > 0 ? selectedInitiativeIds.value : undefined,
  })
  submitting.value = false
  submitted.value = true
  if (created) {
    emit('created', created.id)
  }
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[520px] !overflow-visible">
      <DialogHeader>
        <DialogTitle>Create Delivery</DialogTitle>
        <DialogDescription>Plan a new delivery for your product.</DialogDescription>
      </DialogHeader>

      <button type="button" @click="resetForm" title="Clear form" class="absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
      </button>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Title -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <Input
            v-model="title"
            placeholder="e.g. Sprint 12 - User Dashboard"
            autofocus
          />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <RichTextEditor
            v-model="description"
            placeholder="Describe the delivery goals and scope..."
          />
        </div>

        <!-- Status -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Status</label>
          <Select v-model="status">
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="initialized">
                <span class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#ff69b4]"></span>
                  Initialized
                </span>
              </SelectItem>
              <SelectItem value="in_progress">
                <span class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#fdab3d]"></span>
                  In Progress
                </span>
              </SelectItem>
              <SelectItem value="overdue">
                <span class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#e2445c]"></span>
                  Overdue
                </span>
              </SelectItem>
              <SelectItem value="blocked">
                <span class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#a25ddc]"></span>
                  Blocked
                </span>
              </SelectItem>
              <SelectItem value="completed">
                <span class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#00c875]"></span>
                  Completed
                </span>
              </SelectItem>
              <SelectItem value="archived">
                <span class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#c4c4c4]"></span>
                  Archived
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Date Range -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Start Date</label>
            <Input v-model="startDate" type="date" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">End Date</label>
            <Input v-model="endDate" type="date" />
          </div>
        </div>

        <!-- Initiatives multi-select -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Linked Initiatives</label>
          <div v-if="availableInitiatives.length > 0" class="border border-gray-200 rounded-lg max-h-[160px] overflow-auto">
            <button
              v-for="init in availableInitiatives"
              :key="init.id"
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              @click="toggleInitiative(init.id)"
            >
              <div
                class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                :class="selectedInitiativeIds.includes(init.id)
                  ? 'bg-[#4857FE] border-[#4857FE]'
                  : 'border-gray-300'"
              >
                <Check v-if="selectedInitiativeIds.includes(init.id)" :size="12" class="text-white" />
              </div>
              <span class="text-sm text-gray-700 truncate flex-1">{{ init.title }}</span>
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="{
                  'bg-[#fdab3d]': init.status === 'planning',
                  'bg-[#00c875]': init.status === 'active',
                  'bg-[#e2445c]': init.status === 'paused',
                  'bg-[#c4c4c4]': init.status === 'completed',
                }"
              ></span>
            </button>
          </div>
          <p v-else class="text-xs text-gray-400 italic">No initiatives available for this product.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button
            type="submit"
            :disabled="!title.trim() || submitting"
            class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          >
            {{ submitting ? 'Creating...' : 'Create Delivery' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
