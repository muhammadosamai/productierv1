<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-vue-next'

const authStore = useAuthStore()

const email = ref('')
const sent = ref(false)

async function handleSubmit() {
  const success = await authStore.forgotPassword(email.value)
  if (success) {
    sent.value = true
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center" style="background-color: #F8FAFF">
    <div class="w-full max-w-[420px] px-6">
      <!-- Logo & Title -->
      <div class="text-center mb-8">
        <img src="/logo.png" alt="Productier" class="w-14 h-14 rounded-2xl mb-4 shadow-lg shadow-[#7C5CFC]/20 mx-auto block" />
        <h1 class="text-2xl font-bold text-gray-900">Forgot password?</h1>
        <p class="text-sm text-gray-500 mt-1">No worries, we'll send you reset instructions</p>
      </div>

      <!-- Form Card -->
      <div class="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <!-- Success state -->
        <div v-if="sent" class="text-center space-y-4">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50">
            <CheckCircle2 :size="24" class="text-green-500" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">Check your email</p>
            <p class="text-sm text-gray-500 mt-1">
              If an account with <span class="font-medium text-gray-700">{{ email }}</span> exists, we've sent a password reset link.
            </p>
          </div>
          <router-link
            to="/login"
            class="inline-flex items-center gap-1.5 text-sm text-[#7C5CFC] hover:text-[#6B4CE0] font-medium mt-2"
          >
            <ArrowLeft :size="14" />
            Back to Sign In
          </router-link>
        </div>

        <!-- Form state -->
        <form v-else @submit.prevent="handleSubmit" class="space-y-5">
          <!-- Error message -->
          <div v-if="authStore.error" class="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p class="text-sm text-red-600">{{ authStore.error }}</p>
          </div>

          <!-- Email -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Email</label>
            <Input
              v-model="email"
              type="email"
              placeholder="Enter your email"
              autofocus
              required
            />
          </div>

          <!-- Submit -->
          <Button
            type="submit"
            class="w-full bg-[#7C5CFC] hover:bg-[#6B4CE0] h-11 text-sm font-medium"
            :disabled="authStore.loading || !email"
          >
            <Loader2 v-if="authStore.loading" :size="16" class="animate-spin mr-2" />
            {{ authStore.loading ? 'Sending...' : 'Send Reset Link' }}
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
