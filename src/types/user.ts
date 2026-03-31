export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'product_admin'
  | 'product_manager'
  | 'business_analyst'
  | 'developer'
  | 'viewer'

export interface UserTitle {
  id: string
  key: string
  name: string
  isActive: boolean
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  title?: UserTitle | null
  titleId?: string | null
  isActive: boolean
  avatar: string | null
  createdAt: string
  updatedAt?: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  organizationName?: string
  bootstrapOrganization?: boolean
  role?: UserRole
}
