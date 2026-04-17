<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useProductStore } from '@/stores/products'
import { useRouter } from 'vue-router'
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
import { AlertTriangle, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  productName: string
  /** Stable API ref (preferred over name for delete) */
  productId?: string
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  deleted: []
}>()

const productStore = useProductStore()
const router = useRouter()

const confirmText = ref('')
const deleting = ref(false)
const error = ref('')

const canDelete = computed(() => confirmText.value === props.productName)

watch(open, (val) => {
  if (!val) {
    confirmText.value = ''
    error.value = ''
  }
})

async function handleDelete() {
  if (!canDelete.value) return

  deleting.value = true
  error.value = ''

  const ref = props.productId || props.productName
  const success = await productStore.deleteProduct(ref)

  deleting.value = false

  if (success) {
    open.value = false
    emit('deleted')
    router.push('/')
  } else {
    error.value = 'Failed to delete product. You may not have permission.'
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-red-600">
          <AlertTriangle :size="20" />
          Delete Product
        </DialogTitle>
        <DialogDescription>
          This action is permanent and cannot be undone.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <p class="text-sm font-medium text-red-800">
            You are about to delete <span class="font-bold">{{ productName }}</span>
          </p>
          <p class="text-sm text-red-700">
            This will permanently delete all associated data including:
          </p>
          <ul class="text-sm text-red-700 list-disc list-inside space-y-0.5">
            <li>All stories and tasks</li>
            <li>All initiatives and deliveries</li>
            <li>All releases and servers</li>
            <li>All test cycles and feature requests</li>
            <li>All team member associations</li>
            <li>All consumer feedback and assets</li>
          </ul>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">
            Type <span class="font-bold text-gray-900">{{ productName }}</span> to confirm
          </label>
          <Input
            v-model="confirmText"
            :placeholder="productName"
            class="font-mono"
            @keydown.enter="handleDelete"
          />
          <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">Cancel</Button>
        <Button
          type="button"
          :disabled="!canDelete || deleting"
          class="bg-red-600 hover:bg-red-700 text-white"
          @click="handleDelete"
        >
          <Loader2 v-if="deleting" :size="14" class="animate-spin mr-1.5" />
          {{ deleting ? 'Deleting...' : 'Delete Product' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
