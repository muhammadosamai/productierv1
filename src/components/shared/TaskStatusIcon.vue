<script setup lang="ts">
defineProps<{
  status: string
  size?: number
}>()
</script>

<template>
  <!-- Created: 15% progress ring -->
  <svg v-if="status === 'created'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#d1d5db" stroke-width="2" />
    <circle cx="9" cy="9" r="7" fill="none" stroke="#9ca3af" stroke-width="2"
      stroke-linecap="round"
      :stroke-dasharray="2 * Math.PI * 7"
      :stroke-dashoffset="2 * Math.PI * 7 * 0.85"
      transform="rotate(-90 9 9)"
    />
  </svg>

  <!-- Assigned: 30% progress ring -->
  <svg v-else-if="status === 'assigned'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#e9d5ff" stroke-width="2" />
    <circle cx="9" cy="9" r="7" fill="none" stroke="#a25ddc" stroke-width="2"
      stroke-linecap="round"
      :stroke-dasharray="2 * Math.PI * 7"
      :stroke-dashoffset="2 * Math.PI * 7 * 0.70"
      transform="rotate(-90 9 9)"
    />
  </svg>

  <!-- In Progress: 60% progress ring (no animation) -->
  <svg v-else-if="status === 'in_progress'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#fde68a" stroke-width="2" />
    <circle cx="9" cy="9" r="7" fill="none" stroke="#fdab3d" stroke-width="2"
      stroke-linecap="round"
      :stroke-dasharray="2 * Math.PI * 7"
      :stroke-dashoffset="2 * Math.PI * 7 * 0.40"
      transform="rotate(-90 9 9)"
    />
  </svg>

  <!-- In Review: eye inside circle -->
  <svg v-else-if="status === 'in_review'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#579bfc" stroke-width="2" />
    <path d="M5.5 9C5.5 9 7 6.5 9 6.5C11 6.5 12.5 9 12.5 9C12.5 9 11 11.5 9 11.5C7 11.5 5.5 9 5.5 9Z" fill="none" stroke="#579bfc" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="9" cy="9" r="1.2" fill="#579bfc" />
  </svg>

  <!-- Done: checkmark inside circle -->
  <svg v-else-if="status === 'done'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#00c875" stroke-width="2" />
    <path d="M6 9.5L8 11.5L12 7" fill="none" stroke="#00c875" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <!-- Blocked: X inside circle -->
  <svg v-else-if="status === 'blocked'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#e2445c" stroke-width="2" />
    <path d="M6.5 6.5L11.5 11.5M11.5 6.5L6.5 11.5" fill="none" stroke="#e2445c" stroke-width="1.8" stroke-linecap="round" />
  </svg>

  <!-- Overdue: exclamation inside circle -->
  <svg v-else-if="status === 'overdue'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#ef4444" stroke-width="2" />
    <line x1="9" y1="5.5" x2="9" y2="10" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" />
    <circle cx="9" cy="12" r="0.9" fill="#ef4444" />
  </svg>

  <!-- Archived: archive box inside dashed circle -->
  <svg v-else-if="status === 'archived'" :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="3 2" />
    <rect x="5.5" y="6" width="7" height="2" rx="0.5" fill="none" stroke="#9ca3af" stroke-width="1.2" />
    <path d="M6.5 8V11.5H11.5V8" fill="none" stroke="#9ca3af" stroke-width="1.2" stroke-linejoin="round" />
    <line x1="8" y1="9.5" x2="10" y2="9.5" stroke="#9ca3af" stroke-width="1" stroke-linecap="round" />
  </svg>

  <!-- Fallback -->
  <svg v-else :width="size || 18" :height="size || 18" viewBox="0 0 18 18" class="shrink-0">
    <circle cx="9" cy="9" r="7" fill="none" stroke="#d1d5db" stroke-width="2" />
  </svg>
</template>
