<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Server, Plus, ChevronDown, ChevronRight, Trash2, Circle,
  CheckCircle2, Loader2, AlertTriangle, RotateCcw,
} from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ReleaseDeployment, DeploymentTarget, TargetStatus, DeploymentStatus } from '@/types/release'

const props = defineProps<{
  deployment: ReleaseDeployment
  releaseId: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  addServer: [deploymentId: string, environment: string]
  updateTarget: [deploymentId: string, targetId: string, status: TargetStatus]
  removeTarget: [deploymentId: string, targetId: string]
  updateDeployment: [deploymentId: string, payload: { status?: string; notes?: string | null }]
}>()

const expanded = ref(true)

const targets = computed(() => props.deployment.deploymentTargets || [])
const existingServerIds = computed(() => targets.value.map(t => t.serverId))

function envLabel(env: string) {
  switch (env) {
    case 'dev': return 'Development'
    case 'stage': return 'Staging'
    case 'prod': return 'Production'
    default: return env
  }
}

function envColor(env: string) {
  switch (env) {
    case 'dev': return 'border-blue-200 bg-blue-50/30'
    case 'stage': return 'border-orange-200 bg-orange-50/30'
    case 'prod': return 'border-red-200 bg-red-50/30'
    default: return 'border-gray-200 bg-gray-50/30'
  }
}

function envAccent(env: string) {
  switch (env) {
    case 'dev': return 'bg-blue-500'
    case 'stage': return 'bg-orange-500'
    case 'prod': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

function statusBadgeStyle(status: string) {
  switch (status) {
    case 'deployed': return 'bg-green-50 text-green-600 border-green-200'
    case 'deploying': return 'bg-orange-50 text-orange-600 border-orange-200'
    case 'failed': return 'bg-red-50 text-red-600 border-red-200'
    case 'rolled_back': return 'bg-purple-50 text-purple-600 border-purple-200'
    case 'pending': return 'bg-gray-50 text-gray-500 border-gray-200'
    default: return 'bg-gray-50 text-gray-500 border-gray-200'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'deployed': return CheckCircle2
    case 'deploying': return Loader2
    case 'failed': return AlertTriangle
    case 'rolled_back': return RotateCcw
    default: return Circle
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function targetStatusColor(status: string) {
  switch (status) {
    case 'deployed': return 'text-green-500'
    case 'deploying': return 'text-orange-500'
    case 'failed': return 'text-red-500'
    default: return 'text-gray-400'
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function onTargetStatusChange(targetId: string, newStatus: string) {
  emit('updateTarget', props.deployment.id, targetId, newStatus as TargetStatus)
}
</script>

<template>
  <div class="rounded-xl border overflow-hidden" :class="envColor(deployment.environment)">
    <!-- Header -->
    <div class="px-4 py-3 flex items-center justify-between cursor-pointer" @click="expanded = !expanded">
      <div class="flex items-center gap-3">
        <div class="w-1 h-8 rounded-full" :class="envAccent(deployment.environment)"></div>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-gray-900">{{ envLabel(deployment.environment) }}</span>
            <span
              class="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border"
              :class="statusBadgeStyle(deployment.status)"
            >
              <component :is="statusIcon(deployment.status)" :size="10" :class="{ 'animate-spin': deployment.status === 'deploying' }" />
              {{ statusLabel(deployment.status) }}
            </span>
          </div>
          <span class="text-xs text-gray-400">{{ targets.length }} server{{ targets.length !== 1 ? 's' : '' }}</span>
        </div>
      </div>
      <component :is="expanded ? ChevronDown : ChevronRight" :size="16" class="text-gray-400" />
    </div>

    <!-- Body -->
    <div v-if="expanded" class="px-4 pb-4">
      <!-- Targets Table -->
      <div v-if="targets.length > 0" class="bg-white rounded-lg border border-gray-200/60 overflow-hidden mb-3">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-left px-3 py-2 text-[10px] font-medium text-gray-500 uppercase">Server</th>
              <th class="text-left px-3 py-2 text-[10px] font-medium text-gray-500 uppercase">Host</th>
              <th class="text-left px-3 py-2 text-[10px] font-medium text-gray-500 uppercase">Status</th>
              <th class="text-left px-3 py-2 text-[10px] font-medium text-gray-500 uppercase">Deployed</th>
              <th class="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="target in targets"
              :key="target.id"
              class="border-b border-gray-50 last:border-b-0"
            >
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <Server :size="13" class="text-gray-400" />
                  <span class="text-sm font-medium text-gray-700">{{ target.server?.name || '—' }}</span>
                </div>
              </td>
              <td class="px-3 py-2.5">
                <span class="text-xs text-gray-500 font-mono">
                  {{ target.server?.host || '—' }}{{ target.server?.port ? `:${target.server.port}` : '' }}
                </span>
              </td>
              <td class="px-3 py-2.5">
                <select
                  :value="target.status"
                  @change="onTargetStatusChange(target.id, ($event.target as HTMLSelectElement).value)"
                  class="text-xs font-medium px-2 py-1 rounded-md border border-gray-200 outline-none focus:border-[#4857FE] cursor-pointer"
                  :class="targetStatusColor(target.status)"
                  :disabled="props.readonly"
                >
                  <option value="pending">Pending</option>
                  <option value="deploying">Deploying</option>
                  <option value="deployed">Deployed</option>
                  <option value="failed">Failed</option>
                </select>
              </td>
              <td class="px-3 py-2.5">
                <span class="text-xs text-gray-500">{{ formatDate(target.deployedAt) }}</span>
              </td>
              <td class="px-3 py-2.5">
                <button
                  @click="emit('removeTarget', deployment.id, target.id)"
                  class="transition-colors"
                  :class="props.readonly ? 'text-gray-200 cursor-not-allowed' : 'text-gray-300 hover:text-red-500'"
                  :disabled="props.readonly"
                >
                  <Trash2 :size="13" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="bg-white rounded-lg border border-gray-200/60 p-4 mb-3 text-center">
        <Server :size="20" class="text-gray-300 mx-auto mb-1" />
        <p class="text-xs text-gray-400">No servers assigned</p>
      </div>

      <!-- Add Server Button -->
      <button
        @click="emit('addServer', deployment.id, deployment.environment)"
        class="flex items-center gap-1.5 text-xs font-medium transition-colors"
        :class="props.readonly ? 'text-gray-300 cursor-not-allowed' : 'text-[#4857FE] hover:text-[#3a47e0]'"
        :disabled="props.readonly"
      >
        <Plus :size="13" />
        Add Server
      </button>
    </div>
  </div>
</template>
