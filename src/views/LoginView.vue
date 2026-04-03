<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Eye, EyeOff } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const productStore = useProductStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)

async function handleSubmit() {
  const success = await authStore.login(email.value, password.value)
  if (success) {
    await productStore.fetchProducts()
    router.push('/')
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center" style="background-color: #F8FAFF">
    <div class="w-full max-w-[420px] px-6">
      <!-- Logo & Title -->
      <div class="text-center mb-8">
        <img src="/logo.png" alt="Productier" class="w-14 h-14 rounded-2xl mb-4 shadow-lg shadow-[#7C5CFC]/20 mx-auto block" />
        <h1 class="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p class="text-sm text-gray-500 mt-1">Sign in to your Productier account</p>
      </div>

      <!-- Form Card -->
      <div class="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <form @submit.prevent="handleSubmit" class="space-y-5">
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
              placeholder="you@example.com"
              autofocus
              required
            />
          </div>

          <!-- Password -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-gray-700">Password</label>
              <router-link
                to="/forgot-password"
                class="text-xs text-[#7C5CFC] hover:text-[#6B4CE0] font-medium"
              >
                Forgot password?
              </router-link>
            </div>
            <div class="relative">
              <Input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                required
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

          <!-- Submit -->
          <Button
            type="submit"
            class="w-full bg-[#7C5CFC] hover:bg-[#6B4CE0] h-11 text-sm font-medium"
            :disabled="authStore.loading || !email || !password"
          >
            <Loader2 v-if="authStore.loading" :size="16" class="animate-spin mr-2" />
            {{ authStore.loading ? 'Signing in...' : 'Sign In' }}
          </Button>
        </form>
      </div>

      <!-- Footer link -->
      <p class="text-center text-sm text-gray-500 mt-6">
        Don't have an account?
        <router-link to="/register" class="text-[#7C5CFC] hover:text-[#6B4CE0] font-medium">
          Sign Up
        </router-link>
      </p>
    </div>
  </div>
</template>
