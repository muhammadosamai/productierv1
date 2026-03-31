import type { Elysia } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { users } from '../../src/db/schema'
import { TEST_APP_BASE_URL, TEST_AUTH_PASSWORD } from './testConfig'
import './testDb'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  token?: string
  body?: unknown
  headers?: Record<string, string>
}

let accountCounter = 0

function buildRequestUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${TEST_APP_BASE_URL}${normalizedPath}`
}

export async function createTestApp() {
  const { createApp } = await import('../../src/index')
  return createApp()
}

export async function apiRequest(
  app: Elysia,
  path: string,
  options: RequestOptions = {}
) {
  const method = options.method || 'GET'
  const headers: Record<string, string> = { ...(options.headers || {}) }

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  }

  let body: string | undefined
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const response = await app.handle(
    new Request(buildRequestUrl(path), {
      method,
      headers,
      body,
    })
  )

  const text = await response.text()
  let parsedBody: any = null
  if (text) {
    try {
      parsedBody = JSON.parse(text)
    } catch {
      parsedBody = text
    }
  }

  return {
    status: response.status,
    body: parsedBody,
  }
}

export async function registerAndLogin(
  app: Elysia,
  role:
    | 'super_admin'
    | 'admin'
    | 'product_admin'
    | 'product_manager'
    | 'business_analyst'
    | 'developer'
    | 'viewer' = 'super_admin'
) {
  accountCounter += 1
  const suffix = `${Date.now()}-${accountCounter}`
  const email = `integration-${suffix}@productier.test`
  const password = TEST_AUTH_PASSWORD

  const registerBody: Record<string, unknown> = {
    name: `Integration User ${accountCounter}`,
    email,
    password,
  }
  if (role === 'viewer') {
    registerBody.role = 'viewer'
  }

  const registerResponse = await apiRequest(app, '/api/auth/register', {
    method: 'POST',
    body: registerBody,
  })

  if (registerResponse.status >= 400) {
    throw new Error(`Registration failed: ${JSON.stringify(registerResponse.body)}`)
  }

  const registeredUserId = registerResponse.body?.user?.id as string | undefined
  if (registeredUserId && role !== 'viewer') {
    await db.update(users)
      .set({ role })
      .where(eq(users.id, registeredUserId))
  }

  const loginResponse = await apiRequest(app, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })

  if (loginResponse.status >= 400 || !loginResponse.body?.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginResponse.body)}`)
  }

  return {
    token: loginResponse.body.token as string,
    user: loginResponse.body.user,
  }
}
