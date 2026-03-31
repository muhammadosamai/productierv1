<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckCircle2, Loader2 } from 'lucide-vue-next'
import AuthShell from '@/components/auth/AuthShell.vue'
import { Button } from '@/components/ui/button'
import { useOnboardingStore } from '@/stores/onboarding'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const onboardingStore = useOnboardingStore()

const loading = ref(true)
const success = ref(false)
const message = ref<string | null>(null)

const inviteToken = computed(() => {
  const raw = route.query.token
  return typeof raw === 'string' ? raw.trim() : ''
})

async function acceptInvite() {
  if (!authStore.isAuthenticated) {
    router.replace({
      path: '/login',
      query: {
        redirect: route.fullPath,
      },
    })
    return
  }

  if (!inviteToken.value) {
    loading.value = false
    message.value = 'Invalid invite link.'
    return
  }

  const accepted = await onboardingStore.acceptInvite(inviteToken.value)
  loading.value = false
  success.value = accepted
  if (!accepted) {
    message.value = onboardingStore.error || 'Could not accept invite.'
    return
  }
  message.value = 'Invite accepted. Your organization access is now active.'
}

function continueAfterAccept() {
  if (onboardingStore.isOnboardingComplete) {
    router.push('/home')
    return
  }
  router.push('/onboarding')
}

onMounted(() => {
  acceptInvite()
})
</script>

<template>
  <AuthShell
    title="Accept Organization Invite"
    subtitle="We are validating your invite and applying your membership."
  >
    <div v-if="loading" class="flex min-h-[180px] items-center justify-center">
      <Loader2 :size="20" class="animate-spin text-primary" />
    </div>

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
        <p class="mt-1 text-sm text-muted-foreground">{{ message }}</p>
      </div>

      <div class="flex justify-center gap-3">
        <Button v-if="success" type="button" class="h-10" @click="continueAfterAccept">
          Continue
        </Button>
        <Button v-else type="button" variant="outline" class="h-10" @click="router.push('/onboarding')">
          Back to onboarding
        </Button>
      </div>
    </div>
  </AuthShell>
</template>
