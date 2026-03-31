<script setup lang="ts">
const props = defineProps<{
  teamNameDraft: string
  teamKeyDraft: string
  teamDescriptionDraft: string
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:teamNameDraft', value: string): void
  (event: 'update:teamKeyDraft', value: string): void
  (event: 'update:teamDescriptionDraft', value: string): void
  (event: 'save-team'): void
  (event: 'cancel'): void
}>()

function onTeamNameInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:teamNameDraft', target?.value || '')
}

function onTeamKeyInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:teamKeyDraft', target?.value || '')
}

function onTeamDescriptionInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null
  emit('update:teamDescriptionDraft', target?.value || '')
}
</script>

<template>
  <section class="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-4">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-gray-800">Team Details</h3>
      <button
        type="button"
        class="text-xs rounded-md border border-gray-200 bg-white px-2.5 py-1 text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20"
        :disabled="props.loading"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>

    <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label for="team-manage-name" class="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
        <input
          id="team-manage-name"
          :value="props.teamNameDraft"
          type="text"
          name="teamName"
          autocomplete="off"
          class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
          @input="onTeamNameInput"
        >
      </div>
      <div>
        <label for="team-manage-key" class="block text-xs font-medium text-gray-600 mb-1">Team Key</label>
        <input
          id="team-manage-key"
          :value="props.teamKeyDraft"
          type="text"
          name="teamKey"
          autocomplete="off"
          class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
          @input="onTeamKeyInput"
        >
      </div>
      <div class="md:col-span-2">
        <label for="team-manage-description" class="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea
          id="team-manage-description"
          :value="props.teamDescriptionDraft"
          rows="3"
          name="teamDescription"
          class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
          @input="onTeamDescriptionInput"
        />
      </div>
      <div class="md:col-span-2">
        <button
          type="button"
          class="inline-flex items-center rounded-lg bg-[#4857FE] px-3 py-2 text-sm font-medium text-white hover:bg-[#3d4ae0] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/30"
          :disabled="props.loading"
          @click="emit('save-team')"
        >
          {{ props.loading ? 'Saving…' : 'Save Team Details' }}
        </button>
      </div>
    </div>
  </section>
</template>
