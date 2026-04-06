<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Eye, EyeOff, CheckCircle2, ArrowLeft, AlertTriangle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const success = ref(false)
const token = ref('')

onMounted(() => {
  token.value = (route.query.token as string) || ''
  if (!token.value) {
    error.value = 'No reset token provided. Please use the link from your email.'
  }
})

async function handleSubmit() {
  error.value = ''

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 6) {
    error.value = 'Password must be at least 6 characters'
    return
  }

  loading.value = true
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.value, newPassword: password.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Reset failed'
      return
    }
    success.value = true
  } catch {
    error.value = 'Network error. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center" style="background-color: #F8FAFF">
    <div class="w-full max-w-[420px] px-6">
      <!-- Logo & Title -->
      <div class="text-center mb-8">
        <img src="/logo.png" alt="Productier" class="w-14 h-14 rounded-2xl mb-4 shadow-lg shadow-[#7C5CFC]/20 mx-auto block" />
        <h1 class="text-2xl font-bold text-gray-900">Reset your password</h1>
        <p class="text-sm text-gray-500 mt-1">Choose a new password for your account</p>
      </div>

      <!-- Form Card -->
      <div class="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <!-- Success state -->
        <div v-if="success" class="text-center space-y-4">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50">
            <CheckCircle2 :size="24" class="text-green-500" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">Password reset successful</p>
            <p class="text-sm text-gray-500 mt-1">You can now sign in with your new password.</p>
          </div>
          <router-link
            to="/login"
            class="inline-flex items-center gap-1.5 text-sm text-[#7C5CFC] hover:text-[#6B4CE0] font-medium mt-2"
          >
            <ArrowLeft :size="14" />
            Go to Sign In
          </router-link>
        </div>

        <!-- No token state -->
        <div v-else-if="!token" class="text-center space-y-4">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50">
            <AlertTriangle :size="24" class="text-amber-500" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">Invalid reset link</p>
            <p class="text-sm text-gray-500 mt-1">{{ error }}</p>
          </div>
          <router-link
            to="/forgot-password"
            class="inline-flex items-center gap-1.5 text-sm text-[#7C5CFC] hover:text-[#6B4CE0] font-medium mt-2"
          >
            Request a new link
          </router-link>
        </div>

        <!-- Form state -->
        <form v-else @submit.prevent="handleSubmit" class="space-y-5">
          <!-- Error message -->
          <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p class="text-sm text-red-600">{{ error }}</p>
          </div>

          <!-- New Password -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">New Password</label>
            <div class="relative">
              <Input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="At least 6 characters"
                required
                autofocus
                class="pr-10"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                @click="showPassword = !showPassword"
              >
                <component :is="showPassword ? EyeOff : Eye" :size="16" />
              </button>
            </div>
          </div>

          <!-- Confirm Password -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Confirm Password</label>
            <Input
              v-model="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              required
            />
          </div>

          <!-- Submit -->
          <Button
            type="submit"
            class="w-full bg-[#7C5CFC] hover:bg-[#6B4CE0] h-11 text-sm font-medium"
            :disabled="loading || !password || !confirmPassword"
          >
            <Loader2 v-if="loading" :size="16" class="animate-spin mr-2" />
            {{ loading ? 'Resetting...' : 'Reset Password' }}
          </Button>
        </form>
      </div>

      <!-- Footer link -->
      <p class="text-center mt-6">
        <router-link
          to="/login"
          class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
        >
          <ArrowLeft :size="14" />
          Back to Sign In
        </router-link>
      </p>
    </div>
  </div>
</template>
