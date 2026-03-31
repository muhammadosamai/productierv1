<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthShell from '@/components/auth/AuthShell.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Eye, EyeOff } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()

const envFlags = import.meta.env as Record<string, string | undefined>
const onboardingEnabled = String(
  envFlags.VITE_NEW_ONBOARDING_ENABLED
  ?? envFlags.NEW_ONBOARDING_ENABLED
  ?? 'true',
).toLowerCase() !== 'false'

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const localError = ref('')
const nameInputId = 'register-name'
const emailInputId = 'register-email'
const passwordInputId = 'register-password'
const confirmPasswordInputId = 'register-confirm-password'

const passwordToggleLabel = computed(() => (
  showPassword.value ? 'Hide password' : 'Show password'
))

async function handleSubmit() {
  localError.value = ''

  if (password.value !== confirmPassword.value) {
    localError.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 6) {
    localError.value = 'Password must be at least 6 characters'
    return
  }

  const success = await authStore.register(name.value, email.value, password.value)
  if (success) {
    router.push(onboardingEnabled ? '/onboarding' : '/')
  }
}

function displayError() {
  return localError.value || authStore.error || ''
}
</script>

<template>
  <AuthShell
    title="Create your account"
    subtitle="Set up your access first. Organization onboarding starts right after signup."
  >
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <div
        v-if="displayError()"
        role="alert"
        aria-live="polite"
        class="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {{ displayError() }}
      </div>

      <div class="space-y-1.5">
        <label :for="nameInputId" class="text-sm font-medium text-foreground">Full Name</label>
        <Input
          :id="nameInputId"
          v-model="name"
          type="text"
          placeholder="John Doe"
          autocomplete="name"
          autofocus
          required
          class="h-11 bg-background"
        />
      </div>

      <div class="space-y-1.5">
        <label :for="emailInputId" class="text-sm font-medium text-foreground">Work Email</label>
        <Input
          :id="emailInputId"
          v-model="email"
          type="email"
          placeholder="you@company.com"
          autocomplete="email"
          required
          class="h-11 bg-background"
        />
      </div>

      <div class="space-y-1.5">
        <label :for="passwordInputId" class="text-sm font-medium text-foreground">Password</label>
        <div class="relative">
          <Input
            :id="passwordInputId"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="At least 6 characters"
            autocomplete="new-password"
            required
            class="h-11 bg-background pr-10"
          />
          <button
            type="button"
            :aria-label="passwordToggleLabel"
            :aria-pressed="showPassword"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? EyeOff : Eye" :size="16" />
          </button>
        </div>
      </div>

      <div class="space-y-1.5">
        <label :for="confirmPasswordInputId" class="text-sm font-medium text-foreground">Confirm Password</label>
        <Input
          :id="confirmPasswordInputId"
          v-model="confirmPassword"
          type="password"
          placeholder="Re-enter your password"
          autocomplete="new-password"
          required
          class="h-11 bg-background"
        />
      </div>

      <Button
        type="submit"
        class="h-11 w-full"
        :disabled="authStore.loading || !name || !email || !password || !confirmPassword"
      >
        <Loader2 v-if="authStore.loading" :size="16" class="mr-2 animate-spin" />
        {{ authStore.loading ? 'Creating account...' : 'Create Account' }}
      </Button>
    </form>

    <template #footer>
      <p class="text-center text-sm text-muted-foreground">
        Already have an account?
        <router-link to="/login" class="font-medium text-primary hover:text-primary/80">
          Sign in
        </router-link>
      </p>
    </template>
  </AuthShell>
</template>
