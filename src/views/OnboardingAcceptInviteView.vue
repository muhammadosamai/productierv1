<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-vue-next'
import AuthShell from '@/components/auth/AuthShell.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { onboardingApi } from '@/lib/apiClient'
import { useOnboardingStore } from '@/stores/onboarding'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const onboardingStore = useOnboardingStore()

const loading = ref(true)
const success = ref(false)
const activating = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const activationName = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const postAcceptCompleted = ref<boolean | null>(null)

const inviteToken = computed(() => {
  const raw = route.query.token
  return typeof raw === 'string' ? raw.trim() : ''
})

const isActivationMode = computed(() => !authStore.isAuthenticated)
const canSubmitActivation = computed(() => {
  return activating.value !== true
    && !!password.value.trim()
    && !!confirmPassword.value.trim()
})

async function acceptInviteForAuthenticatedUser() {
  if (!inviteToken.value) {
    loading.value = false
    success.value = false
    errorMessage.value = 'Invalid invite link.'
    return
  }

  const accepted = await onboardingStore.acceptInvite(inviteToken.value)
  loading.value = false
  success.value = accepted
  postAcceptCompleted.value = onboardingStore.isOnboardingComplete
  if (!accepted) {
    errorMessage.value = onboardingStore.error || 'Could not accept invite.'
    return
  }
  successMessage.value = 'Invite accepted. Your organization access is now active.'
}

async function activateInvite() {
  errorMessage.value = null
  successMessage.value = null
  if (!inviteToken.value) {
    errorMessage.value = 'Invalid invite link.'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  activating.value = true
  try {
    const payload = await onboardingApi.activateInvite({
      token: inviteToken.value,
      password: password.value,
      name: activationName.value.trim() || null,
    })
    authStore.applyAuthSession({ token: payload.token, user: payload.user })
    postAcceptCompleted.value = payload.onboarding.isCompleted
    await onboardingStore.fetchState({ silent: true })
    success.value = true
    successMessage.value = 'Account activated and invite accepted. You can continue to your workspace now.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not activate invite.'
  } finally {
    activating.value = false
  }
}

function continueAfterAccept() {
  const isCompleted = onboardingStore.isOnboardingComplete || postAcceptCompleted.value === true
  if (isCompleted) {
    router.push('/home')
    return
  }
  router.push('/onboarding')
}

onMounted(async () => {
  if (!inviteToken.value) {
    loading.value = false
    errorMessage.value = 'Invalid invite link.'
    return
  }

  if (authStore.isAuthenticated) {
    await acceptInviteForAuthenticatedUser()
    return
  }

  loading.value = false
})
</script>

<template>
  <AuthShell
    title="Join Organization"
    subtitle="Use your invite link to activate access and set your password."
  >
    <div v-if="loading" class="flex min-h-[180px] items-center justify-center">
      <Loader2 :size="20" class="animate-spin text-primary" />
    </div>

    <form
      v-else-if="isActivationMode && !success"
      class="space-y-4 rounded-xl border border-border bg-background p-5"
      @submit.prevent="activateInvite"
    >
      <p class="text-sm text-muted-foreground">
        Set your password to activate this invite. Your account will be linked to the invited email.
      </p>

      <p
        v-if="errorMessage"
        role="alert"
        aria-live="polite"
        class="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {{ errorMessage }}
      </p>

      <div class="space-y-1.5">
        <label class="text-sm font-medium text-foreground">Name (optional override)</label>
        <Input
          v-model="activationName"
          type="text"
          autocomplete="name"
          placeholder="Jane Doe"
          :disabled="activating"
          class="h-10 bg-background"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-sm font-medium text-foreground">Password</label>
        <div class="relative">
          <Input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="Create a strong password"
            required
            :disabled="activating"
            class="h-10 bg-background pr-10"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="16" />
          </button>
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="text-sm font-medium text-foreground">Confirm password</label>
        <div class="relative">
          <Input
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="Re-enter your password"
            required
            :disabled="activating"
            class="h-10 bg-background pr-10"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showConfirmPassword"
            @click="showConfirmPassword = !showConfirmPassword"
          >
            <component :is="showConfirmPassword ? EyeOff : Eye" :size="16" />
          </button>
        </div>
      </div>

      <Button type="submit" class="h-10 w-full" :disabled="!canSubmitActivation">
        <Loader2 v-if="activating" :size="16" class="mr-2 animate-spin" />
        {{ activating ? 'Activating invite...' : 'Activate account and join' }}
      </Button>
    </form>

    <div v-else class="space-y-5 rounded-xl border border-border bg-background p-5 text-center">
      <div
        class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full"
        :class="success ? 'bg-emerald-500/15 text-emerald-600' : 'bg-destructive/15 text-destructive'"
      >
        <CheckCircle2 v-if="success" :size="22" />
        <span v-else class="text-xl font-bold">!</span>
      </div>

      <div>
        <p class="text-base font-semibold text-foreground">
          {{ success ? 'Invite accepted' : 'Invite could not be accepted' }}
        </p>
        <p class="mt-1 text-sm text-muted-foreground">{{ success ? successMessage : errorMessage }}</p>
      </div>

      <div class="flex justify-center gap-3">
        <Button v-if="success" type="button" class="h-10" @click="continueAfterAccept">
          Continue
        </Button>
        <Button v-else type="button" variant="outline" class="h-10" @click="router.push('/login')">
          Back to login
        </Button>
      </div>
    </div>
  </AuthShell>
</template>
