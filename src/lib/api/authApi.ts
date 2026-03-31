import type { User } from '@/types/user'
import { apiJson } from '@/lib/api/core'
import type { AuthPayload } from '@/lib/apiClient'

export const authApi = {
  login(email: string, password: string) {
    return apiJson<AuthPayload>('/auth/login', {
      method: 'POST',
      json: { email, password },
    })
  },
  register(
    name: string,
    email: string,
    password: string,
    options?: {
      organizationName?: string
      bootstrapOrganization?: boolean
    },
  ) {
    return apiJson<AuthPayload>('/auth/register', {
      method: 'POST',
      json: {
        name,
        email,
        password,
        organizationName: options?.organizationName,
        bootstrapOrganization: options?.bootstrapOrganization,
      },
    })
  },
  forgotPassword(email: string) {
    return apiJson<unknown>('/auth/forgot-password', {
      method: 'POST',
      json: { email },
    })
  },
  me(token?: string | null) {
    return apiJson<User>('/auth/me', { token })
  },
  updateProfile(data: { name?: string; email?: string; avatar?: string }, token?: string | null) {
    return apiJson<User>('/auth/profile', {
      method: 'PUT',
      token,
      json: data,
    })
  },
}
