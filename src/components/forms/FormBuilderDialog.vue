<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Columns3Cog } from 'lucide-vue-next'
import FormBuilder from '@/components/forms/FormBuilder.vue'
import type { EntityType } from '@/types/formConfig'

defineProps<{
  entityType: EntityType
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[680px] max-h-[85vh] flex flex-col overflow-hidden">
      <DialogHeader class="shrink-0">
        <DialogTitle class="flex items-center gap-2">
          <Columns3Cog :size="18" class="text-[#4857FE]" />
          Form Builder
        </DialogTitle>
        <DialogDescription>
          Customize fields for {{ entityType === 'story' ? 'Stories' : entityType === 'task' ? 'Tasks' : 'Issues' }}. Toggle visibility, mark required, add custom fields, and drag to reorder.
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto -mx-6 px-6">
        <FormBuilder :entity-type="entityType" />
      </div>
    </DialogContent>
  </Dialog>
</template>
