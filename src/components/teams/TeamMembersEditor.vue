<script setup lang="ts">
import { Loader2, Trash2, UserPlus, Users } from 'lucide-vue-next'
import type { ApiProductMember } from '@/lib/apiClient'
import type { TeamMemberRole, TeamMemberRow } from '@/composables/useTeamsViewModel'

const props = defineProps<{
  members: TeamMemberRow[]
  availableMembers: ApiProductMember[]
  memberToAddUserId: string
  memberToAddRole: TeamMemberRole
  editable: boolean
  loading: boolean
  membersLoading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:memberToAddUserId', value: string): void
  (event: 'update:memberToAddRole', value: TeamMemberRole): void
  (event: 'add-member'): void
  (event: 'change-member-role', payload: { userId: string; role: TeamMemberRole }): void
  (event: 'request-remove-member', userId: string): void
}>()

function onMemberSelectionInput(event: Event) {
  const target = event.target as HTMLSelectElement | null
  emit('update:memberToAddUserId', target?.value || '')
}

function onMemberRoleInput(event: Event) {
  const target = event.target as HTMLSelectElement | null
  emit('update:memberToAddRole', target?.value === 'lead' ? 'lead' : 'member')
}

function onRowRoleChange(userId: string, event: Event) {
  const target = event.target as HTMLSelectElement | null
  const role = target?.value === 'lead' ? 'lead' : 'member'
  emit('change-member-role', { userId, role })
}
</script>

<template>
  <section class="rounded-xl border border-gray-200 bg-white overflow-hidden">
    <div class="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
      <div>
        <h3 class="text-sm font-semibold text-gray-800">Members</h3>
        <p class="text-xs text-gray-500 mt-0.5">{{ props.members.length }} in team</p>
      </div>
      <Users :size="14" class="text-gray-400" />
    </div>

    <div v-if="props.editable" class="border-b border-gray-100 px-4 py-3 bg-gray-50/70">
      <p class="text-xs text-gray-600 flex items-center gap-1.5">
        <UserPlus :size="12" />
        Add Member
      </p>
      <div class="mt-2 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_auto] gap-2">
        <div>
          <label for="team-member-select" class="sr-only">Member</label>
          <select
            id="team-member-select"
            :value="props.memberToAddUserId"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
            :disabled="props.loading"
            @change="onMemberSelectionInput"
          >
            <option value="">Select member</option>
            <option
              v-for="member in props.availableMembers"
              :key="member.userId"
              :value="member.userId"
            >
              {{ member.userName }} ({{ member.userEmail }})
            </option>
          </select>
        </div>
        <div>
          <label for="team-member-role-select" class="sr-only">Role</label>
          <select
            id="team-member-role-select"
            :value="props.memberToAddRole"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
            :disabled="props.loading"
            @change="onMemberRoleInput"
          >
            <option value="member">Member</option>
            <option value="lead">Lead</option>
          </select>
        </div>
        <button
          type="button"
          class="rounded-lg bg-[#4857FE] px-3 py-2 text-sm font-medium text-white hover:bg-[#3d4ae0] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/30"
          :disabled="props.loading || !props.memberToAddUserId"
          @click="emit('add-member')"
        >
          {{ props.loading ? 'Saving…' : 'Add Member' }}
        </button>
      </div>
      <p v-if="props.availableMembers.length === 0" class="mt-2 text-xs text-gray-500">
        All product members are already assigned to this team.
      </p>
    </div>

    <div class="max-h-[430px] overflow-auto p-3">
      <div v-if="props.membersLoading" class="flex items-center justify-center py-8 text-sm text-gray-500 gap-2">
        <Loader2 :size="15" class="animate-spin" />
        Loading team members…
      </div>

      <p v-else-if="props.members.length === 0" class="px-2 py-6 text-center text-sm text-gray-500">
        No members assigned to this team yet.
      </p>

      <div v-else class="space-y-2">
        <div
          v-for="member in props.members"
          :key="member.userId"
          class="rounded-lg border border-gray-200 px-3 py-2.5 flex items-center justify-between gap-3"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ member.userName }}</p>
            <p class="text-xs text-gray-500 truncate">{{ member.userEmail }}</p>
          </div>

          <div v-if="props.editable" class="flex items-center gap-2">
            <label :for="`team-member-role-${member.userId}`" class="sr-only">Role for {{ member.userName }}</label>
            <select
              :id="`team-member-role-${member.userId}`"
              :value="member.role"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE]/20 focus-visible:border-[#4857FE]"
              :disabled="props.loading"
              @change="onRowRoleChange(member.userId, $event)"
            >
              <option value="member">Member</option>
              <option value="lead">Lead</option>
            </select>
            <button
              type="button"
              class="rounded-md p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              :disabled="props.loading"
              :aria-label="`Remove ${member.userName} from team`"
              @click="emit('request-remove-member', member.userId)"
            >
              <Trash2 :size="14" aria-hidden="true" />
            </button>
          </div>

          <span
            v-else
            class="text-[11px] px-2 py-0.5 rounded-full font-medium"
            :class="member.role === 'lead' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-700'"
          >
            {{ member.role === 'lead' ? 'Lead' : 'Member' }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
