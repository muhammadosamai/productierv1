import type { Elysia } from 'elysia'
import { decodeProtectedHeader } from 'jose'
import { describe, expect, it } from 'vitest'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

const tinyPngBytes = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 10, 73, 68, 65,
  84, 120, 156, 99, 96, 0, 0, 0,
  2, 0, 1, 229, 39, 212, 162, 0,
  0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130,
])

async function multipartRequest(
  app: Elysia,
  path: string,
  token: string,
  form: FormData,
): Promise<{ status: number; body: any }> {
  const response = await app.handle(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: form,
  }))

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

describe('runtime hardening smoke', () => {
  it('issues JWT and verifies protected auth/me route', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')
    const header = decodeProtectedHeader(token)

    expect(header.alg).toBe('RS256')
    expect(typeof header.kid).toBe('string')
    expect(String(header.kid || '')).not.toHaveLength(0)

    const meResponse = await apiRequest(app, '/api/auth/me', {
      method: 'GET',
      token,
    })

    expect(meResponse.status).toBe(200)
    expect(meResponse.body?.id).toBeTruthy()
    expect(meResponse.body?.email).toContain('@')
  })

  it('supports avatar/logo/task attachment uploads through storage adapter', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productResponse = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Storage Product ${Date.now()}`,
        description: 'storage smoke test',
      },
    })
    expect(productResponse.status).toBe(200)
    const productId = productResponse.body?.id as string
    expect(productId).toBeTruthy()

    const avatarForm = new FormData()
    avatarForm.append('file', new File([tinyPngBytes], 'avatar.png', { type: 'image/png' }))
    const avatarUpload = await multipartRequest(app, '/api/auth/upload-avatar', token, avatarForm)
    expect(avatarUpload.status).toBe(200)
    expect(String(avatarUpload.body?.avatar ?? '')).toContain('/uploads/avatars/')

    const logoForm = new FormData()
    logoForm.append('productId', productId)
    logoForm.append('file', new File([tinyPngBytes], 'logo.png', { type: 'image/png' }))
    const logoUpload = await multipartRequest(app, '/api/products/upload-logo', token, logoForm)
    expect(logoUpload.status).toBe(200)
    expect(String(logoUpload.body?.logo ?? '')).toContain('/uploads/logos/')

    const storyResponse = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Attachment Story',
        description: 'storage smoke',
        productId,
      },
    })
    expect(storyResponse.status).toBe(200)
    const storyId = storyResponse.body?.id as string

    const taskResponse = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
      method: 'POST',
      token,
      body: {
        title: 'Attachment Task',
      },
    })
    expect(taskResponse.status).toBe(200)
    const taskId = taskResponse.body?.id as string

    const attachmentForm = new FormData()
    attachmentForm.append(
      'file',
      new File([new TextEncoder().encode('attachment')], 'notes.txt', { type: 'text/plain' }),
    )
    const attachmentUpload = await multipartRequest(app, `/api/tasks/${taskId}/attachments`, token, attachmentForm)
    expect(attachmentUpload.status).toBe(200)
    expect(String(attachmentUpload.body?.filePath ?? '')).toContain('/uploads/attachments/')
  })

  it('creates and lists integration connections with encryption enabled', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productResponse = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Integrations Product ${Date.now()}`,
        description: 'integrations smoke test',
      },
    })
    expect(productResponse.status).toBe(200)
    const productId = productResponse.body?.id as string
    expect(productId).toBeTruthy()

    const connectResponse = await apiRequest(app, '/api/integrations/jira/connect', {
      method: 'POST',
      token,
      body: {
        productId,
        displayName: 'Jira Smoke Connection',
        credentials: {
          token: 'example-token',
        },
      },
    })
    expect(connectResponse.status).toBe(200)
    expect(connectResponse.body?.productId).toBe(productId)

    const listResponse = await apiRequest(
      app,
      `/api/integrations/connections?productId=${encodeURIComponent(productId)}`,
      {
        method: 'GET',
        token,
      },
    )
    expect(listResponse.status).toBe(200)
    expect(Array.isArray(listResponse.body)).toBe(true)
    expect(listResponse.body.some((item: { connectorKey: string }) => item.connectorKey === 'jira')).toBe(true)
  })
})

