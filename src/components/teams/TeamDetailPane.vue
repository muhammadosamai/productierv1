<script setup lang="ts">
import { Check, PencilLine, ShieldAlert, Trash2, UserCheck, Users } from 'lucide-vue-next'
import type { ApiOrganizationTeam, ApiProductMember } from '@/lib/apiClient'
import type { TeamMemberRole, TeamMemberRow } from '@/composables/useTeamsViewModel'
import TeamManagePanel from '@/components/teams/TeamManagePanel.vue'
import TeamMembersEditor from '@/components/teams/TeamMembersEditor.vue'

const props = defineProps<{
  team: ApiOrganizationTeam | null
  teamLeadNames: string
  teamLeadCount: number
  teamMemberCount: number
  teamAccessHint: string
  teamMutationLoading: boolean
  teamMutationError: string | null
  canManageSelectedTeam: boolean
  canDeleteSelectedTeam: boolean
  isManageMode: boolean
  membersLoading: boolean
  teamNameDraft: string
  teamKeyDraft: string
  teamDescriptionDraft: string
  memberRows: TeamMemberRow[]
  availableMembers: ApiProductMember[]
  memberToAddUserId: string
  memberToAddRole: TeamMemberRole
}>()

const emit = defineEmits<{
  (event: 'enter-manage-mode'): void
  (event: 'exit-manage-mode'): void
  (event: 'request-delete-team'): void
  (event: 'save-team'): void
  (event: 'update:teamNameDraft', value: string): void
  (event: 'update:teamKeyDraft', value: string): void
  (event: 'update:teamDescriptionDraft', value: string): void
  (event: 'update:memberToAddUserId', value: string): void
  (event: 'update:memberToAddRole', value: TeamMemberRole): void
  (event: 'add-member'): void
  (event: 'change-member-role', payload: { userId: string; role: TeamMemberRole }): void
  (event: 'request-remove-member', userId: string): void
}>()
</script>

<template>
  <section class="min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
    <div v-if="!props.team" class="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6">
      <div class="w-12 h-12 rounded-xl bg-[#4857FE]/10 flex items-center justify-center mb-3">
        <Users :size="20" class="text-[#4857FE]" />
      </div>
      <p class="text-sm font-medium text-gray-700">Select a Team</p>
      <p class="mt-1 text-xs text-gray-500">Pick a team from the left to view members and leads.</p>
    </div>

    <template v-else>
      <div class="border-b border-gray-100 px-5 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-gray-900 truncate">{{ props.team.name }}</h2>
            <div class="mt-1 flex items-center gap-2">
              <span class="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium uppercase tracking-wide">
                {{ props.team.key }}
              </span>
              <span class="text-xs text-gray-400">Organization Team</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="props.canManageSelectedTeam && !props.isManageMode"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-[#4857FE]/30 px-2.5 py-1.5 text-xs font-medium text-[#4857FE] hover:bg-[#4857FE]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20"
              @click="emit('enter-manage-mode')"
            >
              <PencilLine :size="12" />
              Manage
            </button>

            <button
              v-if="props.canManageSelectedTeam && props.isManageMode"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
              @click="emit('exit-manage-mode')"
            >
              <Check :size="12" />
              Done
            </button>

            <button
              v-if="props.canDeleteSelectedTeam && props.isManageMode"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              :disabled="props.teamMutationLoading"
              @click="emit('request-delete-team')"
            >
              <Trash2 :size="12" />
              Delete
            </button>
          </div>
        </div>

        <p v-if="props.teamAccessHint" class="mt-2 text-xs text-gray-500 flex items-start gap-1.5">
          <ShieldAlert :size="12" class="mt-0.5 shrink-0" />
          {{ props.teamAccessHint }}
        </p>

        <div
          v-if="props.teamMutationError"
          role="alert"
          aria-live="polite"
          class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {{ props.teamMutationError }}
        </div>
      </div>

      <div class="border-b border-gray-100 px-5 py-4 bg-gray-50/50">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
            <p class="text-xs text-gray-500 flex items-center gap-1.5">
              <UserCheck :size="12" />
              Team Leads
            </p>
            <p class="text-sm font-medium text-gray-900 mt-1 break-words">{{ props.teamLeadNames }}</p>
            <p class="text-[11px] text-gray-500 mt-1">{{ props.teamLeadCount }} total</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
            <p class="text-xs text-gray-500 flex items-center gap-1.5">
              <Users :size="12" />
              Team Members
            </p>
            <p class="text-sm font-medium text-gray-900 mt-1">{{ props.teamMemberCount }}</p>
          </div>
        </div>

        <p v-if="props.team.description" class="mt-3 text-sm text-gray-600 break-words">
          {{ props.team.description }}
        </p>
        <p v-else class="mt-3 text-sm text-gray-400">No team description yet.</p>
      </div>

      <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        <TeamManagePanel
          v-if="props.isManageMode && props.canManageSelectedTeam"
          :team-name-draft="props.teamNameDraft"
          :team-key-draft="props.teamKeyDraft"
          :team-description-draft="props.teamDescriptionDraft"
          :loading="props.teamMutationLoading"
          @update:team-name-draft="emit('update:teamNameDraft', $event)"
          @update:team-key-draft="emit('update:teamKeyDraft', $event)"
          @update:team-description-draft="emit('update:teamDescriptionDraft', $event)"
          @save-team="emit('save-team')"
          @cancel="emit('exit-manage-mode')"
        />

        <TeamMembersEditor
          :members="props.memberRows"
          :available-members="props.availableMembers"
          :member-to-add-user-id="props.memberToAddUserId"
          :member-to-add-role="props.memberToAddRole"
          :editable="props.isManageMode && props.canManageSelectedTeam"
          :loading="props.teamMutationLoading"
          :members-loading="props.membersLoading"
          @update:member-to-add-user-id="emit('update:memberToAddUserId', $event)"
          @update:member-to-add-role="emit('update:memberToAddRole', $event)"
          @add-member="emit('add-member')"
          @change-member-role="emit('change-member-role', $event)"
          @request-remove-member="emit('request-remove-member', $event)"
        />
      </div>
    </template>
  </section>
</template>
