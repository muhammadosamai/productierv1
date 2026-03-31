import type { users } from '../db/schema'
import { getAuthenticatedUser } from './authz'
import { unauthorized, type ApiErrorResponse, type RouteSet } from './apiErrors'

type JwtVerify = (token: string) => Promise<any> | any
type HeaderBag = Record<string, string | undefined>

export type AuthenticatedUser = typeof users.$inferSelect

export async function getUserFromHeader(
  jwtVerify: JwtVerify,
  headers: HeaderBag
): Promise<AuthenticatedUser | null> {
  return getAuthenticatedUser(jwtVerify as any, headers)
}

export async function requireUser(
  jwtVerify: JwtVerify,
  headers: HeaderBag,
  set: RouteSet
): Promise<{ user: AuthenticatedUser | null; error: ApiErrorResponse | null }> {
  const user = await getUserFromHeader(jwtVerify, headers)
  if (!user) {
    return { user: null, error: unauthorized(set) }
  }

  return { user, error: null }
}
