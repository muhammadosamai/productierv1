<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useServersStore } from '@/stores/servers'
import { useProductStore } from '@/stores/products'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Plus, Server, Loader2 } from 'lucide-vue-next'
import type { Environment } from '@/types/release'

const props = defineProps<{
  environment: Environment
  existingServerIds: string[]
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  selected: [serverIds: string[]]
}>()

const serversStore = useServersStore()
const productStore = useProductStore()

const selectedIds = ref<string[]>([])
const showAddForm = ref(false)

// Add new server form
const newServerName = ref('')
const newServerHost = ref('')
const newServerPort = ref<number | null>(null)
const newServerProtocol = ref('https')
const newServerRegion = ref('')
const newServerProvider = ref('')
const addingServer = ref(false)

const availableServers = computed(() =>
  serversStore.servers.filter(s =>
    s.environment === props.environment &&
    !props.existingServerIds.includes(s.id)
  )
)

watch(open, (val) => {
  if (val) {
    serversStore.fetchServers(props.environment)
    selectedIds.value = []
    showAddForm.value = false
  }
})

function toggleServer(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

async function addNewServer() {
  if (!newServerName.value.trim() || addingServer.value) return
  addingServer.value = true
  try {
    const result = await serversStore.createServer({
      name: newServerName.value.trim(),
      environment: props.environment,
      host: newServerHost.value || null,
      port: newServerPort.value,
      protocol: newServerProtocol.value || null,
      region: newServerRegion.value || null,
      provider: newServerProvider.value || null,
      productId: productStore.activeProduct.name,
    })
    if (result) {
      selectedIds.value.push(result.id)
      newServerName.value = ''
      newServerHost.value = ''
      newServerPort.value = null
      newServerRegion.value = ''
      newServerProvider.value = ''
      showAddForm.value = false
    }
  } finally {
    addingServer.value = false
  }
}

function confirm() {
  if (selectedIds.value.length > 0) {
    emit('selected', selectedIds.value)
  }
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[480px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add Servers — {{ environment.toUpperCase() }}</DialogTitle>
        <DialogDescription>Select servers to deploy to or create a new one.</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 mt-2">
        <!-- Available Servers -->
        <div class="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
          <div v-if="availableServers.length === 0 && !showAddForm" class="px-3 py-6 text-sm text-gray-400 text-center">
            No servers available for {{ environment }}
          </div>
          <div
            v-for="server in availableServers"
            :key="server.id"
            @click="toggleServer(server.id)"
            class="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
          >
            <div
              class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
              :class="selectedIds.includes(server.id)
                ? 'bg-[#4857FE] border-[#4857FE]'
                : 'border-gray-300'"
            >
              <Check v-if="selectedIds.includes(server.id)" :size="10" class="text-white" />
            </div>
            <Server :size="14" class="text-gray-400" />
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-gray-700">{{ server.name }}</span>
              <span v-if="server.host" class="text-xs text-gray-400 ml-2">{{ server.host }}{{ server.port ? `:${server.port}` : '' }}</span>
            </div>
            <span v-if="server.region" class="text-[10px] text-gray-400">{{ server.region }}</span>
          </div>
        </div>

        <!-- Add New Server Toggle -->
        <button
          type="button"
          @click="showAddForm = !showAddForm"
          class="flex items-center gap-2 text-sm text-[#4857FE] hover:text-[#3a47e0] font-medium"
        >
          <Plus :size="14" />
          Add New Server
        </button>

        <!-- Add New Server Form -->
        <div v-if="showAddForm" class="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-gray-600">Name *</label>
            <Input v-model="newServerName" placeholder="e.g. web-server-01" class="text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-gray-600">Host</label>
              <Input v-model="newServerHost" placeholder="e.g. 10.0.0.1" class="text-sm" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-gray-600">Port</label>
              <Input v-model.number="newServerPort" type="number" placeholder="443" class="text-sm" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-gray-600">Region</label>
              <Input v-model="newServerRegion" placeholder="e.g. us-east-1" class="text-sm" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-gray-600">Provider</label>
              <Input v-model="newServerProvider" placeholder="e.g. AWS" class="text-sm" />
            </div>
          </div>
          <Button @click="addNewServer" :disabled="!newServerName.trim() || addingServer" size="sm" class="w-full">
            <Loader2 v-if="addingServer" :size="14" class="animate-spin mr-2" />
            Create Server
          </Button>
        </div>
      </div>

      <DialogFooter class="pt-2">
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button @click="confirm" :disabled="selectedIds.length === 0">
          Add {{ selectedIds.length }} Server{{ selectedIds.length !== 1 ? 's' : '' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
