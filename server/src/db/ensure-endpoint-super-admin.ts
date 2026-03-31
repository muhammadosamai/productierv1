import postgres from 'postgres'
import { randomBytes } from 'node:crypto'

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

async function login(baseUrl: string, email: string, password: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

async function register(baseUrl: string, name: string, email: string, password: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.API_BASE_URL || 'http://127.0.0.1:3001')
  const email = (process.env.API_EMAIL || 'endpoint.admin@productier.test').trim()
  const configuredPassword = (process.env.API_PASSWORD || '').trim()
  const generatedPassword = randomBytes(24).toString('base64url')
  const password = configuredPassword || generatedPassword
  const name = (process.env.API_NAME || 'Endpoint Admin').trim()
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.')
  }
  if (!email || !password) {
    throw new Error('API_EMAIL and API_PASSWORD must be non-empty.')
  }
  if (!configuredPassword) {
    console.warn('[endpoint-harness] API_PASSWORD is not set. Using generated ephemeral password for this run.')
  }

  let loginRes = await login(baseUrl, email, password)
  if (!loginRes.ok) {
    const registerRes = await register(baseUrl, name, email, password)
    if (!registerRes.ok && registerRes.status !== 409) {
      const detail = await registerRes.text()
      throw new Error(`Failed to register harness user (status=${registerRes.status}): ${detail}`)
    }
    loginRes = await login(baseUrl, email, password)
    if (!loginRes.ok) {
      const detail = await loginRes.text()
      throw new Error(`Failed to log in harness user (status=${loginRes.status}): ${detail}`)
    }
  }

  const sql = postgres(databaseUrl, { prepare: false })
  try {
    await sql`
      UPDATE users
      SET role = 'admin', is_active = true
      WHERE email = ${email}
    `
    const rows = await sql`
      SELECT role, is_active
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `
    const user = rows[0] as { role?: string; is_active?: boolean } | undefined
    if (!user) {
      throw new Error(`No user row found for ${email}`)
    }
    console.log(`[endpoint-harness] ensured user: ${email}`)
    console.log(`[endpoint-harness] role=${user.role} active=${String(user.is_active)}`)
    console.log(`[endpoint-harness] API_EMAIL=${email}`)
    console.log('[endpoint-harness] API_PASSWORD is set via environment or ephemeral runtime secret (not logged).')
  } finally {
    await sql.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[endpoint-harness] setup failed', error)
    process.exit(1)
  })
