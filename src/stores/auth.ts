import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/user'
import { useRouter } from 'vue-router'

const API_BASE = '/api'
const TOKEN_KEY = 'productier_token'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        error.value = data.error || 'Login failed'
        return false
      }
      token.value = data.token
      user.value = data.user
      localStorage.setItem(TOKEN_KEY, data.token)
      return true
    } catch (e) {
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(name: string, email: string, password: string, role?: string, inviteToken?: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const payload: Record<string, string> = { name, email, password }
      if (role) payload.role = role
      if (inviteToken) payload.inviteToken = inviteToken
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        error.value = data.error || 'Registration failed'
        return false
      }
      token.value = data.token
      user.value = data.user
      localStorage.setItem(TOKEN_KEY, data.token)
      return true
    } catch (e) {
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function forgotPassword(email: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        error.value = data.error || 'Request failed'
        return false
      }
      return true
    } catch (e) {
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchMe(): Promise<boolean> {
    const storedToken = token.value || localStorage.getItem(TOKEN_KEY)
    if (!storedToken) return false

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
      if (!res.ok) {
        logout()
        return false
      }
      const data = await res.json()
      user.value = data
      token.value = storedToken
      return true
    } catch {
      logout()
      return false
    }
  }

  async function updateProfile(data: { name?: string; email?: string; avatar?: string }): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        error.value = result.error || 'Update failed'
        return false
      }
      user.value = result
      return true
    } catch (e) {
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function init() {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    if (storedToken) {
      token.value = storedToken
      await fetchMe()
    }
    initialized.value = true
  }

  return {
    user, token, loading, error, isAuthenticated, initialized,
    login, register, forgotPassword, fetchMe, updateProfile, logout, init,
  }
})
