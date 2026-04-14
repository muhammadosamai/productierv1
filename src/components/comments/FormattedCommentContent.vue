<script setup lang="ts">
import { computed } from 'vue'
import type { MentionUser } from '@/lib/commentMentions'
import { parseCommentSegments } from '@/lib/commentMentions'

const props = defineProps<{
  text: string
  users: MentionUser[]
}>()

const userById = computed(() => {
  const m = new Map<string, MentionUser>()
  for (const u of props.users) {
    m.set(u.id, u)
    m.set(u.id.toLowerCase(), u)
  }
  return m
})

const segments = computed(() => parseCommentSegments(props.text || ''))
</script>

<template>
  <span class="text-sm text-gray-600 leading-snug break-words">
    <template v-for="(seg, i) in segments" :key="i">
      <template v-if="seg.type === 'text'">{{ seg.value }}</template>
      <span
        v-else
        class="font-medium text-[#4857FE]"
        :title="userById.get(seg.userId)?.email"
      >@{{
        userById.get(seg.userId)?.name || 'unknown'
      }}</span>
    </template>
  </span>
</template>
