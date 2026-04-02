<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
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
import { Loader2, Mail, UserCheck, UserPlus, Check } from 'lucide-vue-next'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  invited: []
}>()

const productStore = useProductStore()
const authStore = useAuthStore()

const email = ref('')
const role = ref('member')
const submitting = ref(false)
const error = ref('')
const successMessage = ref('')

// Check if email matches an existing user
const matchedUser = ref<{ id: string; name: string; email: string; avatar: string | null } | null>(null)
const checking = ref(false)
let checkTimeout: ReturnType<typeof setTimeout> | null = null

function onEmailInput() {
  matchedUser.value = null
  error.value = ''
  successMessage.value = ''

  if (checkTimeout) clearTimeout(checkTimeout)
  const val = email.value.trim()
  if (!val || !val.includes('@')) return

  checkTimeout = setTimeout(async () => {
    checking.value = true
    try {
      const res = await fetch(`/api/auth/users?q=${encodeURIComponent(val)}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      })
      if (res.ok) {
        const users: any[] = await res.json()
        const exact = users.find((u: any) => u.email.toLowerCase() === val.toLowerCase())
        matchedUser.value = exact || null
      }
    } catch {
      // ignore
    } finally {
      checking.value = false
    }
  }, 300)
}

const roles = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'product_manager', label: 'Product Manager' },
  { value: 'business_analyst', label: 'Business Analyst' },
  { value: 'developer', label: 'Developer' },
  { value: 'viewer', label: 'Viewer' },
]

watch(open, (val) => {
  if (!val) {
    email.value = ''
    role.value = 'member'
    matchedUser.value = null
    error.value = ''
    successMessage.value = ''
  }
})

const canSubmit = computed(() => {
  const val = email.value.trim()
  return val.includes('@') && val.includes('.') && !submitting.value
})

async function handleSubmit() {
  if (!canSubmit.value) return
  if (!productStore.activeProduct) return

  error.value = ''
  successMessage.value = ''
  submitting.value = true

  try {
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({
        product: productStore.activeProductName,
        email: email.value.trim(),
        role: role.value,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      error.value = data.error || 'Failed to send invite'
      return
    }

    if (data.type === 'added') {
      successMessage.value = `${data.user.name} has been added to the product`
    } else {
      successMessage.value = `Invite sent to ${data.invite.email}`
    }

    emit('invited')

    // Auto-close after brief success display
    setTimeout(() => {
      open.value = false
    }, 1500)
  } catch {
    error.value = 'Network error. Please try again.'
  } finally {
    submitting.value = false
  }
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle>Invite Member</DialogTitle>
        <DialogDescription>
          Invite someone to <span class="font-medium text-gray-700">{{ productStore.activeProduct?.name }}</span>
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Success message -->
        <div
          v-if="successMessage"
          class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
        >
          <Check :size="16" class="text-green-500" />
          <p class="text-sm text-green-700 font-medium">{{ successMessage }}</p>
        </div>

        <!-- Error -->
        <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p class="text-sm text-red-600">{{ error }}</p>
        </div>

        <!-- Email -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Email address</label>
          <div class="relative">
            <Mail :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              v-model="email"
              type="email"
              placeholder="name@example.com"
              class="pl-9"
              autofocus
              @input="onEmailInput"
            />
          </div>

          <!-- Matched user indicator -->
          <div v-if="checking" class="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 :size="12" class="animate-spin" />
            Checking...
          </div>
          <div
            v-else-if="matchedUser"
            class="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2"
          >
            <UserCheck :size="14" class="text-blue-500" />
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-5 h-5 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-medium overflow-hidden shrink-0">
                <img
                  v-if="matchedUser.avatar"
                  :src="matchedUser.avatar"
                  class="w-5 h-5 rounded-full object-cover"
                  :alt="matchedUser.name"
                />
                <span v-else>{{ getInitials(matchedUser.name) }}</span>
              </div>
              <span class="text-sm text-blue-700 font-medium truncate">{{ matchedUser.name }}</span>
              <span class="text-xs text-blue-500">Existing user — will be added directly</span>
            </div>
          </div>
          <div
            v-else-if="email.trim() && email.includes('@') && !checking"
            class="flex items-center gap-2 text-xs text-gray-500"
          >
            <UserPlus :size="12" class="text-gray-400" />
            New user — will receive an invite to sign up
          </div>
        </div>

        <!-- Role -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Role in product</label>
          <Select v-model="role">
            <SelectTrigger>
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="r in roles" :key="r.value" :value="r.value">
                {{ r.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button
            type="submit"
            :disabled="!canSubmit"
            class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          >
            <Loader2 v-if="submitting" :size="14" class="animate-spin mr-1.5" />
            {{ submitting ? 'Inviting...' : matchedUser ? 'Add Member' : 'Send Invite' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
