<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Eye, EyeOff } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const productStore = useProductStore()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const localError = ref('')

const inviteToken = ref<string | null>(null)
const inviteProduct = ref<string | null>(null)
const inviteLoading = ref(false)

onMounted(async () => {
  const token = route.query.invite as string | undefined
  if (token) {
    inviteToken.value = token
    inviteLoading.value = true
    try {
      const res = await fetch(`/api/invites/info/${token}`)
      if (res.ok) {
        const data = await res.json()
        email.value = data.email
        inviteProduct.value = data.product
      }
    } catch {}
    inviteLoading.value = false
  }
})

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

  const success = await authStore.register(name.value, email.value, password.value, undefined, inviteToken.value || undefined)
  if (success) {
    await productStore.fetchProducts()
    router.push('/')
  }
}

const displayError = ref('')
function getError() {
  return localError.value || authStore.error || ''
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center" style="background-color: #F8FAFF">
    <div class="w-full max-w-[420px] px-6">
      <!-- Logo & Title -->
      <div class="text-center mb-8">
        <img src="/logo.png" alt="Productier" class="w-14 h-14 rounded-2xl mb-4 shadow-lg shadow-[#7C5CFC]/20 mx-auto block" />
        <h1 class="text-2xl font-bold text-gray-900">Create an account</h1>
        <p class="text-sm text-gray-500 mt-1">Get started with Productier</p>
      </div>

      <!-- Invite banner -->
      <div v-if="inviteProduct" class="bg-[#4857FE]/5 border border-[#4857FE]/20 rounded-xl px-5 py-3.5 mb-4">
        <p class="text-sm text-[#4857FE] font-medium">
          You've been invited to join <strong>{{ inviteProduct }}</strong>
        </p>
        <p class="text-xs text-gray-500 mt-0.5">Create an account to accept the invitation</p>
      </div>

      <!-- Form Card -->
      <div class="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Error message -->
          <div v-if="getError()" class="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p class="text-sm text-red-600">{{ getError() }}</p>
          </div>

          <!-- Name -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Full Name</label>
            <Input
              v-model="name"
              type="text"
              placeholder="John Doe"
              autofocus
              required
            />
          </div>

          <!-- Email -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Email</label>
            <Input
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
              :readonly="!!inviteToken"
              :class="inviteToken ? 'bg-gray-50 text-gray-500' : ''"
            />
          </div>

          <!-- Password -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Password</label>
            <div class="relative">
              <Input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="At least 6 characters"
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
            :disabled="authStore.loading || !name || !email || !password || !confirmPassword"
          >
            <Loader2 v-if="authStore.loading" :size="16" class="animate-spin mr-2" />
            {{ authStore.loading ? 'Creating account...' : 'Create Account' }}
          </Button>
        </form>
      </div>

      <!-- Footer link -->
      <p class="text-center text-sm text-gray-500 mt-6">
        Already have an account?
        <router-link to="/login" class="text-[#7C5CFC] hover:text-[#6B4CE0] font-medium">
          Sign In
        </router-link>
      </p>
    </div>
  </div>
</template>
