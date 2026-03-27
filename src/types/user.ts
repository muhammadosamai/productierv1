export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'product_admin'
  | 'product_manager'
  | 'business_analyst'
  | 'developer'
  | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar: string | null
  createdAt: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  role?: UserRole
}
