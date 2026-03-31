<script setup lang="ts">
import { Building2, Loader2, Plus, Trash2 } from 'lucide-vue-next'
import TeamDetailPane from '@/components/teams/TeamDetailPane.vue'
import TeamListPane from '@/components/teams/TeamListPane.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTeamsViewModel } from '@/composables/useTeamsViewModel'

const {
  loading,
  error,
  teamMutationLoading,
  teamMutationError,
  teams,
  filteredTeams,
  selectedTeamId,
  selectedTeam,
  selectedTeamMembersLoading,
  selectedTeamMemberRows,
  selectedTeamMemberCount,
  selectedTeamLeadNames,
  selectedTeamLeadCount,
  selectedTeamAccessHint,
  canCreateTeams,
  createTeamDisabledReason,
  canManageSelectedTeam,
  canDeleteSelectedTeam,
  showCreateTeamDialog,
  createTeamName,
  createTeamKey,
  createTeamDescription,
  teamNameDraft,
  teamKeyDraft,
  teamDescriptionDraft,
  memberToAddUserId,
  memberToAddRole,
  availableMembersForSelection,
  teamSearchQuery,
  isManageMode,
  openCreateTeamDialogPanel,
  closeCreateTeamDialogPanel,
  showDangerDialog,
  dangerDialogTitle,
  dangerDialogDescription,
  dangerDialogConfirmLabel,
  setSelectedTeam,
  enterManageMode,
  exitManageMode,
  createTeam,
  saveSelectedTeamDetails,
  addMemberToSelectedTeam,
  updateSelectedTeamMemberRole,
  requestRemoveMember,
  requestDeleteSelectedTeam,
  confirmDangerAction,
  cancelDangerAction,
  teamLeadCount,
} = useTeamsViewModel()
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <header class="bg-white border-b border-gray-100 px-8 py-5">
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <Building2 :size="18" class="text-[#4857FE]" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-gray-900">Organization Teams</h1>
            <p class="text-sm text-gray-400 mt-0.5">View teams by default, then enter manage mode only when needed.</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <Loader2 v-if="loading" :size="12" class="animate-spin text-[#4857FE]" />
            {{ teams.length }} teams
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/30"
            :class="canCreateTeams
              ? 'bg-[#4857FE] hover:bg-[#3E4BDE] text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
            :disabled="!canCreateTeams || teamMutationLoading"
            :title="createTeamDisabledReason"
            @click="openCreateTeamDialogPanel"
          >
            <Plus :size="15" />
            Create Team
          </button>
        </div>
      </div>
    </header>

    <div class="flex-1 min-h-0 px-8 py-6">
      <div
        v-if="error"
        role="alert"
        aria-live="polite"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ error }}
      </div>

      <div class="h-full grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5">
        <TeamListPane
          :teams="filteredTeams"
          :selected-team-id="selectedTeamId"
          :loading="loading"
          :search-query="teamSearchQuery"
          :team-lead-count="teamLeadCount"
          @update:search-query="teamSearchQuery = $event"
          @select-team="setSelectedTeam($event)"
        />

        <TeamDetailPane
          :team="selectedTeam"
          :team-lead-names="selectedTeamLeadNames"
          :team-lead-count="selectedTeamLeadCount"
          :team-member-count="selectedTeamMemberCount"
          :team-access-hint="selectedTeamAccessHint"
          :team-mutation-loading="teamMutationLoading"
          :team-mutation-error="teamMutationError"
          :can-manage-selected-team="canManageSelectedTeam"
          :can-delete-selected-team="canDeleteSelectedTeam"
          :is-manage-mode="isManageMode"
          :members-loading="selectedTeamMembersLoading"
          :team-name-draft="teamNameDraft"
          :team-key-draft="teamKeyDraft"
          :team-description-draft="teamDescriptionDraft"
          :member-rows="selectedTeamMemberRows"
          :available-members="availableMembersForSelection"
          :member-to-add-user-id="memberToAddUserId"
          :member-to-add-role="memberToAddRole"
          @enter-manage-mode="enterManageMode"
          @exit-manage-mode="exitManageMode"
          @request-delete-team="requestDeleteSelectedTeam"
          @save-team="saveSelectedTeamDetails"
          @update:team-name-draft="teamNameDraft = $event"
          @update:team-key-draft="teamKeyDraft = $event"
          @update:team-description-draft="teamDescriptionDraft = $event"
          @update:member-to-add-user-id="memberToAddUserId = $event"
          @update:member-to-add-role="memberToAddRole = $event"
          @add-member="addMemberToSelectedTeam"
          @change-member-role="updateSelectedTeamMemberRole"
          @request-remove-member="requestRemoveMember"
        />
      </div>
    </div>

    <Dialog v-model:open="showCreateTeamDialog">
      <DialogContent class="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create Team</DialogTitle>
          <DialogDescription>Create a reusable organization team with clear lead ownership.</DialogDescription>
        </DialogHeader>

        <div class="space-y-3">
          <div>
            <label for="create-team-name" class="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
            <input
              id="create-team-name"
              v-model="createTeamName"
              type="text"
              name="createTeamName"
              autocomplete="off"
              class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
            >
          </div>

          <div>
            <label for="create-team-key" class="block text-xs font-medium text-gray-600 mb-1">Team Key (Optional)</label>
            <input
              id="create-team-key"
              v-model="createTeamKey"
              type="text"
              name="createTeamKey"
              autocomplete="off"
              class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
            >
          </div>

          <div>
            <label for="create-team-description" class="block text-xs font-medium text-gray-600 mb-1">Description (Optional)</label>
            <textarea
              id="create-team-description"
              v-model="createTeamDescription"
              rows="3"
              name="createTeamDescription"
              class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
            />
          </div>

          <div
            v-if="teamMutationError"
            role="alert"
            aria-live="polite"
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {{ teamMutationError }}
          </div>
        </div>

        <DialogFooter class="gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
            :disabled="teamMutationLoading"
            @click="closeCreateTeamDialogPanel"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-[#4857FE] px-3 py-2 text-sm font-medium text-white hover:bg-[#3d4ae0] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/30"
            :disabled="teamMutationLoading || createTeamName.trim().length < 2"
            @click="createTeam"
          >
            <Plus :size="13" />
            {{ teamMutationLoading ? 'Creating…' : 'Create Team' }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showDangerDialog">
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{{ dangerDialogTitle }}</DialogTitle>
          <DialogDescription>{{ dangerDialogDescription }}</DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
            :disabled="teamMutationLoading"
            @click="cancelDangerAction"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
            :disabled="teamMutationLoading"
            @click="confirmDangerAction"
          >
            <Trash2 :size="13" aria-hidden="true" />
            {{ dangerDialogConfirmLabel }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
