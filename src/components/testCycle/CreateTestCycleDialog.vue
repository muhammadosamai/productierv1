<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useTestCyclesStore } from '@/stores/testCycles'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useReleasesStore } from '@/stores/releases'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-vue-next'
import type { TestCycleStatus } from '@/types/testCycle'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [id: string] }>()

const store = useTestCyclesStore()
const deliveriesStore = useDeliveriesStore()
const releasesStore = useReleasesStore()
const productStore = useProductStore()

const title = ref('')
const description = ref('')
const status = ref<TestCycleStatus>('planned')
const linkType = ref<'none' | 'delivery' | 'release'>('none')
const deliveryId = ref('')
const releaseId = ref('')
const startDate = ref('')
const endDate = ref('')
const submitting = ref(false)

watch(open, (val) => {
  if (val) {
    deliveriesStore.fetchDeliveries()
    releasesStore.fetchReleases()
  }
  if (!val) {
    title.value = ''
    description.value = ''
    status.value = 'planned'
    linkType.value = 'none'
    deliveryId.value = ''
    releaseId.value = ''
    startDate.value = ''
    endDate.value = ''
  }
})

async function handleSubmit() {
  if (!title.value.trim()) return
  submitting.value = true
  const cycle = await store.createCycle({
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    status: status.value,
    deliveryId: linkType.value === 'delivery' && deliveryId.value ? deliveryId.value : undefined,
    releaseId: linkType.value === 'release' && releaseId.value ? releaseId.value : undefined,
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined,
  })
  submitting.value = false
  if (cycle) {
    emit('created', cycle.id)
    open.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Create Test Cycle</DialogTitle>
        <DialogDescription>Create a new test cycle to track issues.</DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input
            v-model="title"
            placeholder="e.g. Sprint 5 Regression"
            autofocus
            class="w-full text-base font-medium bg-transparent border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400 transition-colors"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <Textarea v-model="description" placeholder="Describe the scope of this test cycle..." :rows="3" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Status</label>
            <Select v-model="status">
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Link To</label>
            <Select v-model="linkType">
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="release">Release</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div v-if="linkType === 'delivery'" class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Delivery</label>
          <Select v-model="deliveryId">
            <SelectTrigger><SelectValue placeholder="Select delivery" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="d in deliveriesStore.deliveries" :key="d.id" :value="d.id">{{ d.title }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="linkType === 'release'" class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Release</label>
          <Select v-model="releaseId">
            <SelectTrigger><SelectValue placeholder="Select release" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="r in releasesStore.releases" :key="r.id" :value="r.id">{{ r.title }} {{ r.version ? `(${r.version})` : '' }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Start Date</label>
            <input v-model="startDate" type="date" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">End Date</label>
            <input v-model="endDate" type="date" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] transition-colors" />
          </div>
        </div>

        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="!title.trim() || submitting" class="bg-[#4857FE] hover:bg-[#3E4BDE]">
            {{ submitting ? 'Creating...' : 'Create Cycle' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
