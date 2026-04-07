<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { resolveUploadAssetUrl } from '@/utils/uploadAssetUrl'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  src: string | null | undefined
  alt?: string
}>()

const attrs = useAttrs()
const resolved = computed(() => resolveUploadAssetUrl(props.src))
</script>

<template>
  <img
    v-if="resolved"
    :src="resolved"
    :alt="alt ?? ''"
    v-bind="attrs"
  />
</template>
