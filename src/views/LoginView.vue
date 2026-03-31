<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthShell from '@/components/auth/AuthShell.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Eye, EyeOff } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const emailInputId = 'login-email'
const passwordInputId = 'login-password'

const passwordToggleLabel = computed(() => (
  showPassword.value ? 'Hide password' : 'Show password'
))

const loginFeatureItems = [
  {
    title: 'Organization-wide visibility',
    description: 'Coordinate delivery work with shared priorities, ownership, and transparent status.',
  },
  {
    title: 'Execution at scale',
    description: 'Align stories, tasks, initiatives, and releases across teams without process drift.',
  },
  {
    title: 'Trusted access control',
    description: 'Use role-aware permissions and secure defaults designed for enterprise collaboration.',
  },
]

async function handleSubmit() {
  const success = await authStore.login(email.value, password.value)
  if (success) {
    const redirectPath = typeof route.query.redirect === 'string'
      ? route.query.redirect
      : '/'
    router.push(redirectPath)
  }
}
</script>

<template>
  <AuthShell
    title="Welcome back"
    subtitle="Sign in to continue managing delivery across your organization."
    hero-title="Run enterprise delivery with confidence"
    hero-description="Productier keeps strategy, execution, and governance aligned from intake to release."
    :feature-items="loginFeatureItems"
  >
    <form @submit.prevent="handleSubmit" class="space-y-5">
      <p class="text-xs leading-relaxed text-muted-foreground">
        Use your work email to access organization workspaces, planning context, and shared execution workflows.
      </p>

      <div
        v-if="authStore.error"
        role="alert"
        aria-live="polite"
        class="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {{ authStore.error }}
      </div>

      <div class="space-y-1.5">
        <label :for="emailInputId" class="text-sm font-medium text-foreground">Work Email</label>
        <Input
          :id="emailInputId"
          v-model="email"
          type="email"
          placeholder="you@company.com"
          autocomplete="email"
          autofocus
          required
          class="h-11 bg-background"
        />
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label :for="passwordInputId" class="text-sm font-medium text-foreground">Password</label>
          <router-link to="/forgot-password" class="text-xs font-medium text-primary hover:text-primary/80">
            Forgot password?
          </router-link>
        </div>

        <div class="relative">
          <Input
            :id="passwordInputId"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Enter your password"
            autocomplete="current-password"
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

      <Button
        type="submit"
        class="h-11 w-full"
        :disabled="authStore.loading || !email || !password"
      >
        <Loader2 v-if="authStore.loading" :size="16" class="mr-2 animate-spin" />
        {{ authStore.loading ? 'Signing you in...' : 'Sign in to Productier' }}
      </Button>

      <p class="text-center text-xs text-muted-foreground">
        Protected by organization-level access controls and secure workspace boundaries.
      </p>
    </form>

    <template #footer>
      <p class="text-center text-sm text-muted-foreground">
        No account yet?
        <router-link to="/register" class="font-medium text-primary hover:text-primary/80">
          Create one
        </router-link>
      </p>
    </template>
  </AuthShell>
</template>
