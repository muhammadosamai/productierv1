export const publicUserColumns = {
  id: true,
  name: true,
  avatar: true,
} as const

export interface PublicUser {
  id: string
  name: string
  avatar: string | null
}

export function toPublicUser(
  user: { id: string; name: string; avatar: string | null } | null | undefined
): PublicUser | null {
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
  }
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const [localPart, domain] = email.split('@')
  if (!domain || localPart.length === 0) return null
  const first = localPart[0]
  return `${first}***@${domain}`
}
