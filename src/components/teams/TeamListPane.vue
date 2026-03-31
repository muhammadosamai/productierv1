<script setup lang="ts">
import { Loader2, Search, Users } from 'lucide-vue-next'
import type { ApiOrganizationTeam } from '@/lib/apiClient'

const props = defineProps<{
  teams: ApiOrganizationTeam[]
  selectedTeamId: string | null
  loading: boolean
  searchQuery: string
  teamLeadCount: (team: ApiOrganizationTeam) => number
}>()

const emit = defineEmits<{
  (event: 'select-team', teamId: string): void
  (event: 'update:searchQuery', value: string): void
}>()

function onSearchInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:searchQuery', target?.value || '')
}
</script>

<template>
  <aside class="min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
    <div class="border-b border-gray-100 px-4 py-3">
      <h2 class="text-sm font-semibold text-gray-700">Teams</h2>
      <div class="mt-2 relative">
        <label class="sr-only" for="teams-search-input">Search teams</label>
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          id="teams-search-input"
          :value="props.searchQuery"
          type="text"
          placeholder="Search teams…"
          autocomplete="off"
          name="teams-search"
          class="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
          @input="onSearchInput"
        >
      </div>
    </div>

    <div
      v-if="props.loading && props.teams.length === 0"
      class="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-500 gap-2"
    >
      <Loader2 :size="15" class="animate-spin" />
      Loading teams…
    </div>

    <div
      v-else-if="props.teams.length === 0"
      class="flex-1 min-h-0 p-6 flex flex-col items-center justify-center text-center"
    >
      <div class="w-10 h-10 rounded-lg bg-[#4857FE]/10 flex items-center justify-center mb-3">
        <Users :size="16" class="text-[#4857FE]" />
      </div>
      <p class="text-sm font-medium text-gray-700">No Teams Yet</p>
      <p class="mt-1 text-xs text-gray-500">Create your first team to organize members and leads.</p>
    </div>

    <div
      v-else
      class="flex-1 min-h-0 overflow-auto px-2 py-2"
      role="listbox"
      aria-label="Organization teams"
    >
      <button
        v-for="team in props.teams"
        :key="team.id"
        type="button"
        role="option"
        :aria-selected="props.selectedTeamId === team.id"
        class="w-full text-left rounded-lg border px-3 py-2.5 mb-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20"
        :class="props.selectedTeamId === team.id
          ? 'border-[#4857FE]/40 bg-[#4857FE]/5'
          : 'border-gray-200 bg-white hover:border-gray-300'"
        @click="emit('select-team', team.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-gray-900 truncate">{{ team.name }}</p>
          <span class="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium uppercase tracking-wide">
            {{ team.key }}
          </span>
        </div>
        <p class="mt-1 text-xs text-gray-500">
          {{ props.teamLeadCount(team) }} {{ props.teamLeadCount(team) === 1 ? 'lead' : 'leads' }}
        </p>
      </button>
    </div>
  </aside>
</template>
