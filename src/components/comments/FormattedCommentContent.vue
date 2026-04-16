<script setup lang="ts">
import { computed } from 'vue'
import type { MentionUser } from '@/lib/commentMentions'
import { parseCommentSegments } from '@/lib/commentMentions'
import { renderStoredRichText } from '@/lib/richText'
import { looksLikeLegacyPlainComment } from '@/lib/commentMentionEditor'

const props = defineProps<{
  text: string
  users: MentionUser[]
}>()

const isLegacyPlain = computed(() => looksLikeLegacyPlainComment(props.text || ''))

const richHtml = computed(() => renderStoredRichText(props.text || ''))

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
  <div
    v-if="!isLegacyPlain"
    class="text-sm text-gray-600 leading-snug break-words prose prose-sm max-w-none prose-p:my-0.5 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-a:text-[#4857FE]"
    v-html="richHtml"
  ></div>
  <span v-else class="text-sm text-gray-600 leading-snug break-words">
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
