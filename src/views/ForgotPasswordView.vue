<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AuthShell from '@/components/auth/AuthShell.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-vue-next'

const authStore = useAuthStore()

const email = ref('')
const sent = ref(false)
const emailInputId = 'forgot-password-email'

async function handleSubmit() {
  const success = await authStore.forgotPassword(email.value)
  if (success) {
    sent.value = true
  }
}
</script>

<template>
  <AuthShell
    title="Forgot your password?"
    subtitle="We'll send reset instructions if an account matches your email."
  >
    <div v-if="sent" class="space-y-4 rounded-lg border border-border bg-background p-5 text-center">
      <div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CheckCircle2 :size="24" />
      </div>
      <div class="space-y-1.5">
        <p class="text-sm font-semibold text-foreground">Check your email</p>
        <p class="text-sm text-muted-foreground">
          If an account with <span class="font-medium text-foreground">{{ email }}</span> exists, a password reset link has been sent.
        </p>
      </div>
      <router-link to="/login" class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80">
        <ArrowLeft :size="14" />
        Back to Sign In
      </router-link>
    </div>

    <form v-else @submit.prevent="handleSubmit" class="space-y-5">
      <div
        v-if="authStore.error"
        role="alert"
        aria-live="polite"
        class="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {{ authStore.error }}
      </div>

      <div class="space-y-1.5">
        <label :for="emailInputId" class="text-sm font-medium text-foreground">Email</label>
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

      <Button
        type="submit"
        class="h-11 w-full"
        :disabled="authStore.loading || !email"
      >
        <Loader2 v-if="authStore.loading" :size="16" class="mr-2 animate-spin" />
        {{ authStore.loading ? 'Sending...' : 'Send Reset Link' }}
      </Button>
    </form>

    <template #footer>
      <p class="text-center">
        <router-link to="/login" class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft :size="14" />
          Back to Sign In
        </router-link>
      </p>
    </template>
  </AuthShell>
</template>
